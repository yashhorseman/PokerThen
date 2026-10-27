import { COPY } from "@pokerthen/shared";
import type { ActionKind, ActionMsg, CardCode, Frame, GameConfig, PlayerId, RequestIngressBody, TableActions } from "@pokerthen/shared";
import { THROTTLE_MS } from "@pokerthen/shared";
import type { HttpApi } from "../api/client";
import type { GameSession } from "../socket/session";
import type { GameStore } from "../store/gameStore";
import { IntentStore, intentToAction, isYourTurn, makeIntent } from "../store/intent";
import { showAlert } from "../ui/overlay";

export interface ActionsDeps {
  store: GameStore;
  session: GameSession;
  api: HttpApi;
  intents: IntentStore;
  now?: () => number;
}

void COPY;

/** TableActions (ARCH 10.1): WS actions + HTTP calls with SPEC error handling. */
export class TableActionsImpl implements TableActions {
  private lastRit = 0;
  private readonly now: () => number;
  constructor(private readonly d: ActionsDeps) {
    this.now = d.now ?? (() => Date.now());
  }

  private frame(): Frame | null {
    return this.d.store.getState().frame;
  }
  private youId(): PlayerId {
    return this.d.store.getState().you?.id ?? "";
  }
  private send(a: ActionMsg): boolean {
    return this.d.session.sendAction(a);
  }

  /** locked 750 ms after any click on your turn (SPEC 6.1) */
  private lock(): void {
    this.d.store.setLockedUntil(this.now() + THROTTLE_MS.actionLock);
  }

  setIntendedAction = (kind: ActionKind | null, value?: number): void => {
    const f = this.frame();
    if (!f || kind === null) {
      this.d.intents.set(null);
      return;
    }
    const you = this.youId();
    if (this.d.store.getState().lockedUntil > this.now() && isYourTurn(f, you)) return;
    if (isYourTurn(f, you)) {
      this.send(intentToAction({ kind, ...(value !== undefined ? { value } : {}) }, f, you));
      this.d.intents.set(null);
      this.lock();
      return;
    }
    const cur = this.d.intents.get();
    // pressing the same stored action again clears it
    if (cur && cur.kind === kind && cur.value === value) this.d.intents.set(null);
    else this.d.intents.set(makeIntent(f, kind, value));
  };
  fold = () => this.setIntendedAction("fold");
  check = () => this.setIntendedAction("check");
  call = () => this.setIntendedAction("call");
  raise = (value: number) => this.setIntendedAction("raise", value);

  activateTimeBank = () => void this.send({ type: "ATB" });
  nextHand = () => void this.send({ type: "NH" });
  shuffleSeats = () => void this.send({ type: "RS" });
  pause = () => void this.send({ type: "UP" });
  unpause = () => void this.send({ type: "UR" });
  stopGame = (decision: boolean) => void this.send({ type: "TSG", decision });
  away = () => void this.send({ type: "SUNH" });
  sitBack = () => {
    const f = this.frame();
    const me = f?.players[this.youId()];
    if (me && me.stack === 0) {
      showAlert("You can't sit back without chips. Please add chips or request the game host to add chips for you.");
      return;
    }
    this.send({ type: "PLAYER_SIT_BACK" });
  };
  leaveSeat = (cancel?: boolean) => void this.send({ type: cancel ? "CQNH" : "QNH" });
  cancelIngress = () => void this.send({ type: "CANCEL_REQUEST_GAME_INGRESS" });
  voteRunItTwice = (decision: boolean) => {
    const t = this.now();
    if (t - this.lastRit < THROTTLE_MS.yesNo) return;
    this.lastRit = t;
    const f = this.frame();
    if (f?.hand) this.d.store.setRitAnswered(f.hand.handNumber, decision);
    this.send({ type: "DRITD", decision });
  };
  showHand = (card: "all" | CardCode) => void this.send({ type: "SHOW_HAND", cardToShow: card });
  revealRabbit = () => void this.send({ type: "RUC" });
  setAutoStraddle = (v: boolean) => void this.send({ type: "SSP", value: v });
  toggleMute = (playerId: PlayerId) => {
    const muted = this.d.store.getState().you?.mutedIds.includes(playerId) ?? false;
    this.d.store.setLocalMuted(playerId, !muted);
    this.send({ type: "TOGGLE_MUTE_PLAYER", otherPlayerID: playerId });
  };
  setEmoji = (emoji: string | null) => void this.send({ type: "ME", emoji });
  reconnect = () => this.d.session.reconnectNow();

  async sendChat(text: string): Promise<void> {
    const t = text.slice(0, 100);
    if (!t.trim() || !this.d.session.sendChat(t)) throw new Error("Something wrong happened. Please try again.");
  }

  async startGame(): Promise<void> {
    const r = await this.d.api.startGame();
    if (!r.ok) showAlert(r.value || "Not enough players to start the game."); // U-J2
  }

  requestSeat = (body: RequestIngressBody) => this.d.api.requestIngress(body);
  approvePlayer = async (id: PlayerId, stack?: number) => void (await this.d.api.approvePlayer(id, stack));
  rejectPlayer = async (id: PlayerId) => void (await this.d.api.rejectPlayer(id));
  updatePlayer = (id: PlayerId, mode: "ADD" | "REMOVE" | "SET", value: number) => this.d.api.updatePlayer(id, mode, value);
  removePlayer = (id: PlayerId) => this.d.api.removePlayer(id);
  transferOwnership = async (id: PlayerId) => void (await this.d.api.transferOwnership(id));
  putInAway = async (id: PlayerId) => void (await this.d.api.putInAway(id));
  toggleGodMode = async (id: PlayerId, allow: boolean) => void (await this.d.api.toggleGodMode(id, allow));
  updateGame = (config: GameConfig) => this.d.api.updateGame(config);
  requestRebuy = async (value: number) => void (await this.d.api.requestRebuy(value));
  resolveRebuy = async (id: PlayerId, approve: boolean, stack?: number) => void (await this.d.api.resolveRebuy(id, approve, stack));
}
