import { useEffect } from 'react';
import { createStore } from '../state/createStore';
import { sendAction } from '../net/connection';
import { appStore, serverNow } from '../state/store';
import { TIMING } from '../../shared/constants';
import { buildModel, type Model } from './model';

/**
 * Intended actions / pre-actions (research/05 §5) + decision lock (750 ms) + bet-panel maths (research/02 §9).
 * The decision store is shared by the action bar, the bet panel and the hotkeys.
 */
export type IntendedKind = 'PLAYER_FOLD' | 'PLAYER_CHECK' | 'PLAYER_CALL' | 'PLAYER_RAISE' | 'CHECK_OR_FOLD';
export interface Intended { kind: IntendedKind; value?: number; forStreet: number; forHand: number; forHigh: number }

interface DecisionState {
  intended: Intended | null;
  /** buttons disabled until this Date.now() after a decision click (750 ms) */
  lockUntil: number;
  betOpen: boolean;
  /** "unnecessary fold" confirm dialog is open */
  foldConfirm: boolean;
  /** "Do not show this again in this session" */
  skipFoldConfirm: boolean;
  /** the hand+turn for which ATB was already auto-sent */
  atbSentFor: string | null;
}
export const decisionStore = createStore<DecisionState>({ intended: null, lockUntil: 0, betOpen: false, foldConfirm: false, skipFoldConfirm: false, atbSentFor: null });
export const useDecisions = decisionStore.useStore;
const set = decisionStore.setState;

export function foldNeedsConfirmation(m: Model): boolean {
  // "fold is unnecessary" = nothing to call or I hold the option (05 §5)
  return !m.highest || m.hasOption || m.myBet === m.highest;
}

function lock() { set({ lockUntil: Date.now() + TIMING.DECISION_BUTTON_LOCK_MS }); }
export function isLocked(): boolean { return Date.now() < decisionStore.getState().lockUntil; }

/** Really send an action for the current turn (only called when it is my turn) */
function sendNow(m: Model, kind: IntendedKind, value?: number) {
  switch (kind) {
    case 'PLAYER_FOLD': sendAction({ type: 'PLAYER_FOLD' }); break;
    case 'PLAYER_CHECK': sendAction({ type: 'PLAYER_CHECK' }); break;
    case 'PLAYER_CALL': sendAction({ type: 'PLAYER_CALL' }); break;
    case 'PLAYER_RAISE': sendAction({ type: 'PLAYER_RAISE', value: value ?? m.hand?.minRaiseTo ?? m.bb }); break;
    case 'CHECK_OR_FOLD': sendAction(m.canCheck ? { type: 'PLAYER_CHECK' } : { type: 'PLAYER_FOLD' }); break;
  }
  set({ intended: null, betOpen: false });
  lock();
}

/** Press a decision button.  On my turn: send now (fold may ask for confirmation).  Otherwise toggle the queued intent. */
export function pressDecision(kind: IntendedKind, value?: number, opts: { confirmed?: boolean } = {}) {
  const f = appStore.getState().frame; if (!f) return;
  const m = buildModel(f);
  if (!m.hand) return;
  if (isLocked()) return;
  if (m.isMyTurn) {
    if (kind === 'PLAYER_FOLD' && !opts.confirmed && foldNeedsConfirmation(m) && !decisionStore.getState().skipFoldConfirm) {
      set({ foldConfirm: true });
      return;
    }
    sendNow(m, kind, value);
    return;
  }
  // not my turn -> queue / unqueue (toggle).  Pre-actions only exist while I'm live in the hand.
  if (!m.hp || m.isAllIn || m.isFolded || f.paused) return;
  const cur = decisionStore.getState().intended;
  if (cur && cur.kind === kind) { set({ intended: null }); return; }
  set({ intended: { kind, value, forStreet: m.hand.street, forHand: m.hand.number, forHigh: m.highest } });
}

