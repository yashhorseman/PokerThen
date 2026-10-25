import type { SeatView, Snapshot } from '@pokerthen/protocol';
import { fmtAmount } from '../format';
import type { Prefs } from '../prefs';
import { Avatar, CardBack, CardFace, copyText, toast, useMedia } from './ui';

/** Ten canonical seat anchors (percent of the stage), clockwise from the hero's position. Desktop map from the product spec. */
const POS_DESK: Array<[number, number]> = [[62, 90], [38, 90], [16, 75], [9, 50], [16, 25], [38, 10], [62, 10], [84, 25], [91, 50], [84, 75]];
/** Portrait phones: two compact columns plus top and bottom. */
const POS_MOB: Array<[number, number]> = [[50, 91], [13, 77], [13, 58], [13, 39], [13, 20], [50, 8], [87, 20], [87, 39], [87, 58], [87, 77]];
const CENTER: [number, number] = [50, 47];

const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function actionLabel(a: string | null | undefined) {
  if (!a) return null;
  return a === 'allin' ? 'All-in' : a[0].toUpperCase() + a.slice(1);
}

interface Props {
  snap: Snapshot;
  prefs: Prefs;
  serverNow: number;
  onSeatClick(seat: number): void;
  onStart(): void;
  onResume(): void;
  inviteUrl: string;
}

export function Stage({ snap, prefs, serverNow, onSeatClick, onStart, onResume, inviteUrl }: Props) {
  const mobile = useMedia('(max-width: 759px), (max-width: 1099px) and (orientation: portrait)');
  const POS = mobile ? POS_MOB : POS_DESK;
  const hero = snap.viewer.seat ?? 0;
  const N = snap.seats.length;
  const hand = snap.hand;
  const bb = snap.room.config.bb;
  const fmt = (n: number) => fmtAmount(n, prefs, bb);
  const posOf = (seat: number) => POS[(seat - hero + N) % N];

  const wins = new Map<number, number>();
  if (hand?.results && hand.phase === 'COMPLETE') for (const p of hand.results.pots) for (const a of p.awards) for (const w of a.winners) wins.set(w.seat, (wins.get(w.seat) ?? 0) + w.amount);

  return (
    <div className="stage" data-layout={mobile ? 'portrait' : 'landscape'}>
      <div className="felt" aria-hidden="true"><div className="felt-inner" /></div>
      <CenterArea snap={snap} fmt={fmt} serverNow={serverNow} onStart={onStart} onResume={onResume} inviteUrl={inviteUrl} />
      {snap.seats.map((seat) => {
        const [x, y] = posOf(seat.index);
        if (seat.empty) {
          const canSit = snap.room.status === 'OPEN' && snap.viewer.seat === null && !snap.viewer.myRequest;
          return (
            <button key={seat.index} className={`seat empty${canSit ? ' open' : ''}`} style={{ left: `${x}%`, top: `${y}%` }} disabled={!canSit}
              onClick={() => onSeatClick(seat.index)} aria-label={`Empty seat ${seat.index + 1}${canSit ? ', click to sit' : ''}`}>
              <span className="panel"><span className="sit-label">{canSit ? 'Sit' : seat.index + 1}</span></span>
            </button>
          );
        }
        return <SeatPanel key={seat.index} seat={seat} x={x} y={y} snap={snap} win={wins.get(seat.index)} fmt={fmt} serverNow={serverNow} />;
      })}
      {snap.seats.map((seat) => {
        if (seat.empty) return null;
        const [x, y] = posOf(seat.index);
        const out: JSX.Element[] = [];
        if (seat.street && seat.street > 0 && hand?.phase !== 'COMPLETE') {
          const [bx, by] = lerp([x, y], CENTER, mobile ? 0.36 : 0.4);
          out.push(<div key={'b' + seat.index} className="bet" style={{ left: `${bx}%`, top: `${by}%` }}><span className="chip" aria-hidden="true" />{fmt(seat.street)}</div>);
        }
        if (seat.isDealer) {
          const [dx, dy] = lerp([x, y], CENTER, mobile ? 0.2 : 0.22);
          out.push(<div key={'d' + seat.index} className="dealer-btn" style={{ left: `${dx + (x < 50 ? 3.2 : -3.2)}%`, top: `${dy}%` }} aria-label="Dealer button" title="Dealer">D</div>);
        }
        return out;
      })}
    </div>
  );
}

