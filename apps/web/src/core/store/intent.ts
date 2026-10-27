import type { ActionKind, ActionMsg, Frame, PlayerId } from "@pokerthen/shared";

/** Pre-actions / intended actions (SPEC 6.2). */
export interface Intent {
  kind: ActionKind;
  value?: number;
  forHand: number;
  /** `${run}:${stage}` of the street it was stored on */
  forStreet: string;
  forHighest: number;
}

export function streetKey(frame: Frame): string {
  const s = frame.hand?.street;
  return s ? `${s.run}:${s.stage}` : "none";
}

export class IntentStore {
  private intent: Intent | null = null;
  private readonly subs = new Set<() => void>();
  get = (): Intent | null => this.intent;
  set(i: Intent | null): void {
    this.intent = i;
    for (const s of [...this.subs]) s();
  }
  subscribe = (fn: () => void): (() => void) => {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  };
}

export function numericBet(frame: Frame, id: PlayerId): number {
  const b = frame.hand?.bets[id];
  return typeof b === "number" ? b : 0;
}

/** A check is free: no bet to match, or you hold the big-blind option, or you are all in (SPEC 6.1). */
export function isFreeCheck(frame: Frame, youId: PlayerId): boolean {
  const hand = frame.hand;
  if (!hand) return false;
  const status = hand.playerStatus[youId];
  if (status === "allIn") return true;
  if (!hand.highestBet) return true;
  return hand.optionIds.includes(youId);
}

export function makeIntent(frame: Frame, kind: ActionKind, value?: number): Intent {
  return {
    kind,
    ...(value !== undefined ? { value } : {}),
    forHand: frame.table.handNumber,
    forStreet: streetKey(frame),
    forHighest: frame.hand?.highestBet ?? 0
  };
}

/** Maps an intended action to the wire message at send time. */
export function intentToAction(intent: { kind: ActionKind; value?: number }, frame: Frame, youId: PlayerId): ActionMsg {
  const hand = frame.hand;
  switch (intent.kind) {
    case "fold":
      return { type: "PLAYER_FOLD" };
    case "check":
      return { type: "PLAYER_CHECK" };
    case "call":
      return { type: "PLAYER_CALL" };
    case "raise": {
      const v = intent.value ?? 0;
      // confirm: v > H -> RAISE with the raise-to value; else CALL (SPEC 6.3)
      return v > (hand?.highestBet ?? 0) ? { type: "PLAYER_RAISE", value: v } : { type: "PLAYER_CALL" };
    }
    case "checkOrFold":
      return isFreeCheck(frame, youId) ? { type: "PLAYER_CHECK" } : { type: "PLAYER_FOLD" };
  }
}

export function isYourTurn(frame: Frame, youId: PlayerId): boolean {
  return frame.turn.taking === youId && frame.table.pausedAt == null && !!frame.hand;
}

export interface Reconciled {
  intent: Intent | null;
  /** message to send now (intent consumed) */
  send: ActionMsg | null;
}

/**
 * Applied on every frame (SPEC 6.2): drop stale intents (hand number / street changed, or check/call and the
 * highest bet changed); CHECK_OR_FOLD becomes FOLD when someone bets; on your turn the stored intent is sent.
 */
export function reconcileIntent(intent: Intent | null, frame: Frame, youId: PlayerId): Reconciled {
  if (!intent) return { intent: null, send: null };
  const hand = frame.hand;
  if (!hand || intent.forHand !== frame.table.handNumber || intent.forStreet !== streetKey(frame)) return { intent: null, send: null };
  const status = hand.playerStatus[youId];
  if (status === "fold" || status === "allIn" || !hand.inHandIds.includes(youId)) return { intent: null, send: null };
  let cur = intent;
  if (cur.forHighest !== hand.highestBet) {
    if (cur.kind === "check" || cur.kind === "call") return { intent: null, send: null };
    if (cur.kind === "checkOrFold") cur = { ...cur, forHighest: hand.highestBet };
    else if (cur.kind === "raise") cur = { ...cur, forHighest: hand.highestBet };
  }
  if (cur.kind === "checkOrFold" && hand.highestBet && !hand.optionIds.includes(youId)) cur = { ...cur, kind: "fold" };
  if (isYourTurn(frame, youId)) return { intent: null, send: intentToAction(cur, frame, youId) };
  return { intent: cur, send: null };
}
