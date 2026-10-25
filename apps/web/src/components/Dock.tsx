import { useEffect, useRef, useState } from 'react';
import type { ClientCommand, Snapshot } from '@pokerthen/protocol';
import { cardText, fmtAmount } from '../format';
import type { Prefs } from '../prefs';
import type { SendResult } from '../net';
import { toast } from './ui';

type PreAction = { kind: 'checkfold' } | { kind: 'call'; amount: number } | null;

interface Props {
  snap: Snapshot;
  prefs: Prefs;
  serverNow: number;
  send(c: ClientCommand): Promise<SendResult>;
}

export function Dock({ snap, prefs, serverNow, send }: Props) {
  const hand = snap.hand;
  const mySeat = snap.viewer.seat;
  const me = mySeat !== null ? snap.seats[mySeat] : null;
  const lg = snap.legal;
  const bb = snap.room.config.bb;
  const fmt = (n: number) => fmtAmount(n, prefs, bb);
  const myTurn = !!(hand && lg && hand.phase === 'BETTING' && hand.toActSeat === mySeat);

  const [busy, setBusy] = useState(false);
  const [raiseTo, setRaiseTo] = useState(0);
  const [pre, setPre] = useState<PreAction>(null);
  const turnKey = hand ? `${hand.id}:${hand.turnId}` : '';
  const lastKey = useRef('');

  // new turn or new snapshot: allow input again; reset the bet editor to the legal minimum
  useEffect(() => { setBusy(false); }, [snap.version]);
  useEffect(() => { if (lg) setRaiseTo(lg.minRaiseTo); }, [turnKey, lg?.minRaiseTo, lg?.maxRaiseTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (c: ClientCommand) => {
    setBusy(true);
    const r = await send(c);
    if (!r.ok) { setBusy(false); toast(r.error.message, 'error'); }
  };

  // pre-actions fire once when the turn arrives
  useEffect(() => {
    if (!myTurn || !lg || !hand || lastKey.current === turnKey) return;
    lastKey.current = turnKey;
    if (!pre) return;
    const p = pre;
    setPre(null);
    if (p.kind === 'checkfold') void run({ kind: 'action', handId: hand.id, turnId: lg.turnId, action: lg.canCheck ? 'check' : 'fold' });
    else if (p.kind === 'call' && !lg.canCheck && lg.callAmount === p.amount) void run({ kind: 'action', handId: hand.id, turnId: lg.turnId, action: 'call' });
    else toast('The bet changed, so your pre-set call was cancelled.', 'info');
  }, [myTurn, turnKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!hand || hand.phase === 'COMPLETE' || me?.folded) setPre(null); }, [hand?.id, hand?.phase, me?.folded]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- not seated ---------- */
  if (mySeat === null || !me) {
    return (
      <div className="dock">
        {snap.viewer.myRequest
          ? <div className="dock-msg">Waiting for the host to approve your {snap.viewer.myRequest.kind === 'seat' ? `seat ${snap.viewer.myRequest.seat! + 1}` : 'request'}…{' '}
              <button className="btn sm" onClick={() => void run({ kind: 'seat.cancelRequest' })}>Cancel request</button></div>
          : <div className="dock-msg">{snap.room.status === 'CLOSED' ? 'This table has ended.' : 'You’re watching. Click an empty seat to ask the host for a seat.'}</div>}
      </div>
    );
  }

  const groups: JSX.Element[] = [];

  /* ---------- run it twice vote ---------- */
  if (hand?.vote && hand.vote.mine === 'pending') {
    const left = Math.max(0, Math.ceil((hand.vote.deadline - serverNow) / 1000));
    groups.push(
      <div className="agroup" key="vote">
        <span className="dock-q">Run it twice? <span className="count">{left}s</span></span>
        <button className="btn abtn good" disabled={busy} onClick={() => void run({ kind: 'runout.vote', yes: true })}>Yes</button>
        <button className="btn abtn bad" disabled={busy} onClick={() => void run({ kind: 'runout.vote', yes: false })}>No</button>
      </div>,
    );
  } else if (hand?.vote && hand.vote.mine !== 'n/a') {
    groups.push(<div className="dock-msg" key="votew">You voted {hand.vote.mine}. Waiting for the others…</div>);
  }

  /* ---------- my turn ---------- */
  if (myTurn && lg && hand) {
    const toCall = lg.callAmount;
    const max = lg.maxRaiseTo, min = lg.minRaiseTo;
    const clamp = (n: number) => Math.max(min, Math.min(max, Math.floor(Number.isFinite(n) ? n : min)));
    const setPreset = (kind: 'min' | 'max' | number) => {
      if (kind === 'min') return setRaiseTo(min);
      if (kind === 'max') return setRaiseTo(max);
      setRaiseTo(clamp(hand.currentBet + Math.floor(kind * (hand.totalPot + (hand.currentBet - (me.street ?? 0))))));
    };
    const extra = raiseTo - (me.street ?? 0);
    const act = (action: 'fold' | 'check' | 'call' | 'raise' | 'allin', amt?: number) => void run({ kind: 'action', handId: hand.id, turnId: lg.turnId, action, raiseTo: amt });
    groups.push(
      <div className="agroup main" key="main">
        <button className="btn abtn fold" disabled={busy} onClick={() => act('fold')}>Fold</button>
        {lg.canCheck
          ? <button className="btn abtn call" disabled={busy} onClick={() => act('check')}>Check</button>
          : <button className="btn abtn call" disabled={busy} onClick={() => act('call')}>{lg.callIsAllIn ? `Call ${fmt(toCall)} · all-in` : `Call ${fmt(toCall)}`}</button>}
        {lg.canRaise && (
          <div className="raisebox">
            <div className="presets" role="group" aria-label="Bet size presets">
              <button onClick={() => setPreset('min')}>Min</button>
              <button onClick={() => setPreset(0.5)}>½ pot</button>
              <button onClick={() => setPreset(0.75)}>¾ pot</button>
              <button onClick={() => setPreset(1)}>Pot</button>
              <button onClick={() => setPreset('max')}>All-in</button>
            </div>
            <div className="rrow">
              <input type="range" aria-label="Bet size" min={min} max={max} step={1} value={Math.min(Math.max(raiseTo, min), max)} onChange={(e) => setRaiseTo(clamp(+e.target.value))} />
              <input type="number" aria-label="Amount in chips" inputMode="numeric" min={min} max={max} value={raiseTo || ''}
                onChange={(e) => setRaiseTo(e.target.value === '' ? 0 : Math.floor(+e.target.value))} onBlur={() => setRaiseTo(clamp(raiseTo))}
                onKeyDown={(e) => { if (e.key === 'Enter') { const v = clamp(raiseTo); setRaiseTo(v); act('raise', v); } }} />
            </div>
            <button className="btn abtn raise" disabled={busy || raiseTo < min || raiseTo > max} onClick={() => act('raise', clamp(raiseTo))}>
              {raiseTo >= max ? 'All-in' : lg.isBet ? 'Bet' : 'Raise to'} {fmt(clamp(raiseTo))}
              <small>{raiseTo >= max ? '' : ` (+${fmt(Math.max(0, clamp(raiseTo) - (me.street ?? 0)))})`}</small>
            </button>
            <span className="sr-only">Adds {extra} chips</span>
          </div>
        )}
        {!lg.canRaise && !lg.canCheck && !lg.callIsAllIn && <span className="hint small">Betting wasn’t reopened — you can call or fold.</span>}
      </div>,
    );
    if (hand.deadline && !hand.bankActive && (me.timeBankMs ?? 0) > 0 && snap.room.config.bankSeconds > 0) {
      groups.push(<button className="btn sm" key="bank" disabled={busy} onClick={() => void run({ kind: 'bank.use', turnId: lg.turnId })}>⏱ Use time bank ({Math.round((me.timeBankMs ?? 0) / 1000)}s)</button>);
    }
  } else if (hand && hand.phase === 'BETTING' && me.inHand && !me.folded && !hand.vote) {
    /* ---------- waiting for my turn: pre-actions ---------- */
    const facing = Math.max(0, hand.currentBet - (me.street ?? 0));
    groups.push(
      <div className="agroup pre" key="pre">
        <label className="chk"><input type="checkbox" checked={pre?.kind === 'checkfold'} onChange={(e) => setPre(e.target.checked ? { kind: 'checkfold' } : null)} /> Check / fold</label>
        {facing > 0 && !me.allIn && (
          <label className="chk"><input type="checkbox" checked={pre?.kind === 'call'} onChange={(e) => setPre(e.target.checked ? { kind: 'call', amount: Math.min(facing, me.stack ?? 0) } : null)} /> Call {fmt(Math.min(facing, me.stack ?? 0))}</label>
        )}
      </div>,
    );
  }

  /* ---------- after the hand: show / rabbit ---------- */
  if (snap.canShow) {
    const cards = snap.canShow.cards;
    const mine = me.cards ?? [];
    groups.push(
      <div className="agroup" key="show">
        {cards.length === 2 && <button className="btn sm" onClick={() => void run({ kind: 'show', cards: [0, 1] })}>Show both</button>}
        {cards.includes(0) && mine[0] && <button className="btn sm" onClick={() => void run({ kind: 'show', cards: [0] })}>Show left {cardText(mine[0])}</button>}
        {cards.includes(1) && mine[1] && <button className="btn sm" onClick={() => void run({ kind: 'show', cards: [1] })}>Show right {cardText(mine[1])}</button>}
      </div>,
    );
  }
  if (snap.rabbitAvailable) groups.push(<button className="btn sm" key="rabbit" onClick={() => void run({ kind: 'rabbit.reveal' })}>🐇 Reveal remaining board</button>);

  if (!groups.length) {
    let text = 'Waiting for the next hand…';
    if (me.participation === 'SITTING_OUT') text = 'You’re sitting out. Press “I’m back” to be dealt in.';
    else if (me.stack === 0) text = 'You’re out of chips — use “Add chips” to ask the host for more.';
    else if (me.folded && hand?.phase === 'BETTING') text = 'You folded this hand.';
    else if (hand && hand.phase === 'BETTING' && !me.inHand) text = 'You’ll be dealt in next hand.';
    else if (snap.room.gameStatus === 'STOPPED') text = 'The game hasn’t started yet.';
    groups.push(<div className="dock-msg" key="msg">{text}</div>);
  }

  return <div className="dock">{groups}</div>;
}
