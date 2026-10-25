import { FormEvent, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientCommand, RequestView, Snapshot } from '@pokerthen/protocol';
import { validateNickname } from '@pokerthen/protocol';
import type { HandCheck } from '../fairness';
import { shortTime } from '../format';
import type { SendResult } from '../net';
import * as I from './icons';
import { Avatar, Modal, toast } from './ui';

type Send = (c: ClientCommand) => Promise<SendResult>;

/* ───────────── chat ───────────── */

/** Shared message list + input, used by the desktop chat dock and the phone bottom sheet. */
export function ChatPane({ snap, send, expanded, inputRef }: { snap: Snapshot; send: Send; expanded?: boolean; inputRef?: React.RefObject<HTMLInputElement> }) {
  const box = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const chats = useMemo(() => snap.log.filter((e) => e.kind === 'chat'), [snap.log]);
  const stick = useRef(true);
  useEffect(() => { const b = box.current; if (b && stick.current) b.scrollTop = b.scrollHeight; }, [chats.length, expanded]);
  const role = snap.viewer.role;
  const canChat = role !== 'viewer' && (snap.room.config.guestChat || role === 'owner');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    const r = await send({ kind: 'chat.send', text: t });
    if (!r.ok) { setText(t); toast(r.error.message, 'error'); }
  };
  return (
    <>
      <div className="chat-msgs" ref={box} onScroll={(e) => { const b = e.currentTarget; stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 30; }} aria-live="polite" aria-relevant="additions" aria-label="Chat messages">
        {chats.length === 0 && <p className="chat-empty">It’s a bit quiet here.<br />{canChat ? 'Type a message below.' : role === 'viewer' ? 'Request a seat to chat.' : 'Chat is off for guests.'}</p>}
        {chats.map((e) => {
          const m = snap.members.find((x) => x.id === e.memberId);
          return (
            <div key={e.seq} className="chat-line">
              <span className="chat-who">{m?.nickname ?? 'Someone'}</span>
              <span className="chat-text">{e.text}</span>
              <time dateTime={new Date(e.ts).toISOString()}>{shortTime(e.ts)}</time>
            </div>
          );
        })}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input id="chat-input" ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoComplete="off"
          placeholder={canChat ? 'Your message… (press Enter)' : role === 'viewer' ? 'Request a seat to chat' : 'Chat is off for guests'} disabled={!canChat} aria-label="Chat message" />
        <button className="chat-send" disabled={!canChat || !text.trim()} aria-label="Send message"><I.IconChat /></button>
      </form>
    </>
  );
}

/* ───────────── session log (full log / ledger / replayer) ───────────── */

