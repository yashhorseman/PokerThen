import { useEffect, useRef, useState } from 'react';
import type { ClientCommand, Snapshot } from '@pokerthen/protocol';
import { cardText, fmtAmount } from '../format';
import { usePortrait } from '../layout';
import type { Prefs } from '../prefs';
import type { SendResult } from '../net';
import { toast } from './ui';

type PreAction =
  | { kind: 'checkfold' }
  | { kind: 'fold' }
  | { kind: 'check' }
  | { kind: 'call'; amount: number }
  | null;

const CANCEL_CHECK = 'The bet changed, so your pre-set check was cancelled.';
const CANCEL_CALL = 'The bet changed, so your pre-set call was cancelled.';

interface Props {
  snap: Snapshot;
  prefs: Prefs;
  serverNow: number;
  send(c: ClientCommand): Promise<SendResult>;
}

const isRedSuit = (card: string | null | undefined) => !!card && (card[1] === 'h' || card[1] === 'd');

/** One of the three fixed action slots. Stays in place (dimmed) when it's not your turn. */
function Slot({ kind, label, sub, hint, keys, disabled, dim, aria, onClick }: {
  kind: 'raise' | 'call' | 'fold';
  label: string;
  sub?: string;
  hint?: string;
  keys?: string;
  disabled: boolean;
  dim: boolean;
  aria: string;
  onClick(): void;
}) {
  return (
    <button type="button" className={`abtn abtn-${kind}${dim ? ' is-dim' : ''}`} disabled={disabled} aria-label={aria} aria-keyshortcuts={keys} onClick={onClick}>
      {hint && <span className="act-hint" aria-hidden="true">{hint}</span>}
      <span className="abtn-label">{label}</span>
      {sub && <span className="abtn-sub">{sub}</span>}
    </button>
  );
}

