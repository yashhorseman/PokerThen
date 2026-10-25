import { useEffect, useState } from 'react';
import type { Frame, HandPlayerView, HandView, PlayerId, PlayerView } from '../../shared/protocol';
import { appStore, serverNow, useApp } from '../state/store';
import { usePrefs } from '../state/prefs';

/** Re-render every `ms` (server-synchronised clock, research/05 §6: 100 ms for timer bars). Returns serverNow(). */
export function useNow(ms = 100, enabled = true): number {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    if (!enabled) return;
    setNow(serverNow());
    const id = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}

/** Everything the scene needs, derived once per frame (research/05 §5 button rules). */
export interface Model {
  frame: Frame;
  hand: HandView | null;
  meId: PlayerId;
  me: PlayerView | undefined;
  mySeat: number | null;
  isSeated: boolean;
  isOwner: boolean;
  seatOf: Record<PlayerId, number>;
  playerAtSeat: Record<number, PlayerView | undefined>;
  hp: HandPlayerView | undefined; //          my hand state (undefined = not dealt in)
  isMyTurn: boolean;
  myBet: number; //                          chips I have in front of me this street
  highest: number; //                        current highest street bet
  toCall: number;
  stack: number; //                          chips behind (net of current bet)
  allInTo: number; //                        stack + myBet = the largest raise-to
  bb: number;
  canCheck: boolean;
  hasOption: boolean;
  canRaise: boolean;
  isAllIn: boolean;
  isFolded: boolean;
  away: boolean;
  /** viewer may take an empty seat (not seated) */
  canSit: boolean;
  pending: boolean; //                       my seat request is waiting for approval
  seatedCount: number;
  readyCount: number; //                     seated players with status inGame
  betNumber: (id: PlayerId) => number;
}

export function buildModel(frame: Frame): Model {
  const hand = frame.hand;
  const meId = frame.you.id;
  const me = frame.players[meId];
  const seatOf: Record<PlayerId, number> = {};
  const playerAtSeat: Record<number, PlayerView | undefined> = {};
  for (const [seat, pid] of frame.seats) { seatOf[pid] = seat; playerAtSeat[seat] = frame.players[pid]; }
  const mySeat = seatOf[meId] ?? null;
  const hp = hand?.players[meId];
  const betNumber = (id: PlayerId) => { const b = hand?.bets[id]; return typeof b === 'number' ? b : 0; };
  const myBet = betNumber(meId);
  const highest = hand?.highestBet ?? 0;
  const stack = me?.stack ?? 0;
  const isAllIn = hp?.status === 'allIn';
  const isFolded = hp?.status === 'fold';
  const isMyTurn = !!hand?.actor && hand.actor.playerId === meId && hand.step === 'actor' && !frame.paused;
  const hasOption = !!hand?.optionIds.includes(meId);
  const canCheck = highest === 0 || myBet === highest || hasOption || isAllIn;
  const canRaise = isMyTurn && !hand!.cannotRaiseIds.includes(meId) && stack > Math.max(0, highest - myBet);
  const status = me?.status;
  const seatedCount = frame.seats.length;
  let readyCount = 0;
  for (const [, pid] of frame.seats) if (frame.players[pid]?.status === 'inGame') readyCount++;
  return {
    frame, hand, meId, me, mySeat, isSeated: mySeat !== null, isOwner: frame.you.isOwner, seatOf, playerAtSeat, hp,
    isMyTurn, myBet, highest, toCall: Math.max(0, highest - myBet), stack, allInTo: stack + myBet,
    bb: frame.blinds.bb, canCheck, hasOption, canRaise, isAllIn, isFolded,
    away: !!me?.away || status === 'standingUp',
    canSit: mySeat === null && (status === 'watching' || status === undefined),
    pending: status === 'requestedGameIngress',
    seatedCount, readyCount, betNumber,
  };
}

export function useModel(): Model | null {
  const frame = useApp((s) => s.frame);
  return frame ? buildModel(frame) : null;
}

/** Position (1..10) a seat is drawn at.  A seated viewer is rotated so their own seat is position 1 (research/05 §3.2 formation,
 *  verified on the phone in research/03 §3.2); spectators / unseated viewers see absolute seat numbers (research/02 B1). */
export function positionOfSeat(seat: number, mySeat: number | null): number {
  if (mySeat === null) return seat;
  return ((seat - mySeat + 10) % 10) + 1;
}

// ───────────────────────────── number formatting (pref "Values Display Style") ─────────────────────────────

export function formatValue(n: number, style: 'none' | 'formatted' | 'big-blind', bb: number): string {
  if (style === 'big-blind' && bb > 0) {
    const v = Math.round((n / bb) * 100) / 100;
    return String(v) + 'BB';
  }
  if (style === 'formatted') return n.toLocaleString('en-US');
  return String(Math.round(n));
}

export function useFmt(): (n: number) => string {
  const style = usePrefs((p) => p.displayValueStyle);
  const bb = useApp((s) => s.frame?.blinds.bb ?? 0);
  return (n: number) => formatValue(n, style, bb);
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

export function cardParts(code: string): { rank: string; suit: string } {
  const r = code[0] ?? '?';
  return { rank: r === 'T' ? '10' : r, suit: code[1] ?? 's' };
}

export function getFrame(): Frame | null { return appStore.getState().frame; }