export function downloadLog(snap: Snapshot) {
  const lines = snap.log.map((e) => `[${new Date(e.ts).toISOString()}]${e.handNo ? ` #${e.handNo}` : ''} ${e.kind === 'chat' ? `${snap.members.find((m) => m.id === e.memberId)?.nickname ?? 'Someone'}: ${e.text}` : e.text}`);
  const blob = new Blob([`PokerThen session log — table ${snap.roomId}\n\n${lines.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pokerthen-log-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function LogModal({ snap, tab, setTab, onClose }: { snap: Snapshot; tab: 'log' | 'ledger'; setTab(t: 'log' | 'ledger'): void; onClose(): void }) {
  const hands = useMemo(() => [...new Set(snap.log.map((e) => e.handNo).filter((n): n is number => !!n))].sort((a, b) => a - b), [snap.log]);
  const [hand, setHand] = useState<number | 'all'>('all');
  const box = useRef<HTMLDivElement>(null);
  const entries = useMemo(() => snap.log.filter((e) => hand === 'all' || e.handNo === hand), [snap.log, hand]);
  const stick = useRef(true);
  useEffect(() => { const b = box.current; if (b && stick.current && hand === 'all') b.scrollTop = b.scrollHeight; else if (b && hand !== 'all') b.scrollTop = 0; }, [entries.length, hand, tab]);
  const idx = hand === 'all' ? hands.length : hands.indexOf(hand);
  const prev = idx > 0 ? hands[idx - 1] : null;
  const next = hand !== 'all' && idx < hands.length - 1 ? hands[idx + 1] : null;
  const nameSpan = (text: string) => {
    // dotted underline on player names that open a line
    const m = snap.members.slice().sort((a, b) => b.nickname.length - a.nickname.length).find((x) => text.startsWith(x.nickname + ' '));
    return m ? <><span className="log-name">{m.nickname}</span>{text.slice(m.nickname.length)}</> : <>{text}</>;
  };
  return (
    <Modal title="Session Log" onClose={onClose} wide>
      <div className="logmodal">
        <div className="logmodal-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'log'} className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Full log</button>
          <button role="tab" aria-selected={tab === 'ledger'} className={tab === 'ledger' ? 'on' : ''} onClick={() => setTab('ledger')}>Ledger</button>
          <button role="tab" aria-selected="false" disabled title="Hand replayer — coming later">Replayer</button>
        </div>
        {tab === 'ledger' ? <Ledger snap={snap} /> : (
          <>
            <div className="logmodal-box" ref={box} onScroll={(e) => { const b = e.currentTarget; stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 40; }}>
              {entries.length === 0 && <p className="hint pad">Nothing logged yet.</p>}
              {entries.map((e) => (
                <div key={e.seq} className={`logline ${e.kind}${e.text.startsWith('— Hand') ? ' divider' : ''}${/ wins | collected /.test(e.text) && e.kind === 'hand' ? ' win' : ''}`}>
                  <time dateTime={new Date(e.ts).toISOString()}>{shortTime(e.ts)}</time>
                  {e.kind === 'chat' ? <span><b>{snap.members.find((m) => m.id === e.memberId)?.nickname ?? 'Someone'}:</b> {e.text}</span> : <span>{nameSpan(e.text)}</span>}
                </div>
              ))}
            </div>
            <div className="logmodal-foot">
              <button className="btn" disabled={prev === null && hand !== 'all' ? true : hands.length === 0} onClick={() => setHand(prev ?? hands[hands.length - 1] ?? 'all')}>« {hand === 'all' ? (hands.length ? `Hand #${hands[hands.length - 1]}` : 'Hand') : prev !== null ? `Hand #${prev}` : 'First'}</button>
              <button className="btn" onClick={() => setHand('all')} disabled={hand === 'all'}>{hand === 'all' ? 'All hands' : `Hand #${hand} · show all`}</button>
              <button className="btn" disabled={next === null} onClick={() => next !== null && setHand(next)}>{next !== null ? `Hand #${next}` : 'Next'} »</button>
              <button className="btn primary" onClick={() => downloadLog(snap)}><I.IconDownload /> Download</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Ledger({ snap }: { snap: Snapshot }) {
  const { rows, entries, committedLive } = snap.ledger;
  const [open, setOpen] = useState<string | null>(null);
  const tot = rows.reduce((a, r) => ({ buyIn: a.buyIn + r.buyIn, buyOut: a.buyOut + r.buyOut, stack: a.stack + r.stack, committed: a.committed + r.committed, net: a.net + r.net }), { buyIn: 0, buyOut: 0, stack: 0, committed: 0, net: 0 });
  const label: Record<string, string> = { BUY_IN: 'Sat down', TOP_UP: 'Added chips', CASH_OUT: 'Left / cashed out', HOST_ADJUSTMENT: 'Host adjustment' };
  return (
    <div className="ledger">
      <p className="hint pad">Net = cash-outs + current chips − buy-ins. Fictional chips — this is bookkeeping, not payment.{committedLive ? ' A hand is live: chips already in the pot are counted as yours until it settles.' : ''}</p>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Player</th><th>Buy-in</th><th>Buy-out</th><th>Chips</th><th>Net</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="hint">No one has sat down yet.</td></tr>}
            {rows.map((r) => (
              <Fragment key={r.memberId}>
                <tr className="clickable" onClick={() => setOpen(open === r.memberId ? null : r.memberId)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(open === r.memberId ? null : r.memberId); }} aria-expanded={open === r.memberId}>
                  <td>{r.nickname} <span className="mono dim">{r.memberId.slice(0, 5)}</span></td>
                  <td>{r.buyIn}</td><td>{r.buyOut}</td><td>{r.stack + r.committed}{r.committed ? <span className="dim"> ({r.committed} in pot)</span> : null}</td>
                  <td className={r.net > 0 ? 'pos' : r.net < 0 ? 'neg' : ''}>{r.net > 0 ? '+' : ''}{r.net}</td>
                </tr>
                {open === r.memberId && (
                  <tr className="detail"><td colSpan={5}>
                    {entries.filter((e) => e.memberId === r.memberId).map((e) => (
                      <div key={e.id}>{shortTime(e.ts)} · {label[e.type]} · {e.type === 'HOST_ADJUSTMENT' ? (e.amount > 0 ? '+' : '') + e.amount : e.amount}{e.reason ? ` (${e.reason})` : ''}{e.handNo ? ` · hand ${e.handNo}` : ''}</div>
                    ))}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot><tr><td>Total</td><td>{tot.buyIn}</td><td>{tot.buyOut}</td><td>{tot.stack + tot.committed}</td><td className={tot.net === 0 ? 'pos' : 'neg'}>{tot.net}</td></tr></tfoot>
        </table>
      </div>
      <p className="hint pad">{tot.net === 0 ? '✓ Reconciled: every chip is accounted for.' : '⚠ Totals do not reconcile — please report this.'}</p>
      <a className="btn sm" href={`/api/v1/rooms/${snap.roomId}/ledger.csv`} download><I.IconDownload /> Download CSV</a>
    </div>
  );
}

/* ───────────── options popover ───────────── */

export type OptionsAction = 'players' | 'game' | 'prefs' | 'copy' | 'fair' | 'help' | 'csv' | 'addchips' | 'backbb' | 'leave';

export function OptionsMenu({ snap, fair, onPick, onClose }: { snap: Snapshot; fair: { verified: number; completed: number; failed: number }; onPick(a: OptionsAction): void; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-optmenu-toggle]')) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);
  const v = snap.viewer, isOwner = v.role === 'owner', seated = v.seat !== null;
  const item = (a: OptionsAction, icon: ReactNode, text: ReactNode, extra?: ReactNode) => (
    <button key={a} role="menuitem" className="optmenu-item" onClick={() => onPick(a)}><span className="optmenu-ic">{icon}</span><span className="optmenu-tx">{text}</span>{extra}</button>
  );
  return (
    <div className="optmenu" role="menu" aria-label="Table options" ref={ref}>
      <div className="optmenu-head">
        <Avatar name={v.nickname ?? '?'} id={v.memberId} size={30} />
        <div className="optmenu-who"><b>{v.nickname ?? 'Watching'}</b><small>{isOwner ? 'Host' : seated ? 'Seated player' : v.role === 'pending' ? 'Waiting for approval' : 'Watching'}</small></div>
      </div>
      {isOwner && item('players', <I.IconUsers />, 'Players & requests', snap.requests.length ? <span className="badge">{snap.requests.length}</span> : null)}
      {item('game', <I.IconGear />, 'Game configurations')}
      {item('prefs', <I.IconSliders />, 'Preferences')}
      {seated && item('addchips', <I.IconPlus />, 'Add chips')}
      {seated && item('backbb', <I.IconAway />, 'Sit out until big blind')}
      {item('copy', <I.IconLink />, 'Copy invite link')}
      {item('fair', <I.IconLock />, 'Fairness verification', <small className={fair.failed ? 'neg' : 'dim'}>{fair.failed ? `${fair.failed} failed` : fair.completed ? `✓ ${fair.verified}/${fair.completed}` : ''}</small>)}
      {item('csv', <I.IconDownload />, 'Download ledger CSV')}
      {item('help', <I.IconHelp />, 'Rules & help')}
      {item('leave', <I.IconHome />, 'Leave table (home)')}
    </div>
  );
}

/* ───────────── host: join request ───────────── */

export function JoinRequestModal({ req, send, onIgnore }: { req: RequestView; send: Send; onIgnore(): void }) {
  const [stack, setStack] = useState(String(req.amount));
  const [busy, setBusy] = useState(false);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ok.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onIgnore(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onIgnore]);
  const decide = async (approve: boolean) => {
    if (busy) return;
    setBusy(true);
    const n = Math.floor(Number(stack));
    const r = await send({ kind: 'request.decide', requestId: req.id, approve, stack: approve && Number.isSafeInteger(n) && n > 0 ? n : undefined });
    setBusy(false);
    if (!r.ok) toast(r.error.message, 'error');
    else if (approve) toast(`${req.nickname} is in.`, 'good');
  };
  const isSeat = req.kind === 'seat';
  return (
    <div className="joinreq-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onIgnore(); }}>
      <div className="joinreq" role="dialog" aria-modal="true" aria-label="Join request">
        <h2>The player “{req.nickname}” wants to {isSeat ? 'join the game' : 'add chips'}!</h2>
        <div className="joinreq-box">
          <label htmlFor="jr-stack">{isSeat ? `Intended stack (seat ${req.seat! + 1}${req.sitOut ? ', sitting out' : ''})` : 'Chips to add'}</label>
          <input id="jr-stack" inputMode="numeric" value={stack} onChange={(e) => setStack(e.target.value.replace(/[^\d]/g, ''))} />
        </div>
        <div className="joinreq-btns">
          <button className="jr-btn reject" disabled={busy} onClick={() => void decide(false)}>Reject</button>
          <button className="jr-btn ignore" disabled={busy} onClick={onIgnore}>Ignore</button>
          <button className="jr-btn accept" ref={ok} disabled={busy} onClick={() => void decide(true)}>Accept</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── fairness ───────────── */

export function FairnessModal({ snap, checks, verified, completed, failed, onClose }: { snap: Snapshot; checks: HandCheck[]; verified: number; completed: number; failed: number; onClose(): void }) {
  return (
    <Modal title="🔒 Fairness verification" onClose={onClose} wide>
      <p>The server shuffles each hand with a cryptographic random number generator (unbiased Fisher–Yates). <b>Before any card is dealt</b> it publishes a <i>commitment</i>: a Merkle-tree hash that locks in all 52 cards, each with a secret salt.</p>
      <p>Every card you see — your hole cards, the board, hands shown at showdown, the burn cards and any rabbit-hunt cards — comes with a proof. <b>Your browser checks each proof against the commitment</b>, checks that the card sits at the position the dealing procedure requires, and that it matches what’s on screen. Folded and undealt cards stay hidden unless revealed.</p>
      <p className="hint">What this proves: the deck was fixed before the betting and was never swapped. What it can’t: the server operator could in theory read the deck during play (as with any online poker). The code is open source so you can inspect it.</p>
      <h3>This session — {verified}/{completed} completed hands verified{failed ? <span className="neg"> · {failed} FAILED</span> : null}</h3>
      {snap.fairness && <p>Current hand #{snap.fairness.handNo} commitment:<br /><span className="mono">{snap.fairness.commit}</span></p>}
      <div className="table-scroll">
        <table>
          <thead><tr><th>Hand</th><th>Commitment</th><th>Cards proven</th><th>Result</th></tr></thead>
          <tbody>
            {checks.length === 0 && <tr><td colSpan={4} className="hint">No hands observed yet.</td></tr>}
            {checks.map((c) => (
              <tr key={c.handNo}>
                <td>#{c.handNo}</td>
                <td className="mono">{c.commit.slice(0, 14)}…</td>
                <td>{c.proofsChecked}</td>
                <td>{!c.complete ? <span className="dim">in progress{c.ok ? ' ✓' : ''}</span> : c.ok ? <span className="pos">✓ verified{c.sawCommitBeforeDeal ? '' : ' (joined mid-hand)'}</span> : <span className="neg" title={c.notes.join(' ')}>✗ {c.notes[0] ?? 'mismatch'}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ───────────── help ───────────── */

export function HelpBody() {
  return (
    <div className="help">
      <h3>The game</h3>
      <p>No-limit Texas Hold’em for 2–10 players with fictional chips. The button moves clockwise each hand with no dead button; heads-up, the dealer posts the small blind and acts first before the flop, the other player acts first on every later street.</p>
      <h3>Betting</h3>
      <p>Raises are expressed as “raise to”. A raise must be at least the size of the previous full raise. A short all-in doesn’t reopen the betting for players who already acted unless the all-ins add up to a full raise. Timeouts check if free, otherwise fold — never call — and put you to sit out.</p>
      <h3>Showdown</h3>
      <p>Side pots are built from each player’s total contribution; uncalled chips are returned. The last aggressor shows first and a hand is revealed only if it can beat or tie the best shown so far; winners always show. Odd chips go to the first winner left of the dealer. You can show cards after any hand.</p>
      <h3>Run it twice &amp; rabbit hunting</h3>
      <p>When everyone is all-in before the river the host’s setting applies: off, always, or ask. With “ask”, every player still in the hand must agree (10 seconds; no answer means once). The pot is split between the two boards (odd chip to the first). Rabbit hunting lets seated players privately see the cards that would have come after a hand that ended early; it never changes the result.</p>
      <h3>Time bank</h3>
      <p>Each player has a time bank that is used automatically when the clock runs out (or manually). It refills to its maximum after the configured number of hands you played in.</p>
      <h3>Fairness</h3>
      <p>See the 🔒 button at the table: each hand’s deck is committed to before dealing and your browser verifies every revealed card.</p>
    </div>
  );
}

/* ───────────── seat / add chips forms ───────────── */

export function SeatForm({ snap, seat, send, onClose }: { snap: Snapshot; seat: number; send: Send; onClose(): void }) {
  const isOwner = snap.viewer.role === 'owner';
  const [nick, setNick] = useState(snap.viewer.nickname ?? localStorage.getItem('pt_nick') ?? '');
  const [stack, setStack] = useState('2000');
  const [sitOut, setSitOut] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const known = !!snap.viewer.nickname;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    const v = validateNickname(nick);
    if (!v.ok) next.nickname = v.message;
    const n = Math.floor(Number(stack));
    if (!Number.isSafeInteger(n) || n <= 0) next.stack = 'Enter a whole number of chips.';
    if (Object.keys(next).length) return setErrs(next);
    setBusy(true);
    const r = await send({ kind: 'seat.request', seat, nickname: (v as { value: string }).value, stack: n, sitOut });
    setBusy(false);
    if (!r.ok) return setErrs({ ...(r.error.fieldErrors ?? {}), form: r.error.message });
    localStorage.setItem('pt_nick', (v as { value: string }).value);
    toast(isOwner ? 'You’re seated.' : 'Request sent — the host will approve your seat.', 'good');
    onClose();
  };
  return (
    <Modal title={`Seat ${seat + 1}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="form">
        <label htmlFor="sf-nick">Nickname</label>
        <input id="sf-nick" value={nick} onChange={(e) => setNick(e.target.value)} disabled={known} maxLength={30} aria-invalid={!!errs.nickname} autoComplete="nickname" />
        {errs.nickname && <p className="field-error" role="alert">{errs.nickname}</p>}
        <label htmlFor="sf-stack">Chips <span className="hint">(editable)</span></label>
        <input id="sf-stack" inputMode="numeric" value={stack} onChange={(e) => setStack(e.target.value.replace(/[^\d]/g, ''))} aria-invalid={!!errs.stack} />
        {errs.stack && <p className="field-error" role="alert">{errs.stack}</p>}
        <label className="chk"><input type="checkbox" checked={sitOut} onChange={(e) => setSitOut(e.target.checked)} /> Sit out initially</label>
        {errs.form && <p className="field-error" role="alert">{errs.form}</p>}
        <p className="hint">{isOwner ? 'You’ll be dealt in at the next hand.' : 'The host has to approve your seat. You’ll be dealt in at the next hand after that.'}</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{isOwner ? 'Sit down' : 'Request seat'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function AddChipsForm({ snap, send, onClose }: { snap: Snapshot; send: Send; onClose(): void }) {
  const [amt, setAmt] = useState('1000');
  const [err, setErr] = useState('');
  const isOwner = snap.viewer.role === 'owner';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Math.floor(Number(amt));
    if (!Number.isSafeInteger(n) || n <= 0) return setErr('Enter a whole number of chips.');
    const r = await send({ kind: 'topup.request', amount: n });
    if (!r.ok) return setErr(r.error.message);
    toast(isOwner ? 'Chips added (or queued until the hand ends).' : 'Request sent to the host.', 'good');
    onClose();
  };
  return (
    <Modal title="Add chips" onClose={onClose}>
      <form onSubmit={submit} className="form" noValidate>
        <p>{isOwner ? 'Chips arrive at the next hand if you are in one.' : 'The host approves add-on requests. Approved chips arrive at the next hand if you are in one.'}</p>
        <label htmlFor="ac">Amount</label>
        <input id="ac" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} aria-invalid={!!err} />
        {err && <p className="field-error" role="alert">{err}</p>}
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn primary">{isOwner ? 'Add' : 'Request'}</button></div>
      </form>
    </Modal>
  );
}
