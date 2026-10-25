import { useEffect, useMemo, useRef, useState } from 'react';
import { useFairness } from '../fairness';
import { useRoom } from '../net';
import { prefersReducedMotion, setPrefs, usePrefs } from '../prefs';
import { sounds } from '../sound';
import { Dock } from './Dock';
import { AddChipsForm, FairnessModal, HelpBody, SeatForm, SidePanel } from './Panels';
import { Settings } from './Settings';
import { Stage } from './Stage';
import { copyText, Modal, toast, useNow } from './ui';

type Panel = 'chat' | 'log' | 'ledger';

export function TablePage({ roomId }: { roomId: string }) {
  const { snap, status, fatal, offset, send } = useRoom(roomId);
  const [prefs] = usePrefs();
  const fair = useFairness(snap);
  const [seatForm, setSeatForm] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [settings, setSettings] = useState<false | 'players' | 'game' | 'prefs'>(false);
  const [showFair, setShowFair] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [addChips, setAddChips] = useState(false);
  const [seenChat, setSeenChat] = useState(0);

  const needClock = !!snap && (!!snap.hand?.deadline || !!snap.room.nextHandAt || !!snap.hand?.vote);
  const now = useNow(needClock, 250);
  const serverNow = now + offset;
  const inviteUrl = `${location.origin}/t/${roomId}`;

  // appearance preferences on the root element
  useEffect(() => {
    document.documentElement.dataset.deck = prefs.deck;
    document.documentElement.dataset.motion = prefersReducedMotion(prefs) ? 'reduce' : 'full';
  }, [prefs]);

  // title
  useEffect(() => { document.title = snap ? `${snap.room.ownerNickname}’s table — PokerThen` : 'PokerThen'; }, [snap?.room.ownerNickname]); // eslint-disable-line react-hooks/exhaustive-deps

  // sounds & notifications driven by state transitions
  const prev = useRef<typeof snap>(null);
  useEffect(() => {
    if (!snap) return;
    const p = prev.current;
    const mySeat = snap.viewer.seat;
    if (p && mySeat !== null) {
      const turnNow = snap.hand?.toActSeat === mySeat && snap.hand.phase === 'BETTING';
      const turnBefore = p.hand?.toActSeat === mySeat && p.hand.phase === 'BETTING' && p.hand.id === snap.hand?.id && p.hand.turnId === snap.hand?.turnId;
      if (turnNow && !turnBefore) sounds.turn();
      const won = snap.hand?.phase === 'COMPLETE' && p.hand?.phase !== 'COMPLETE' && snap.hand.results?.pots.some((pt) => pt.awards.some((a) => a.winners.some((w) => w.seat === mySeat)));
      if (won) sounds.win();
    }
    if (p) {
      const newChat = snap.log.filter((e) => e.kind === 'chat' && e.seq > (p.log.at(-1)?.seq ?? 0) && e.memberId !== snap.viewer.memberId);
      if (newChat.length) sounds.chat();
      const req = snap.requests.length > p.requests.length;
      if (req && snap.viewer.role === 'owner') toast(`${snap.requests.at(-1)?.nickname ?? 'Someone'} is asking for ${snap.requests.at(-1)?.kind === 'topup' ? 'more chips' : 'a seat'} — see Options → Players.`, 'info');
      if (p.viewer.myRequest && !snap.viewer.myRequest && snap.viewer.seat !== null && p.viewer.seat === null) toast('The host approved your seat. Good luck!', 'good');
      if (p.viewer.myRequest && !snap.viewer.myRequest && snap.viewer.seat === null && snap.viewer.role !== 'viewer') toast('The host declined your request.', 'error');
    }
    prev.current = snap;
  }, [snap]);

  const chats = useMemo(() => (snap ? snap.log.filter((e) => e.kind === 'chat') : []), [snap]);
  const lastChatSeq = chats.at(-1)?.seq ?? 0;
  useEffect(() => { if (panel === 'chat') setSeenChat(lastChatSeq); }, [panel, lastChatSeq]);
  const unread = chats.filter((c) => c.seq > seenChat && c.memberId !== snap?.viewer.memberId).length;

  // keyboard shortcuts (never while typing or in dialogs; no betting hotkeys by design)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable || document.querySelector('.modal')) return;
      const k = e.key.toLowerCase();
      if (k === 'b') setPrefs({ amounts: prefs.amounts === 'chips' ? 'bb' : 'chips' });
      else if (k === 'l') setPanel((x) => (x === 'log' ? null : 'log'));
      else if (k === 'm') { setPanel('chat'); setTimeout(() => document.getElementById('chat-input')?.focus(), 50); e.preventDefault(); }
      else if (k === 'p' && snap?.viewer.role === 'owner' && snap.room.gameStatus === 'RUNNING') void send({ kind: 'admin.pause', value: !snap.room.paused });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [prefs.amounts, snap, send]);

  if (fatal) return <main className="fatal"><div className="panel"><h1>Can’t open this table</h1><p>{fatal}</p><a className="btn primary" href="/">Create your own table</a></div></main>;
  if (!snap) return <main className="fatal"><div className="panel"><div className="spinner" aria-hidden="true" /><p>{status === 'reconnecting' ? 'Reconnecting…' : 'Connecting to the table…'}</p></div></main>;

  const v = snap.viewer;
  const me = v.seat !== null ? snap.seats[v.seat] : null;
  const cfg = snap.room.config;
  const isOwner = v.role === 'owner';
  const run = async (c: Parameters<typeof send>[0], okMsg?: string) => { const r = await send(c); if (!r.ok) toast(r.error.message, 'error'); else if (okMsg) toast(okMsg, 'good'); };

  return (
    <div className="table-page">
      <header className="topbar">
        <div className="brand"><span className="logo-mark" aria-hidden="true">♠</span><span className="brand-name">PokerThen</span></div>
        <div className="roominfo" aria-label="Table info">
          <span>Host <b>{snap.room.ownerNickname}</b></span>
          <span>No-Limit Hold’em</span>
          <span>{cfg.sb}/{cfg.bb}{cfg.ante ? ` · ante ${cfg.ante}` : ''}</span>
          {snap.room.handCount > 0 && <span>Hand #{snap.room.handCount}</span>}
        </div>
        <div className="top-actions">
          <button className="btn sm" onClick={async () => toast((await copyText(inviteUrl)) ? 'Invite link copied' : 'Copy failed — copy it from the address bar', 'good')}>🔗 <span className="hide-sm">Invite</span></button>
          <button className={`btn sm${fair.failed ? ' danger' : ''}`} onClick={() => setShowFair(true)} title="Fairness verification">🔒 <span className="hide-sm">{fair.failed ? `${fair.failed} FAILED` : `Fair ${fair.completed ? `✓ ${fair.verified}/${fair.completed}` : ''}`}</span></button>
          <button className="btn sm" onClick={() => setPanel(panel ? null : 'chat')}>💬<span className="hide-sm"> Chat</span>{unread > 0 && <span className="badge">{unread}</span>}</button>
          <button className="btn sm" onClick={() => setPanel(panel === 'log' ? null : 'log')}>📜<span className="hide-sm"> Log</span></button>
          <button className="btn sm primary-ish" onClick={() => setSettings(isOwner ? 'players' : 'game')}>⚙<span className="hide-sm"> Options</span>{isOwner && snap.requests.length > 0 && <span className="badge">{snap.requests.length}</span>}</button>
          <button className="btn sm" onClick={() => setShowHelp(true)} aria-label="Help">?</button>
        </div>
      </header>

      {status !== 'live' && <div className="banner" role="alert">Connection lost — reconnecting. Your seat and cards are safe on the server.</div>}
      {snap.room.paused && <div className="banner info" role="status">Game paused by the host. Clocks are frozen.</div>}
      {snap.pending.some((p) => p.kind === 'stop') && <div className="banner info">The game will stop after this hand.</div>}

      <div className="body">
        <section className="stage-wrap" aria-label="Poker table">
          <Stage snap={snap} prefs={prefs} serverNow={serverNow} onSeatClick={setSeatForm} inviteUrl={inviteUrl}
            onStart={() => void run({ kind: 'admin.start' })} onResume={() => void run({ kind: 'admin.pause', value: false })} />
        </section>
        {panel && <SidePanel snap={snap} tab={panel} setTab={setPanel} onClose={() => setPanel(null)} send={send} unread={unread} />}
      </div>

      <footer className="dockbar">
        {me && (
          <div className="utility">
            <button className="btn sm" onClick={() => void run({ kind: 'sit.out', value: me.participation !== 'SITTING_OUT' })}>{me.participation === 'SITTING_OUT' ? 'I’m back' : 'Sit out'}</button>
            {me.participation !== 'SITTING_OUT' && <button className="btn sm" title="Sit out until you reach the big blind" onClick={() => void run({ kind: 'sit.out', value: true, returnOnBB: true })}>Back on big blind</button>}
            <button className="btn sm" onClick={() => setAddChips(true)}>+ Add chips</button>
            <button className="btn sm danger" onClick={() => { if (confirm(me.inHand && snap.hand?.phase !== 'COMPLETE' ? 'Leave your seat? You fold now and cash out when the hand settles.' : 'Leave your seat and cash out?')) void run({ kind: 'seat.leave' }); }}>{me.leaving ? 'Leaving…' : 'Leave seat'}</button>
          </div>
        )}
        <Dock snap={snap} prefs={prefs} serverNow={serverNow} send={send} />
      </footer>

      {seatForm !== null && <SeatForm snap={snap} seat={seatForm} send={send} onClose={() => setSeatForm(null)} />}
      {addChips && <AddChipsForm snap={snap} send={send} onClose={() => setAddChips(false)} />}
      {settings && <Settings snap={snap} send={send} onClose={() => setSettings(false)} initialTab={settings} />}
      {showFair && <FairnessModal snap={snap} checks={fair.checks} verified={fair.verified} completed={fair.completed} failed={fair.failed} onClose={() => setShowFair(false)} />}
      {showHelp && <Modal title="Rules & fairness" onClose={() => setShowHelp(false)} wide><HelpBody /></Modal>}
    </div>
  );
}
