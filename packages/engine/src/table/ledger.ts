/** Ledger arithmetic (SPEC 15.3): Net = buyOut + stack - buyIn; sessions per seat stint. */
import type { LedgerPlayerInfo, LedgerResponse, LedgerSession } from "@pokerthen/shared";
import type { PlayerRec, S, Session } from "../state.js";

export function openSession(s: S, p: PlayerRec, stack: number): Session {
  const sess: Session = { id: `s${++s.sessionSeq}`, buy_in: stack, buy_out: 0, start_hand_number: null, finish_hand_number: null, movements: [{ kind: "tookSeat", value: stack }], finished: false };
  p.sessions.push(sess);
  return sess;
}
export const curSession = (p: PlayerRec): Session | null => {
  const l = p.sessions[p.sessions.length - 1];
  return l && !l.finished ? l : null;
};
export function closeSession(p: PlayerRec, stack: number, handNo: number | null): void {
  const c = curSession(p);
  if (!c) return;
  c.buy_out += stack; c.movements.push({ kind: "quit", value: stack }); c.finished = true;
  c.finish_hand_number = handNo;
}
export function adjustStack(p: PlayerRec, mode: "ADD" | "REMOVE" | "SET", oldStack: number, newStack: number): void {
  const c = curSession(p);
  if (!c) return;
  if (mode === "ADD") { c.buy_in += newStack - oldStack; c.movements.push({ kind: "addStack", value: newStack - oldStack }); }
  else if (mode === "REMOVE") { c.buy_out += oldStack - newStack; c.movements.push({ kind: "removed", value: oldStack - newStack }); }
  else {
    if (newStack >= oldStack) c.buy_in += newStack - oldStack; else c.buy_out += oldStack - newStack;
    c.movements.push({ kind: "resetStack", value: newStack });
  }
}
export function markStarted(p: PlayerRec, handNo: number): void {
  const c = curSession(p);
  if (c && c.start_hand_number === null) c.start_hand_number = handNo;
}

export function sessionsOf(p: PlayerRec): LedgerSession[] {
  return p.sessions.map((x) => ({
    id: x.id, status: x.finished ? "finished" : x.start_hand_number === null ? "notStarted" : "playing",
    buy_in: x.buy_in, buy_out: x.buy_out, start_hand_number: x.start_hand_number, finish_hand_number: x.finish_hand_number,
    movements: x.movements.map((m) => ({ ...m }))
  }));
}

export function ledgerOf(s: S): LedgerResponse {
  const playersInfos: Record<string, LedgerPlayerInfo> = {};
  let bi = 0, bo = 0, ig = 0;
  for (const id of s.order) {
    const p = s.players[id]!;
    if (!p.sessions.length) continue;
    const buyInSum = p.sessions.reduce((a, x) => a + x.buy_in, 0);
    const buyOutSum = p.sessions.reduce((a, x) => a + x.buy_out, 0);
    const inGame = curSession(p) ? p.stack : 0;
    playersInfos[id] = { id, name: p.name, buyInSum, buyOutSum, inGame, nitEscrow: 0, net: buyOutSum + inGame - buyInSum };
    bi += buyInSum; bo += buyOutSum; ig += inGame;
  }
  return { playersInfos, buyInTotal: bi, buyOutTotal: bo, inGameTotal: ig, nitEscrowTotal: 0, gameHasRake: false, rakedValue: 0, rakedValueWaitingToBeCollected: 0 };
}
