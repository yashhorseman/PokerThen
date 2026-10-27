import type { AudioApi, Frame, Orientation, Prefs, SoundName, TableViewModel, BetPanelVM, ConnectionVM } from "@pokerthen/shared";
import { HttpApi, type HttpDeps } from "./api/client";
import { orientationStore } from "./canvas/orientation";
import { TableActionsImpl } from "./commands/tableActions";
import { EffectsController } from "./effects/controller";
import { GameSession, type SocketLike } from "./socket/session";
import { createBrowserSocket } from "./socket/transport";
import { GameStore, type GameState } from "./store/gameStore";
import { IntentStore } from "./store/intent";
import { PrefsStore } from "./store/prefsStore";
import { deriveBetPanel } from "./viewModel/betPanel";
import { currentBlinds, deriveViewModel, emptyViewModel } from "./viewModel/derive";
import { shareStructure } from "./util";

export interface RuntimeOptions {
  gameId: string;
  createSocket?: (url: string) => SocketLike;
  buildUrl?: (q: string) => string;
  http?: HttpApi;
  httpDeps?: HttpDeps;
  audio?: () => AudioApi;
  persistPrefs?: boolean;
  beforeConnect?: () => Promise<void> | void;
  onReload?: () => void;
  /** do not open a socket (fixtures / unit tests) */
  noConnect?: boolean;
}

const NOOP_AUDIO: AudioApi = { unlock() {}, play(_n: SoundName) {}, setVolume() {}, setSecondaryDisabled() {}, setChatBeepDisabled() {} };

/** Everything for one table session: store, socket session, prefs, intents, actions, effects, cached view model. */
export class GameRuntime {
  readonly store: GameStore;
  readonly session: GameSession;
  readonly prefs: PrefsStore;
  readonly intents = new IntentStore();
  readonly api: HttpApi;
  readonly actions: TableActionsImpl;
  readonly effects: EffectsController;
  private readonly audioGetter: () => AudioApi;
  private tickN = 0;
  private cache: { key: unknown[]; vm: TableViewModel; bet: BetPanelVM | null } | null = null;
  private listeners = new Set<() => void>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(readonly opts: RuntimeOptions) {
    this.store = new GameStore(opts.gameId);
    this.prefs = new PrefsStore(opts.persistPrefs ?? true);
    this.api = opts.http ?? new HttpApi(opts.gameId, opts.httpDeps);
    this.audioGetter = opts.audio ?? (() => NOOP_AUDIO);
    this.session = new GameSession({
      store: this.store,
      createSocket: opts.createSocket ?? createBrowserSocket,
      ...(opts.buildUrl ? { buildUrl: opts.buildUrl } : {}),
      layout: () => (orientationStore.get() === "portrait" ? "m" : "d"),
      onReload: opts.onReload ?? (() => location.reload()),
      ...(opts.beforeConnect ? { beforeConnect: opts.beforeConnect } : {})
    });
    this.actions = new TableActionsImpl({ store: this.store, session: this.session, api: this.api, intents: this.intents });
    this.effects = new EffectsController({ store: this.store, session: this.session, intents: this.intents, prefs: this.prefs, audio: this.audioGetter, actions: this.actions });
  }

  audio = (): AudioApi => this.audioGetter();

  start(): void {
    const a = this.audioGetter();
    const apply = (p: Prefs) => {
      a.setVolume(p.sound);
      a.setSecondaryDisabled(!!p.disableSecondarySounds);
      a.setChatBeepDisabled(!!p.disableChatMessageBeep);
    };
    apply(this.prefs.get());
    this.prefs.subscribe(apply);
    this.effects.start();
    // time-based refresh (countdown texts, bubbles expiry, 750 ms lock, show-hand window)
    this.tickTimer = setInterval(() => {
      const s = this.store.getState();
      const now = this.store.clock.now();
      const f = s.frame;
      const needs =
        Object.keys(s.bubbles).length > 0 ||
        s.lockedUntil > 0 ||
        !!f?.table.nextBlindAt ||
        !!f?.turn.ritWaiting ||
        !!f?.turn.rebuy ||
        f?.turn.nextStep === "FOAR" ||
        (f?.turn.nextStepAt != null && f.result !== null);
      if (s.bubbles && Object.keys(s.bubbles).length) this.store.pruneBubbles(now);
      if (s.lockedUntil && s.lockedUntil <= Date.now()) this.store.setLockedUntil(0);
      if (needs) {
        this.tickN++;
        this.listeners.forEach((l) => l());
      }
    }, 250);
    if (!this.opts.noConnect) this.session.start();
  }

  stop(): void {
    this.session.stop();
    this.effects.stop();
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    const offs = [this.store.subscribe(fn), this.intents.subscribe(fn), this.prefs.subscribe(fn), orientationStore.subscribe(fn)];
    return () => {
      this.listeners.delete(fn);
      offs.forEach((o) => o());
    };
  };

  private compute(): { vm: TableViewModel; bet: BetPanelVM | null } {
    const s: GameState = this.store.getState();
    const prefs = this.prefs.get();
    const intent = this.intents.get();
    const orientation: Orientation = orientationStore.get();
    const key = [s, prefs, intent, orientation, this.tickN];
    const c = this.cache;
    if (c && c.key.every((k, i) => k === key[i])) return c;
    const connection: ConnectionVM = s.connection;
    let vm: TableViewModel;
    let bet: BetPanelVM | null = null;
    if (!s.frame || !s.you) {
      vm = emptyViewModel(s.gameId, connection, orientation, prefs);
    } else {
      const frame: Frame = s.frame;
      vm = deriveViewModel(frame, s.prev, {
        prefs,
        serverNow: this.store.clock.now,
        orientation,
        connection,
        gameId: s.gameId,
        emojis: s.emojis,
        bubbles: s.bubbles,
        intent,
        lockedUntil: s.lockedUntil,
        ownCards: s.ownCards,
        ritLocal: s.ritAnswered && s.ritAnswered.handNumber === frame.table.handNumber ? s.ritAnswered.value : null,
        muted: s.you.mutedIds
      });
      bet = deriveBetPanel(frame, s.you.id, currentBlinds(frame).bb, vm.bbMode);
    }
    vm = shareStructure(c?.vm, vm);
    if (c && bet && c.bet && JSON.stringify({ ...bet, a: 0 }) === JSON.stringify({ ...c.bet, a: 0 })) bet = c.bet;
    this.cache = { key, vm, bet };
    return this.cache;
  }

  getVM = (): TableViewModel => this.compute().vm;
  getBetPanel = (): BetPanelVM | null => this.compute().bet;
}