function SeatPanel({ seat, x, y, snap, win, fmt, serverNow }: { seat: SeatView; x: number; y: number; snap: Snapshot; win?: number; fmt(n: number): string; serverNow: number }) {
  const hand = snap.hand;
  const me = seat.memberId === snap.viewer.memberId;
  const turn = !!hand && hand.phase === 'BETTING' && hand.toActSeat === seat.index;
  const cls = ['seat'];
  if (me) cls.push('me');
  if (turn) cls.push('turn');
  if (seat.folded) cls.push('folded');
  if (win) cls.push('winner');
  if (seat.participation === 'SITTING_OUT' || (seat.connected === false)) cls.push('away');

  let tag: { text: string; tone?: string } | null = null;
  if (win) tag = { text: `+${fmt(win)}${seat.handName ? ' · ' + seat.handName : ''}`, tone: 'win' };
  else if (seat.folded) tag = { text: 'Folded', tone: 'dim' };
  else if (seat.allIn && seat.inHand) tag = { text: 'All-in', tone: 'warn' };
  else if (seat.handName) tag = { text: seat.handName };
  else if (seat.leaving) tag = { text: 'Leaving after hand', tone: 'dim' };
  else if (seat.participation === 'SITTING_OUT') tag = { text: seat.returnOnBB ? 'Back on big blind' : 'Sitting out', tone: 'dim' };
  else if (seat.connected === false) tag = { text: 'Offline', tone: 'dim' };
  else if (seat.waitingForNextHand) tag = { text: 'Waiting for next hand', tone: 'dim' };
  else if (seat.inHand && hand?.phase === 'BETTING' && seat.lastAction) tag = { text: actionLabel(seat.lastAction) as string };
  else if (!seat.inHand && seat.stack === 0) tag = { text: 'Out of chips', tone: 'dim' };

  const left = turn && hand?.deadline ? Math.max(0, hand.deadline - serverNow) : null;
  const total = snap.room.config.actionSeconds ? snap.room.config.actionSeconds * 1000 : null;
  const showCards = seat.cards ?? (seat.holeCount ? [null, null] : null);
  const size = me ? 'lg' : 'md';

  return (
    <div className={cls.join(' ')} style={{ left: `${x}%`, top: `${y}%` }} aria-label={`${seat.nickname}, seat ${seat.index + 1}, ${seat.stack} chips${tag ? ', ' + tag.text : ''}`}>
      {showCards && (
        <div className={`hole ${me ? 'hero' : ''}`}>
          {showCards.map((c, i) => (c ? <CardFace key={i} card={c} size={size} dim={!!seat.folded && me} /> : <CardBack key={i} size={size} />))}
        </div>
      )}
      <div className="panel">
        <Avatar name={seat.nickname ?? '?'} id={seat.memberId ?? ''} size={26} />
        <div className="who">
          <div className="nm">{seat.nickname}{snap.room.ownerId === seat.memberId ? <span className="host-star" title="Host" aria-label="host"> ★</span> : null}</div>
          <div className="stk">{fmt(seat.stack ?? 0)}</div>
        </div>
        {seat.isSB && <span className="blind-badge" title="Small blind">SB</span>}
        {seat.isBB && <span className="blind-badge" title="Big blind">BB</span>}
        {turn && left !== null && <span className="secs" aria-label={`${Math.ceil(left / 1000)} seconds left`}>{Math.ceil(left / 1000)}</span>}
        {turn && left !== null && total && <div className="timer"><i style={{ width: `${Math.min(100, (left / total) * 100)}%`, background: left < 5000 ? 'var(--danger)' : undefined }} /></div>}
      </div>
      {tag && <div className={`tagline ${tag.tone ?? ''}`}>{tag.text}</div>}
    </div>
  );
}

