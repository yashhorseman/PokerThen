import type { AudioApi, Frame, PlayerId } from "@pokerthen/shared";
import type { GameSession } from "../socket/session";
import type { GameStore, StoreEvent } from "../store/gameStore";
import { IntentStore, reconcileIntent, isYourTurn } from "../store/intent";
import type { PrefsStore } from "../store/prefsStore";
import { soundsForTransition, TimerWatcher } from "./sounds";
import type { TableActionsImpl } from "../commands/tableActions";

export interface EffectsDeps {
  store: GameStore;
  session: GameSession;
  intents: IntentStore;
  prefs: PrefsStore;
  audio: () => AudioApi;
  actions: TableActionsImpl;
}

/** Per-frame side effects: pre-action auto-send, auto time bank, default RIT answer, sounds (SPEC 6.2, 18.1). */
export class EffectsController {
  private watcher = new TimerWatcher();
  private off: Array<() => void> = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  constructor(private d: EffectsDeps) {}

  start(): void {
    this.off.push(this.d.store.onEvent((e) => this.onEvent(e)));
    this.tickTimer = setInterval(() => this.timer(), 100);
  }
  stop(): void {
    this.off.forEach((f) => f());
    this.off = [];
    if (this.tickTimer) clearInterval(this.tickTimer);
  }

  private youId(): PlayerId {
    return this.d.store.getState().you?.id ?? "";
  }

  private timer(): void {
    const f = this.d.store.getState().frame;
    if (!f) return;
    if (this.watcher.check(f, this.youId(), this.d.store.clock.now())) this.d.audio().play("warning-beep");
  }

  private onEvent(e: StoreEvent): void {
    if (e.type === "chat") {
      const p = this.d.prefs.get();
      if (!e.own && e.message.playerID && !p.disableChatMessageBeep) this.d.audio().play("chat-beep");
      return;
    }
    if (e.type !== "frame") return;
    const you = this.youId();
    const { next } = e;
    const stored = this.d.intents.get();
    const sounds = soundsForTransition(e.kind === "registered" ? null : e.prev, next, { youId: you, hasStoredIntent: !!stored });
    const prefs = this.d.prefs.get();
    for (const s of sounds) this.d.audio().play(s);
    this.reconcile(next, you);
    // INTEGRATION: the time bank is auto-activated ONLY by W6 ActionArea (once per turn, when nothing is queued).
    // default run-it-twice answer
    if (next.turn.ritWaiting && prefs.defaultRunItTwice != null && next.turn.ritVotes[you] === undefined && !this.d.store.getState().ritAnswered) {
      this.d.actions.voteRunItTwice(prefs.defaultRunItTwice);
    }
    // reset the 750 ms lock on a new turn
    if (e.prev?.turn.actionStartedAt !== next.turn.actionStartedAt && this.d.store.getState().lockedUntil) this.d.store.setLockedUntil(0);
  }

  private reconcile(frame: Frame, you: PlayerId): void {
    const r = reconcileIntent(this.d.intents.get(), frame, you);
    if (r.intent !== this.d.intents.get()) this.d.intents.set(r.intent);
    if (r.send) this.d.session.sendAction(r.send);
  }
}