export function ActionArea({ snap, prefs, serverNow, send }: Props) {
  const portrait = usePortrait();
  const hand = snap.hand;
  const mySeat = snap.viewer.seat;
  const me = mySeat !== null ? snap.seats[mySeat] : null;
  const lg = snap.legal;
  const bb = snap.room.config.bb;
  const fmt = (n: number) => fmtAmount(n, prefs, bb);
  const myTurn = !!(hand && lg && hand.phase === 'BETTING' && hand.toActSeat === mySeat);
  const liveNow = !!hand && hand.phase === 'BETTING' && !!me && !!me.inHand && !me.folded;
  const facingNow = hand && me ? Math.max(0, hand.currentBet - (me.street ?? 0)) : 0;
  const callAmtNow = Math.min(facingNow, me?.stack ?? 0);
  const canPreSelect = liveNow && !myTurn && !me?.allIn && !hand?.vote;

  const [busy, setBusy] = useState(false);
  const [raiseTo, setRaiseTo] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pre, setPre] = useState<PreAction>(null);
  const turnKey = hand ? `${hand.id}:${hand.turnId}` : '';
  const lastKey = useRef('');
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const keyEnterRef = useRef<(e: KeyboardEvent) => void>(() => {});

  // a new snapshot means the server answered: allow input again
  useEffect(() => { setBusy(false); }, [snap.version]);
  // new turn: reset the bet editor to the legal minimum and close the panel
  useEffect(() => { if (lg) setRaiseTo(lg.minRaiseTo); }, [turnKey, lg?.minRaiseTo, lg?.maxRaiseTo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPanelOpen(false); }, [turnKey]);
  useEffect(() => { if (!myTurn) setPanelOpen(false); }, [myTurn]);

  const run = async (c: ClientCommand) => {
    setBusy(true);
    const r = await send(c);
    if (!r.ok) { setBusy(false); toast(r.error.message, 'error'); }
  };
  const act = (action: 'fold' | 'check' | 'call' | 'raise' | 'allin', amt?: number) => {
    if (!hand || !lg) return;
    void run({ kind: 'action', handId: hand.id, turnId: lg.turnId, action, raiseTo: amt });
  };

  const min = lg?.minRaiseTo ?? 0;
  const max = lg?.maxRaiseTo ?? 0;
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.floor(Number.isFinite(n) ? n : min)));
  const confirmBet = () => {
    if (!lg || busy) return;
    const v = clamp(raiseTo);
    setRaiseTo(v);
    act('raise', v);
  };
  const useBank = () => { if (lg && hand && !busy) void run({ kind: 'bank.use', turnId: lg.turnId }); };
  const openPanel = () => { if (lg?.canRaise && !busy) { setRaiseTo(lg.minRaiseTo); setPanelOpen(true); } };
  const foldNow = () => {
    if (!lg) return;
    if (lg.canCheck && !window.confirm('You can check for free. Fold anyway?')) return;
    act('fold');
  };

  const togglePre = (p: NonNullable<PreAction>) => setPre((cur) => (cur && cur.kind === p.kind ? null : p));

  // pre-actions fire exactly once when the turn arrives
  useEffect(() => {
    if (!myTurn || !lg || !hand || lastKey.current === turnKey) return;
    lastKey.current = turnKey;
    if (!pre) return;
    const p = pre;
    setPre(null);
    const go = (action: 'fold' | 'check' | 'call') => void run({ kind: 'action', handId: hand.id, turnId: lg.turnId, action });
    if (p.kind === 'checkfold') go(lg.canCheck ? 'check' : 'fold');
    else if (p.kind === 'fold') go('fold');
    else if (p.kind === 'check') { if (lg.canCheck) go('check'); else toast(CANCEL_CHECK, 'info'); }
    else if (p.kind === 'call') { if (!lg.canCheck && lg.callAmount === p.amount) go('call'); else toast(CANCEL_CALL, 'info'); }
  }, [myTurn, turnKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // a pre-set check/call is dropped the moment the bet in front of you changes (the buttons would otherwise be misleading)
  useEffect(() => {
    if (!pre || myTurn || !liveNow) return;
    if (pre.kind === 'check' && facingNow > 0) { setPre(null); toast(CANCEL_CHECK, 'info'); }
    else if (pre.kind === 'call' && (facingNow === 0 || callAmtNow !== pre.amount)) { setPre(null); toast(CANCEL_CALL, 'info'); }
  }, [facingNow, callAmtNow]); // eslint-disable-line react-hooks/exhaustive-deps
  // cleared when the hand ends, you fold, a new hand starts, or you go all-in
  useEffect(() => { if (!hand || hand.phase === 'COMPLETE' || me?.folded || me?.allIn) setPre(null); }, [hand?.id, hand?.phase, me?.folded, me?.allIn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPre(null); }, [hand?.id]);

  // keyboard: Esc always closes the bet panel; I / C / K / R / F / T only with the "action shortcuts" preference,
  // never while typing, in a dialog, or with a modifier key. B / L / M / P belong to the room (TablePage).
  keyRef.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('.modal, .joinreq')) return;
    if (e.key === 'Escape') { if (panelOpen) { e.preventDefault(); setPanelOpen(false); } return; }
    const t = e.target as HTMLElement | null;
    const typing = !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);
    if (!prefs.shortcuts || typing) return;
    const k = e.key.toLowerCase();
    if (!['i', 'c', 'k', 'r', 'f', 't'].includes(k)) return;
    if (myTurn && lg) {
      if (panelOpen) return; // inside the bet panel only Enter / Esc are handled
      e.preventDefault();
      if (e.repeat || busy) return;
      if (k === 'i') act(lg.canCheck ? 'check' : 'fold');
      else if (k === 'c') { if (lg.canCheck) toast('Nothing to call — press K to check', 'info'); else act('call'); }
      else if (k === 'k') { if (lg.canCheck) act('check'); else toast('You can’t check — there’s a bet to call', 'info'); }
      else if (k === 'r') openPanel();
      else if (k === 'f') foldNow();
      else if (k === 't') { if (hand && !hand.bankActive && (me?.timeBankMs ?? 0) > 0) useBank(); }
    } else if (canPreSelect) {
      if (k === 'r' || k === 't') return;
      e.preventDefault();
      if (e.repeat) return;
      if (k === 'i') togglePre({ kind: 'checkfold' });
      else if (k === 'f') togglePre({ kind: 'fold' });
      else if (k === 'c') { if (facingNow > 0) togglePre({ kind: 'call', amount: callAmtNow }); else toast('Nothing to call — press K to check', 'info'); }
      else if (k === 'k') { if (facingNow === 0) togglePre({ kind: 'check' }); else toast('You can’t check — there’s a bet to call', 'info'); }
    }
  };
  // Enter confirms the bet while the panel is open (focus on the number box is handled by its own onKeyDown)
  keyEnterRef.current = (e: KeyboardEvent) => {
    if (!prefs.shortcuts || !myTurn || !panelOpen || e.key !== 'Enter') return;
    const t = e.target as HTMLElement | null;
    if (t && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName) || t.isContentEditable)) return;
    if (document.querySelector('.modal, .joinreq')) return;
    e.preventDefault(); confirmBet();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { keyRef.current(e); keyEnterRef.current(e); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const root = (state: string, children: React.ReactNode) => (
    <div className="action-area" data-state={state} data-portrait={portrait ? 'true' : 'false'}>
      <div className="sr-only" role="status" aria-live="polite">{myTurn ? 'Your turn' : ''}</div>
      {children}
    </div>
  );

  /* ---------- not seated ---------- */
  if (mySeat === null || !me) {
    return root('spectator', snap.viewer.myRequest
      ? (
        <div className="act-msg">
          Waiting for the host to approve your {snap.viewer.myRequest.kind === 'seat' ? `seat ${snap.viewer.myRequest.seat! + 1}` : 'request'}…
          <button type="button" className="btn sm" onClick={() => void run({ kind: 'seat.cancelRequest' })}>Cancel request</button>
        </div>
      )
      : <div className="act-msg">{snap.room.status === 'CLOSED' ? 'This table has ended.' : 'You’re watching. Click an empty seat to ask the host for a seat.'}</div>);
  }

  const groups: React.ReactNode[] = [];
  const hint = (k: string) => (prefs.shortcuts ? k : undefined);
  const inLiveHand = liveNow;

  /* ---------- run it twice vote ---------- */
  if (hand?.vote && hand.vote.mine === 'pending') {
    const left = Math.max(0, Math.ceil((hand.vote.deadline - serverNow) / 1000));
    groups.push(
      <div className="act-vote" key="vote" role="group" aria-label="Run it twice?">
        <span className="act-vote-q">RUN IT TWICE? <span className="act-count">{left}s</span></span>
        <button type="button" className="abtn abtn-confirm" disabled={busy} onClick={() => void run({ kind: 'runout.vote', yes: true })}>YES</button>
        <button type="button" className="abtn abtn-no" disabled={busy} onClick={() => void run({ kind: 'runout.vote', yes: false })}>NO</button>
      </div>,
    );
  } else if (hand?.vote && hand.vote.mine !== 'n/a') {
    groups.push(<div className="act-msg" key="votew">You voted {hand.vote.mine}. Waiting for the others…</div>);
  }

  /* ---------- your turn ---------- */
  if (myTurn && lg && hand) {
    const toCall = lg.callAmount;
    if (panelOpen && lg.canRaise) {
      const toCallRaw = hand.currentBet - (me.street ?? 0);
      const preset = (kind: 'min' | 'max' | number) => {
        if (kind === 'min') return setRaiseTo(min);
        if (kind === 'max') return setRaiseTo(max);
        setRaiseTo(clamp(hand.currentBet + Math.floor(kind * (hand.totalPot + toCallRaw))));
      };
      const value = clamp(raiseTo);
      const pct = max > min ? ((value - min) / (max - min)) * 100 : 100;
      const bbs = bb > 0 ? value / bb : 0;
      const step = (dir: 1 | -1, big: boolean) => setRaiseTo(clamp(value + dir * (big ? bb : 1)));
      const isAllIn = value >= max;
      const confirmLabel = isAllIn ? 'ALL-IN' : lg.isBet ? 'BET' : 'RAISE TO';
      groups.push(
        <div className="raise-panel" key="panel" role="group" aria-label="Bet sizing">
          <div className="rp-presets">
            <button type="button" className="rp-preset" onClick={() => preset('min')}>MIN RAISE</button>
            <button type="button" className="rp-preset" onClick={() => preset(0.5)}>1/2 POT</button>
            <button type="button" className="rp-preset" onClick={() => preset(0.75)}>3/4 POT</button>
            <button type="button" className="rp-preset" onClick={() => preset(1)}>POT</button>
            <button type="button" className="rp-preset" onClick={() => preset('max')}>ALL IN</button>
          </div>
          <div className="rp-bet">
            <label htmlFor="rp-input">Your bet</label>
            <input
              id="rp-input" type="text" inputMode="numeric" autoComplete="off" aria-label="Bet amount in chips"
              value={raiseTo ? String(raiseTo) : ''}
              onChange={(e) => setRaiseTo(e.target.value === '' ? 0 : Math.floor(Number(e.target.value.replace(/[^\d]/g, ''))) || 0)}
              onBlur={() => setRaiseTo(clamp(raiseTo))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmBet(); } }}
            />
            <span className="rp-bb" aria-hidden="true">{Number.isInteger(bbs) ? bbs : bbs.toFixed(1)}BB</span>
          </div>
          <div className="rp-slider">
            <button type="button" className="rp-step" aria-label="Decrease bet" onClick={(e) => step(-1, e.shiftKey)}>−</button>
            <input
              type="range" aria-label="Bet size" min={min} max={max} step={1} value={value} style={{ ['--pct' as string]: `${pct}%` }}
              onChange={(e) => setRaiseTo(clamp(+e.target.value))}
            />
            <button type="button" className="rp-step" aria-label="Increase bet" onClick={(e) => step(1, e.shiftKey)}>+</button>
          </div>
          <div className="rp-actions">
            <button type="button" className="abtn abtn-back" onClick={() => setPanelOpen(false)} aria-label="Back to actions">
              {hint('ESC') && <span className="act-hint" aria-hidden="true">ESC</span>}
              <span className="abtn-label">BACK</span>
            </button>
            <button type="button" className="abtn abtn-confirm" disabled={busy || value < min || value > max} onClick={confirmBet}
              aria-label={`${isAllIn ? 'All-in' : lg.isBet ? 'Bet' : 'Raise to'} ${value}`}>
              <span className="abtn-label">{confirmLabel} {fmt(value)}</span>
              {!isAllIn && <span className="abtn-sub">+{fmt(Math.max(0, value - (me.street ?? 0)))}</span>}
            </button>
          </div>
        </div>,
      );
    } else {
      groups.push(
        <div className="act-turn" key="turn"><span className="act-dot" aria-hidden="true" />YOUR TURN</div>,
      );
      if (hand.deadline && snap.room.config.bankSeconds > 0) {
        if (hand.bankActive) groups.push(<div className="act-bank is-active" key="bank">EXTRA TIME ACTIVE</div>);
        else if ((me.timeBankMs ?? 0) > 0) {
          groups.push(
            <button type="button" className="act-bank" key="bank" disabled={busy} onClick={useBank} aria-label="Use extra time" aria-keyshortcuts="T">
              {hint('T') && <span className="act-hint" aria-hidden="true">T</span>}
              EXTRA TIME <span className="act-count">{Math.round((me.timeBankMs ?? 0) / 1000)}s</span>
            </button>,
          );
        }
      }
      groups.push(
        <div className="act-slots" key="slots">
          <Slot kind="raise" label={lg.isBet ? 'BET' : 'RAISE'} hint={hint('R')} keys="R" disabled={busy || !lg.canRaise} dim={!lg.canRaise}
            aria={lg.canRaise ? (lg.isBet ? 'Bet' : 'Raise') : 'Raise (not available)'} onClick={openPanel} />
          {lg.canCheck
            ? <Slot kind="call" label="CHECK" hint={hint('K')} keys="K" disabled={busy} dim={false} aria="Check" onClick={() => act('check')} />
            : <Slot kind="call" label={`CALL ${fmt(toCall)}`} sub={lg.callIsAllIn ? 'ALL-IN' : undefined} hint={hint('C')} keys="C" disabled={busy} dim={false}
                aria={`Call ${toCall}${lg.callIsAllIn ? ', all-in' : ''}`} onClick={() => act('call')} />}
          <Slot kind="fold" label="FOLD" hint={hint('F')} keys="F" disabled={busy} dim={false} aria="Fold" onClick={foldNow} />
        </div>,
      );
      if (!lg.canRaise && !lg.canCheck && !lg.callIsAllIn) groups.push(<div className="act-note" key="note">Betting wasn’t reopened — you can call or fold.</div>);
    }
  } else if (inLiveHand && hand && !hand.vote) {
    /* ---------- waiting for your turn: pre-select row + dimmed slots ---------- */
    const facing = facingNow;
    const callAmt = callAmtNow;
    if (!me.allIn) {
      const pbtn = (kind: 'checkfold' | 'fold' | 'check' | 'call', label: string, key: string, onClick: () => void) => {
        const armed = pre?.kind === kind;
        return (
          <button key={kind} type="button" className={`apre${armed ? ' is-armed' : ''}${kind === 'fold' ? ' apre-fold' : ''}`} aria-pressed={armed}
            aria-keyshortcuts={key.toUpperCase()} onClick={onClick}>
            {hint(key.toUpperCase()) && <span className="act-hint" aria-hidden="true">{key.toUpperCase()}</span>}
            <span className="apre-tick" aria-hidden="true">{armed ? '✓' : ''}</span>{label}
          </button>
        );
      };
      groups.push(
        <div className="act-pre" key="pre" role="group" aria-label="Pre-select an action for your turn">
          {pbtn('checkfold', 'CHECK OR FOLD', 'i', () => togglePre({ kind: 'checkfold' }))}
          {facing > 0
            ? pbtn('call', `CALL ${fmt(callAmt)}`, 'c', () => togglePre({ kind: 'call', amount: callAmt }))
            : pbtn('check', 'CHECK', 'k', () => togglePre({ kind: 'check' }))}
          {pbtn('fold', 'FOLD', 'f', () => togglePre({ kind: 'fold' }))}
        </div>,
      );
    }
    groups.push(
      <div className="act-slots" key="slots" aria-hidden="true">
        <Slot kind="raise" label="RAISE" disabled dim aria="Raise (wait for your turn)" onClick={() => {}} />
        <Slot kind="call" label={facing > 0 ? `CALL ${fmt(callAmt)}` : 'CHECK'} disabled dim aria="Call or check (wait for your turn)" onClick={() => {}} />
        <Slot kind="fold" label="FOLD" disabled dim aria="Fold (wait for your turn)" onClick={() => {}} />
      </div>,
    );
  }

  /* ---------- after the hand: show cards / rabbit ---------- */
  if (snap.canShow) {
    const cards = snap.canShow.cards;
    const mine = me.cards ?? [];
    const chip = (i: 0 | 1) => (
      <button type="button" key={i} className={`act-show-chip${isRedSuit(mine[i]) ? ' is-red' : ''}`} disabled={busy}
        aria-label={`Show ${mine[i] ? cardText(mine[i] as string) : i === 0 ? 'left card' : 'right card'}`}
        onClick={() => void run({ kind: 'show', cards: [i] })}>
        {mine[i] ? cardText(mine[i] as string) : i === 0 ? 'LEFT' : 'RIGHT'}
      </button>
    );
    groups.push(
      cards.length === 2
        ? (
          <div className="act-show" key="show" role="group" aria-label="Show your cards">
            <button type="button" className="act-show-all" disabled={busy} onClick={() => void run({ kind: 'show', cards: [0, 1] })}>SHOW ALL CARDS</button>
            {chip(0)}{chip(1)}
          </div>
        )
        : (
          <div className="act-show" key="show" role="group" aria-label="Show your card">
            <span className="act-show-all is-label">SHOW</span>
            {chip(cards[0])}
          </div>
        ),
    );
  }
  if (snap.rabbitAvailable) {
    groups.push(<button type="button" className="act-rabbit" key="rabbit" disabled={busy} onClick={() => void run({ kind: 'rabbit.reveal' })}>🐇 REVEAL REMAINING BOARD</button>);
  }

  /* ---------- lobby: the host starts the game ---------- */
  const handIdle = !hand || hand.phase === 'COMPLETE';
  if (snap.room.status === 'OPEN' && snap.room.gameStatus === 'STOPPED' && handIdle) {
    if (snap.viewer.role === 'owner') {
      const eligible = snap.seats.filter((s) => !s.empty && s.participation === 'ACTIVE' && (s.stack ?? 0) > 0).length;
      const seated = snap.seats.filter((s) => !s.empty && s.memberId).length;
      groups.push(
        <div className="act-lobby" key="start" role="group" aria-label="Game start">
          <button type="button" className="act-shuffle" disabled={busy || seated < 2}
            title={seated < 2 ? 'At least two seated players are needed' : 'Randomly rearrange the seated players'}
            onClick={() => void run({ kind: 'admin.shuffleSeats' })}>
            SHUFFLE SEATS
          </button>
          <button type="button" className="act-start" disabled={busy || eligible < 2}
            title={eligible < 2 ? 'At least two funded, active players are needed' : 'Start dealing'}
            onClick={() => void run({ kind: 'admin.start' })}>
            START GAME
          </button>
        </div>,
      );
    }
  }

  if (!groups.length) {
    let text = 'Waiting for the next hand…';
    if (me.participation === 'SITTING_OUT') text = 'You’re sitting out. Press “I’m back” to be dealt in.';
    else if (me.stack === 0) text = 'You’re out of chips — use “Add chips” to ask the host for more.';
    else if (me.folded && hand?.phase === 'BETTING') text = 'You folded this hand.';
    else if (hand && hand.phase === 'BETTING' && !me.inHand) text = 'You’ll be dealt in next hand.';
    else if (snap.room.gameStatus === 'STOPPED') text = snap.viewer.role === 'owner' ? 'Get at least two players seated, then start the game.' : 'Waiting for the host to start';
    groups.push(<div className="act-msg" key="msg">{text}</div>);
  }

  const state = panelOpen && myTurn ? 'raise' : myTurn ? 'turn' : inLiveHand ? 'wait' : 'idle';
  return root(state, groups);
}