function CenterArea({ snap, fmt, serverNow, onStart, onResume, inviteUrl }: { snap: Snapshot; fmt(n: number): string; serverNow: number; onStart(): void; onResume(): void; inviteUrl: string }) {
  const hand = snap.hand;
  const r = snap.room;
  const isOwner = snap.viewer.role === 'owner';
  const idle = !hand || hand.phase === 'COMPLETE';
  const eligible = snap.seats.filter((s) => !s.empty && s.participation === 'ACTIVE' && (s.stack ?? 0) > 0).length;

  let waiting: JSX.Element | null = null;
  if (r.status === 'CLOSED') waiting = <div className="wait-card"><h3>This table has ended</h3><p>The history and ledger are still available from the log.</p></div>;
  else if (r.paused) waiting = <div className="wait-card"><h3>Game paused</h3>{isOwner ? <button className="btn primary" onClick={onResume}>Resume</button> : <p>The host paused the game.</p>}</div>;
  else if (idle && r.gameStatus === 'STOPPED') {
    waiting = (
      <div className="wait-card">
        <h3>{eligible < 2 ? 'Waiting for players' : 'Ready to start'}</h3>
        <p>{eligible < 2 ? 'At least two players need a seat and chips.' : isOwner ? 'Everyone seated? Start when you are ready.' : 'Waiting for the host to start.'}</p>
        {isOwner && eligible >= 2 && <button className="btn primary" onClick={onStart}>Start game</button>}
        <div className="wait-actions">
          <button className="btn" onClick={async () => toast((await copyText(inviteUrl)) ? 'Invite link copied' : 'Copy failed — select the link in the address bar', 'good')}>Copy invite link</button>
          {typeof navigator.share === 'function' && <button className="btn" onClick={() => navigator.share({ title: 'Join my poker table', url: inviteUrl }).catch(() => {})}>Share</button>}
        </div>
        <p className="mono-link">{inviteUrl}</p>
      </div>
    );
  } else if (idle && r.gameStatus === 'RUNNING' && !r.nextHandAt && eligible < 2) {
    waiting = <div className="wait-card"><h3>Waiting for players</h3><p>Another player with chips is needed to deal the next hand.</p></div>;
  }

  const results = hand?.phase === 'COMPLETE' ? hand.results : null;
  const lines: string[] = [];
  if (results) {
    const twoRuns = hand!.boards.length === 2;
    const nameOf = (seat: number) => snap.seats[seat].nickname ?? `Seat ${seat + 1}`;
    for (const p of results.pots) for (const a of p.awards) for (const w of a.winners) {
      const lbl = results.pots.length > 1 ? (p.index === 0 ? 'Main pot' : `Side pot ${p.index}`) : 'Pot';
      lines.push(`${nameOf(w.seat)} wins ${fmt(w.amount)} · ${twoRuns ? `Run ${a.run} ` : ''}${lbl}${w.hand ? ` · ${w.hand}` : ''}`);
    }
    if (results.refund) lines.push(`${nameOf(results.refund.seat)} gets ${fmt(results.refund.amount)} back (uncalled)`);
  }

  const nextIn = idle && r.nextHandAt ? Math.max(0, Math.ceil((r.nextHandAt - serverNow) / 1000)) : null;
  const slots = (arr: string[], label?: string, hypo?: boolean, key?: string) => (
    <div className={`board${hand!.boards.length > 1 || hypo ? ' sm' : ''}${hypo ? ' rabbit' : ''}`} key={key} aria-label={label}>
      {label && <span className="board-label">{label}</span>}
      {[0, 1, 2, 3, 4].map((i) => (arr[i] ? <CardFace key={i} card={arr[i]} size="xl" hypothetical={hypo} /> : <div key={i} className="slot" />))}
    </div>
  );

  return (
    <div className="center">
      {waiting}
      {hand && !waiting && (
        <>
          {hand.vote && <div className="center-note">Run it twice? {hand.vote.mine === 'pending' ? 'Choose below.' : `Waiting for ${hand.vote.pendingSeats.length} player(s)…`}</div>}
          <div className="pots">
            {hand.collectedPot > 0 && <span className="pot-pill">Pot {fmt(hand.collectedPot)}</span>}
            {hand.pots.length > 1 && <span className="side-pots">{hand.pots.map((p, i) => `${i === 0 ? 'Main' : 'Side ' + i} ${fmt(p.amount)}`).join(' · ')}</span>}
          </div>
          {hand.boards.length === 2 ? <>{slots(hand.boards[0], 'Run 1', false, 'a')}{slots(hand.boards[1], 'Run 2', false, 'b')}</> : slots(hand.boards[0])}
          {snap.rabbit && <div className="board rabbit sm" aria-label="Rabbit hunt (not dealt)"><span className="board-label">🐇 Not dealt</span>{snap.rabbit.cards.map((c, i) => <CardFace key={i} card={c} size="xl" hypothetical />)}</div>}
          {lines.length > 0 && <div className="results" aria-live="polite">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>}
          {nextIn !== null && <div className="center-note">Next hand in {nextIn}s</div>}
          {idle && r.gameStatus === 'RUNNING' && !r.nextHandAt && !r.config.autoStartNext && isOwner && <div className="center-note">Press “Deal next hand” in the host menu to continue.</div>}
        </>
      )}
    </div>
  );
}
