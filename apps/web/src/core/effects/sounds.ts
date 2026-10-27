import { T, type Frame, type PlayerId, type SoundName } from "@pokerthen/shared";

export interface SoundCtx {
  youId: PlayerId;
  hasStoredIntent: boolean;
}

/** Sounds triggered by a frame transition (SPEC 18.1). card-place is triggered by W5 per flip; warning-beep by TimerWatcher. */
export function soundsForTransition(prev: Frame | null, next: Frame, c: SoundCtx): SoundName[] {
  if (!prev) return []; // snapshot replay: silent
  const out: SoundName[] = [];
  const pb = prev.hand?.bets ?? {};
  const nb = next.hand?.bets ?? {};
  const sameHand = prev.hand?.handId === next.hand?.handId;
  let check = false;
  let chips = false;
  for (const [id, v] of Object.entries(nb)) {
    const old = sameHand ? pb[id] : undefined;
    if (v === old) continue;
    if (v === "check") check = true;
    else if (typeof v === "number" && v > 0 && v !== old) chips = true;
  }
  if (check) out.push("two-taps");
  if (chips) out.push("chips");
  const pps = sameHand ? (prev.hand?.playerStatus ?? {}) : {};
  for (const [id, s] of Object.entries(next.hand?.playerStatus ?? {})) if (s === "fold" && pps[id] !== "fold") { out.push("fold"); break; }
  const g = next.result?.[c.youId];
  if (g && (g.gained > 0 || Object.values(g.runs).some((r) => r?.winning)) && !prev.result?.[c.youId]) out.push("winner");
  if (next.turn.taking === c.youId && (prev.turn.taking !== c.youId || prev.turn.actionStartedAt !== next.turn.actionStartedAt) && !c.hasStoredIntent && next.table.pausedAt == null) out.push("beep");
  const pCount = Object.values(prev.players).filter((p) => p.status === "requestedGameIngress").length;
  const nCount = Object.values(next.players).filter((p) => p.status === "requestedGameIngress").length;
  if (next.table.ownerId === c.youId && nCount > pCount) out.push("new-player-beep");
  return out;
}

/** Warning beep once per phase when your timer is > 70% consumed (normal time, then again for the bank). */
export class TimerWatcher {
  private key = "";
  private fired = { normal: false, bank: false };
  /** returns true when the beep should play */
  check(frame: Frame, youId: PlayerId, now: number): boolean {
    const t = frame.turn;
    if (t.taking !== youId || t.actionStartedAt == null || t.deadlineNoBank == null || t.deadlineWithBank == null || frame.table.pausedAt != null) return false;
    const key = `${frame.table.handNumber}:${t.actionStartedAt}`;
    if (key !== this.key) {
      this.key = key;
      this.fired = { normal: false, bank: false };
    }
    const elapsed = now - t.actionStartedAt;
    const regular = t.deadlineNoBank - t.actionStartedAt;
    const bank = t.deadlineWithBank - t.deadlineNoBank;
    if (regular > 0 && !this.fired.normal && Math.min(elapsed, regular) / regular > T.WARNING_BEEP_FRACTION) {
      this.fired.normal = true;
      return true;
    }
    if (bank > 0 && elapsed > regular && !this.fired.bank && (elapsed - regular) / bank > T.WARNING_BEEP_FRACTION) {
      this.fired.bank = true;
      return true;
    }
    return false;
  }
}