export function confirmFold(skipNext: boolean) {
  set({ foldConfirm: false, skipFoldConfirm: decisionStore.getState().skipFoldConfirm || skipNext });
  pressDecision('PLAYER_FOLD', undefined, { confirmed: true });
}
export function cancelFold() { set({ foldConfirm: false }); }

export function openBet(open: boolean) { if (!open || !isLocked()) set({ betOpen: open }); }

/** The intent as it should be displayed/executed NOW (CHECK_OR_FOLD turns into a fold highlight once someone bets). */
export function effectiveIntended(m: Model, it: Intended | null): Intended | null {
  if (!it || !m.hand) return null;
  if (it.forHand !== m.hand.number || it.forStreet !== m.hand.street) return null;
  if ((it.kind === 'PLAYER_CHECK' || it.kind === 'PLAYER_CALL') && it.forHigh !== m.highest) return null;
  if (it.kind === 'CHECK_OR_FOLD' && !m.canCheck) return { ...it, kind: 'PLAYER_FOLD' };
  return it;
}

/** Frame-driven: drop stale intents, execute the stored one when my turn arrives, auto time bank, close the bet panel when the turn is gone. */
export function useDecisionEngine(frameSeq: number | undefined) {
  useEffect(() => {
    const f = appStore.getState().frame; if (!f) return;
    const m = buildModel(f);
    const st = decisionStore.getState();
    if (st.intended) {
      const eff = effectiveIntended(m, st.intended);
      if (!eff) set({ intended: null });
      else if (m.isMyTurn && !isLocked()) { sendNow(m, eff.kind, eff.value); return; }
    }
    if (!m.isMyTurn && st.betOpen) set({ betOpen: false });
    if (!m.isMyTurn && st.foldConfirm) set({ foldConfirm: false });
  }, [frameSeq]);
}

/** Auto activate the time bank (pref `autoActivateTimeBank`) when the normal decision time is about to run out. */
export function activateTimeBank() {
  const f = appStore.getState().frame; if (!f) return;
  const m = buildModel(f);
  const a = m.hand?.actor;
  if (!m.isMyTurn || !a || a.bankActive || (m.hand!.timeBank[m.meId] ?? 0) <= 0) return;
  sendAction({ type: 'ATB' });
}

export function nowServer() { return serverNow(); }

// ───────────────────────────── bet panel maths (research/02 §9) ─────────────────────────────

export interface BetPresets { minRaise: number; half: number; threeQuarter: number; pot: number; allIn: number }

/** P = pot + all street bets on the table, my own bet replaced by the highest bet. */
export function betPresets(m: Model): BetPresets {
  const hand = m.hand!;
  const H = m.highest;
  let others = 0;
  for (const [id, b] of Object.entries(hand.bets)) if (id !== m.meId && typeof b === 'number') others += b;
  const P = hand.pot + others + H;
  const cap = (v: number) => Math.max(0, Math.min(m.allInTo, Math.round(v)));
  const maxAllowed = betMax(m);
  return {
    minRaise: Math.min(betMin(m), maxAllowed),
    half: Math.min(cap(H + P / 2), maxAllowed),
    threeQuarter: Math.min(cap(H + (3 * P) / 4), maxAllowed),
    pot: Math.min(cap(H + P), maxAllowed),
    allIn: maxAllowed,
  };
}
export function betMin(m: Model): number { return Math.min(m.hand?.minRaiseTo || m.bb, m.allInTo); }
export function betMax(m: Model): number { return Math.min(m.allInTo, m.hand?.maxRaiseTo ?? m.allInTo); }
export function betValid(m: Model, v: number): boolean {
  if (!Number.isFinite(v) || v <= 0) return false;
  if (m.highest > 0 && v === m.highest && m.toCall < m.stack) return true; // a call
  if (v === m.allInTo) return true; //                                       all-in is always legal
  return v >= betMin(m) && v <= betMax(m);
}
