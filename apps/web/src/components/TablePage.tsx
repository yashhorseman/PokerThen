import { useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '@pokerthen/protocol';
import { useFairness } from '../fairness';
import { usePortrait } from '../layout';
import { useRoom } from '../net';
import { prefersReducedMotion, setPrefs, usePrefs } from '../prefs';
import { sounds } from '../sound';
import { ActionArea } from './ActionArea';
import * as I from './icons';
import { AddChipsForm, ChatPane, FairnessModal, HelpBody, JoinRequestModal, LogModal, OptionsMenu, type OptionsAction, SeatForm } from './Panels';
import { Settings } from './Settings';
import { Stage } from './Stage';
import { copyText, Modal, toast, useNow } from './ui';

const VOLUMES = [0, 15, 45, 100] as const;
const volumeLevel = (v: number): 0 | 1 | 2 | 3 => (v === 0 ? 0 : v <= 15 ? 1 : v <= 45 ? 2 : 3);
const totalCards = (s: Snapshot) => (s.hand ? s.hand.boards.reduce((a, b) => a + b.length, 0) : 0);

export function TablePage({ roomId }: { roomId: string }) {
  const { snap, status, fatal, offset, send } = useRoom(roomId);
  const [prefs] = usePrefs();
  const portrait = usePortrait();
  const fair = useFairness(snap);

  const [seatForm, setSeatForm] = useState<number | null>(null);
  const [logTab, setLogTab] = useState<'log' | 'ledger' | null>(null);
  const [settings, setSettings] = useState<false | 'players' | 'game' | 'prefs'>(false);
  const [showFair, setShowFair] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [addChips, setAddChips] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatSheet, setChatSheet] = useState(false);
  const [seenChat, setSeenChat] = useState(0);
  const [ignored, setIgnored] = useState<Set<string>>(() => new Set());
  const chatInput = useRef<HTMLInputElement>(null);

  const needClock = !!snap && (!!snap.hand?.deadline || !!snap.room.nextHandAt || !!snap.hand?.vote);
  const now = useNow(needClock, 250);
  const serverNow = now + offset;
  const inviteUrl = `${location.origin}/t/${roomId}`;

  // appearance preferences on the root element
  useEffect(() => {
    document.documentElement.dataset.deck = prefs.deck;
    document.documentElement.dataset.motion = prefersReducedMotion(prefs) ? 'reduce' : 'full';
  }, [prefs]);

  useEffect(() => { document.title = snap ? `${snap.room.ownerNickname}’s table — PokerThen` : 'PokerThen'; }, [snap?.room.ownerNickname]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- sounds & notifications driven by state transitions ---- */
  const prev = useRef<Snapshot | null>(null);
  useEffect(() => {
    if (!snap) return;
    const p = prev.current;
    const mySeat = snap.viewer.seat;
    if (p) {
      const sameHand = !!p.hand && !!snap.hand && p.hand.id === snap.hand.id;
      if (mySeat !== null) {
        const turnNow = snap.hand?.toActSeat === mySeat && snap.hand.phase === 'BETTING';
        const turnBefore = p.hand?.toActSeat === mySeat && p.hand.phase === 'BETTING' && p.hand.id === snap.hand?.id && p.hand.turnId === snap.hand?.turnId;
        if (turnNow && !turnBefore) sounds.turn();
        const won = snap.hand?.phase === 'COMPLETE' && p.hand?.phase !== 'COMPLETE' && snap.hand.results?.pots.some((pt) => pt.awards.some((a) => a.winners.some((w) => w.seat === mySeat)));
        if (won) sounds.win();
      }
      if (sameHand) {
        if (totalCards(snap) > totalCards(p)) sounds.flip();
        let raised = false;
        snap.seats.forEach((s, i) => {
          const o = p.seats[i];
          if (s.empty || !o || o.empty) return;
          if ((s.street ?? 0) > (o.street ?? 0)) raised = true;
          if (s.lastAction === 'check' && o.lastAction !== 'check') sounds.check();
          if (s.folded && !o.folded) sounds.fold();
        });
        if (raised) sounds.chips();
      }
      const lastOld = p.log.at(-1)?.seq ?? 0;
      if (snap.log.some((e) => e.kind === 'chat' && e.seq > lastOld && e.memberId !== snap.viewer.memberId)) sounds.chat();
      if (p.viewer.myRequest && !snap.viewer.myRequest && snap.viewer.seat !== null && p.viewer.seat === null) toast('The host approved your seat. Good luck!', 'good');
      if (p.viewer.myRequest && !snap.viewer.myRequest && snap.viewer.seat === null && snap.viewer.role !== 'viewer') toast('The host declined your request.', 'error');
    }
    prev.current = snap;
  }, [snap]);

  /* ---- chat unread ---- */
  const chats = useMemo(() => (snap ? snap.log.filter((e) => e.kind === 'chat') : []), [snap]);
  const lastChatSeq = chats.at(-1)?.seq ?? 0;
  const chatVisible = portrait ? chatSheet : chatExpanded;
  useEffect(() => { if (chatVisible) setSeenChat(lastChatSeq); }, [chatVisible, lastChatSeq]);
  const unread = chats.filter((c) => c.seq > seenChat && c.memberId !== snap?.viewer.memberId).length;

  const focusChat = () => {
    if (portrait) setChatSheet(true); else setChatExpanded(true);
    setTimeout(() => chatInput.current?.focus(), 60);
  };

  /* ---- keyboard shortcuts (never while typing or when a dialog is open) ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable || document.querySelector('.modal, .joinreq')) return;
      const k = e.key.toLowerCase();
      if (k === 'b') setPrefs({ amounts: prefs.amounts === 'chips' ? 'bb' : 'chips' });
      else if (k === 'l') setLogTab((x) => (x ? null : 'log'));
      else if (k === 'm') { focusChat(); e.preventDefault(); }
      else if (k === 'p' && snap?.viewer.role === 'owner' && snap.room.gameStatus === 'RUNNING') void send({ kind: 'admin.pause', value: !snap.room.paused });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // re-bound each render so it always sees fresh state

  if (fatal) return <main className="fatal"><div className="panel"><h1>Can’t open this table</h1><p>{fatal}</p><a className="btn primary" href="/">Create your own table</a></div></main>;
  if (!snap) return <main className="fatal"><div className="panel"><div className="spinner" aria-hidden="true" /><p>{status === 'reconnecting' ? 'Reconnecting…' : 'Connecting to the table…'}</p></div></main>;

  const v = snap.viewer;
  const me = v.seat !== null ? snap.seats[v.seat] : null;
  const cfg = snap.room.config;
  const isOwner = v.role === 'owner';
  const running = snap.room.gameStatus === 'RUNNING';
  const run = async (c: Parameters<typeof send>[0], okMsg?: string) => { const r = await send(c); if (!r.ok) toast(r.error.message, 'error'); else if (okMsg) toast(okMsg, 'good'); return r.ok; };
  const joinReq = isOwner && !settings ? snap.requests.find((r) => !ignored.has(r.id)) : undefined;

  const copyInvite = async () => toast((await copyText(inviteUrl)) ? 'Invite link copied' : 'Copy failed — copy it from the address bar', 'good');
  const downloadCsv = () => { const a = document.createElement('a'); a.href = `/api/v1/rooms/${roomId}/ledger.csv`; a.download = 'ledger.csv'; document.body.appendChild(a); a.click(); a.remove(); };

  const pick = (a: OptionsAction) => {
    setOptionsOpen(false);
    if (a === 'players') setSettings('players');
    else if (a === 'game') setSettings('game');
    else if (a === 'prefs') setSettings('prefs');
    else if (a === 'copy') void copyInvite();
    else if (a === 'fair') setShowFair(true);
    else if (a === 'help') setShowHelp(true);
    else if (a === 'csv') downloadCsv();
    else if (a === 'addchips') setAddChips(true);
    else if (a === 'backbb') void run({ kind: 'sit.out', value: true, returnOnBB: true });
    else if (a === 'leave') location.assign('/');
  };

  const leaveSeat = () => {
    if (confirm(me?.inHand && snap.hand?.phase !== 'COMPLETE' ? 'Leave your seat? You fold now and cash out when the hand settles.' : 'Leave your seat and cash out?')) void run({ kind: 'seat.leave' });
  };
  const toggleAway = () => { if (me) void run({ kind: 'sit.out', value: me.participation !== 'SITTING_OUT' }); };
  const cycleSound = () => { const i = VOLUMES.indexOf(prefs.volume); setPrefs({ volume: VOLUMES[(i + 1) % VOLUMES.length] }); };
  const volName = prefs.volume === 0 ? 'muted' : prefs.volume === 15 ? 'low' : prefs.volume === 45 ? 'medium' : 'high';

  const failed = fair.failed > 0;
  const away = me?.participation === 'SITTING_OUT';
  const infoText = `NLH ~ ${cfg.sb} / ${cfg.bb}${cfg.ante ? ` · ante ${cfg.ante}` : ''}`;

  return (
    <div className="room" data-felt={prefs.felt} data-portrait={portrait ? '1' : '0'}>
      <div className="room-stage">
        <Stage snap={snap} prefs={prefs} serverNow={serverNow} onSeatClick={setSeatForm} inviteUrl={inviteUrl} />
      </div>

      {/* logo tab + fairness pill */}
      <header className="room-logo">
        <span className="room-logo-name"><span className="room-logo-mark" aria-hidden="true">♠</span> PokerThen</span>
        <button className={`room-fair${failed ? ' bad' : ''}`} onClick={() => setShowFair(true)} aria-label={failed ? `Fairness check failed on ${fair.failed} hand(s)` : `Fairness verification: ${fair.verified} of ${fair.completed} hands verified`} title="Fairness verification">
          <I.IconLock /><span>{failed ? `${fair.failed} FAILED` : fair.completed ? `✓ ${fair.verified}/${fair.completed}` : 'FAIR'}</span>
        </button>
      </header>

      {/* left rail (portrait: horizontal row) */}
      <nav className="rail" aria-label="Table controls">
        <div className="rail-item">
          <button className="rail-btn" data-optmenu-toggle aria-haspopup="menu" aria-expanded={optionsOpen} onClick={() => setOptionsOpen((x) => !x)}>
            <span className="rail-ic"><I.IconMenu /></span><span className="rail-cap">Options</span>
            {isOwner && snap.requests.length > 0 && <span className="rail-badge" aria-label={`${snap.requests.length} pending requests`}>{snap.requests.length}</span>}
          </button>
          {optionsOpen && <OptionsMenu snap={snap} fair={fair} onPick={pick} onClose={() => setOptionsOpen(false)} />}
        </div>
        {me && (
          <>
            <button className="rail-btn" onClick={leaveSeat} disabled={!!me.leaving}><span className="rail-ic"><I.IconLeave /></span><span className="rail-cap">{me.leaving ? 'Leaving…' : 'Leave seat'}</span></button>
            <button className={`rail-btn${away ? ' on' : ''}`} onClick={toggleAway}><span className="rail-ic"><I.IconAway /></span><span className="rail-cap">{away ? 'I’m back' : 'Away'}</span></button>
          </>
        )}
      </nav>

      {/* top right: owner, blinds, sound / pause / stop */}
      <div className="topright">
        <div className="topright-info">
          <span className="tr-owner">OWNER: {snap.room.ownerNickname.toUpperCase()}</span>
          <span className="tr-blinds">{infoText}</span>
        </div>
        <div className="topright-btns">
          <button className="tr-btn" onClick={cycleSound} aria-label={`Sound: ${volName}. Click to change`} title={`Sound: ${volName}`}><I.IconSound level={volumeLevel(prefs.volume)} /></button>
          {isOwner && running && (
            <button className="tr-btn" onClick={() => void run({ kind: 'admin.pause', value: !snap.room.paused })} aria-label={snap.room.paused ? 'Resume game' : 'Pause game'} title={snap.room.paused ? 'Resume (P)' : 'Pause (P)'}>
              {snap.room.paused ? <I.IconPlay /> : <I.IconPause />}<span className="keyhint">P</span>
            </button>
          )}
          {isOwner && running && (
            <button className={`tr-btn${snap.room.stopAfterHand ? ' on' : ''}`} aria-label={snap.room.stopAfterHand ? 'Cancel scheduled stop' : 'Stop after this hand'} title={snap.room.stopAfterHand ? 'Cancel scheduled stop' : 'Stop after this hand'}
              onClick={() => {
                if (snap.room.stopAfterHand) void run({ kind: 'admin.stopAfterHand', value: false });
                else if (confirm('Stop after this hand? Seats can then be rearranged. Starting again picks a random dealer and resets the button order.')) void run({ kind: 'admin.stopAfterHand', value: true });
              }}><I.IconStop /></button>
          )}
        </div>
      </div>

      {/* bottom-left: log + chat */}
      {!portrait ? (
        <div className="room-bl">
          <button className="bl-log" onClick={() => setLogTab('log')}><span>LOG / LEDGER</span><span className="keyhint">L</span></button>
          <div className={`chatdock${chatExpanded ? ' open' : ''}`}>
            <ChatPane snap={snap} send={send} expanded={chatExpanded} inputRef={chatInput} />
            <button className="chatdock-toggle" onClick={() => setChatExpanded((x) => !x)} aria-expanded={chatExpanded} aria-label={chatExpanded ? 'Collapse chat' : 'Expand chat'}>
              {chatExpanded ? <I.IconChevronDown /> : <I.IconChevronUp />}{!chatExpanded && unread > 0 && <span className="rail-badge">{unread}</span>}
            </button>
            <span className="keyhint chatdock-key" aria-hidden="true">M</span>
          </div>
        </div>
      ) : (
        <div className="room-bl-stack">
          <button className="bl-stack-btn" onClick={() => setChatSheet(true)}>CHAT{unread > 0 && <span className="rail-badge">{unread}</span>}</button>
          <button className="bl-stack-btn" onClick={() => setLogTab('log')}>LOG</button>
        </div>
      )}
      {portrait && chatSheet && (
        <div className="chatsheet-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) setChatSheet(false); }}>
          <section className="chatsheet" role="dialog" aria-label="Chat">
            <header><b>Chat</b><button className="icon-btn" aria-label="Close chat" onClick={() => setChatSheet(false)}><I.IconClose /></button></header>
            <ChatPane snap={snap} send={send} expanded inputRef={chatInput} />
          </section>
        </div>
      )}

      {/* bottom-right: actions */}
      <div className="room-actions">
        <ActionArea snap={snap} prefs={prefs} serverNow={serverNow} send={send} />
      </div>

      {/* banners */}
      <div className="room-banners" aria-live="polite">
        {status !== 'live' && <div className="room-banner warn" role="alert">Connection lost — reconnecting. Your seat and cards are safe on the server.</div>}
        {snap.room.paused && <div className="room-banner info" role="status">Game paused by the host. Clocks are frozen.</div>}
        {snap.pending.some((p) => p.kind === 'stop') && <div className="room-banner info">The game will stop after this hand.</div>}
      </div>

      {/* dialogs */}
      {joinReq && <JoinRequestModal key={joinReq.id} req={joinReq} send={send} onIgnore={() => setIgnored((s) => new Set(s).add(joinReq.id))} />}
      {seatForm !== null && <SeatForm snap={snap} seat={seatForm} send={send} onClose={() => setSeatForm(null)} />}
      {addChips && <AddChipsForm snap={snap} send={send} onClose={() => setAddChips(false)} />}
      {settings && <Settings snap={snap} send={send} onClose={() => setSettings(false)} initialTab={settings} />}
      {logTab && <LogModal snap={snap} tab={logTab} setTab={setLogTab} onClose={() => setLogTab(null)} />}
      {showFair && <FairnessModal snap={snap} checks={fair.checks} verified={fair.verified} completed={fair.completed} failed={fair.failed} onClose={() => setShowFair(false)} />}
      {showHelp && <Modal title="Rules & fairness" onClose={() => setShowHelp(false)} wide><HelpBody /></Modal>}
    </div>
  );
}
