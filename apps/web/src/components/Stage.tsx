import { useMemo, useRef } from 'react';
import { bestHand, handLabel } from '@pokerthen/engine';
import type { SeatView, Snapshot } from '@pokerthen/protocol';
import { fmtAmount } from '../format';
import { usePortrait } from '../layout';
import type { Prefs } from '../prefs';
import { Avatar, CardBack, CardFace, copyText, toast } from './ui';

/** Ten canonical seat anchors (centre, % of the stage). Landscape = the product spec / PokerNow map, fixed numbering. */
const POS_LAND: Array<[number, number]> = [[62, 90], [38, 90], [16, 75], [9, 50], [16, 25], [38, 10], [62, 10], [84, 25], [91, 50], [84, 75]];
/** Portrait (phones): viewer at the bottom centre, then up the left column, across the top row, down the right column.
 *  Vertical bands of the stage: top row ≈14%, pot ≈21%, board ≈28–41%, three side rows ≈54/70/86%, viewer ≈88%. */
const POS_PORT: Array<[number, number]> = [[50, 88], [15, 86], [15, 70], [15, 54], [17, 14], [50, 14], [83, 14], [85, 54], [85, 70], [85, 86]];
const CENTER_LAND: [number, number] = [50, 44];
const CENTER_PORT: [number, number] = [50, 47];

const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const FLIP_STAGGER_MS = 120;
const DEAL_STAGGER_MS = 70;

interface Props {
  snap: Snapshot;
  prefs: Prefs;
  serverNow: number;
  onSeatClick(seat: number): void;
  inviteUrl: string;
}

/** Hand-strength badge for a seat whose two cards are known (own cards, or shown at showdown). */
function badgeFor(seat: SeatView, boards: string[][]): string | null {
  if (!seat.cards || seat.folded || boards.length !== 1) return null;
  const board = boards[0];
  if (board.length < 3 || !seat.cards.every(Boolean)) return null;
  return handLabel(bestHand([...(seat.cards as string[]), ...board]));
}

/** For a finished, contested hand: the five winning cards per board, so the rest can be dimmed. */
function winningFive(snap: Snapshot): Array<Set<string> | null> {
  const h = snap.hand;
  if (!h) return [];
  if (h.phase !== 'COMPLETE' || !h.results || h.results.uncontested) return h.boards.map(() => null);
  const pot = h.results.pots[0];
  return h.boards.map((board, bi) => {
    const award = pot?.awards.find((a) => a.run === bi + 1);
    if (!award || board.length < 5) return null;
    const set = new Set<string>();
    for (const w of award.winners) {
      const cs = snap.seats[w.seat]?.cards;
      if (cs && cs.every(Boolean)) for (const c of bestHand([...(cs as string[]), ...board]).best) set.add(c);
    }
    return set.size ? set : null;
  });
}

/** Per-card flip delays are fixed the first time a card is seen, so re-renders never restart or skip the stagger. */
function useFlipDelays(handId: string | undefined) {
  const ref = useRef<{ id: string | undefined; map: Map<string, number> }>({ id: handId, map: new Map() });
  if (ref.current.id !== handId) ref.current = { id: handId, map: new Map() };
  let fresh = 0;
  return (key: string) => {
    const m = ref.current.map;
    if (!m.has(key)) m.set(key, fresh++ * FLIP_STAGGER_MS);
    return m.get(key) as number;
  };
}

export function Stage({ snap, prefs, serverNow, onSeatClick, inviteUrl }: Props) {
  const portrait = usePortrait();
  const N = snap.seats.length;
  const hero = snap.viewer.seat;
  const hand = snap.hand;
  const cfg = snap.room.config;
  const fmt = (n: number) => fmtAmount(n, prefs, cfg.bb);
  const rotate = portrait || prefs.rotate === 'hero';
  const anchors = portrait ? POS_PORT : POS_LAND;
  const center = portrait ? CENTER_PORT : CENTER_LAND;
  const posOf = (seat: number): [number, number] => anchors[rotate ? (seat - (hero ?? 0) + N) % N : seat];

  const boards = hand?.boards ?? [];
  const dealOrder = snap.fairness?.playersInDealOrder ?? [];
  const delayFor = useFlipDelays(hand?.id);
  const dimSets = useMemo(() => winningFive(snap), [snap.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const wins = new Map<number, number>();
  if (hand?.results && hand.phase === 'COMPLETE') for (const p of hand.results.pots) for (const a of p.awards) for (const w of a.winners) wins.set(w.seat, (wins.get(w.seat) ?? 0) + w.amount);

  const canSit = snap.room.status === 'OPEN' && snap.viewer.seat === null && !snap.viewer.myRequest;
  const dealerPos = hand ? posOf(hand.dealerSeat) : null;
  /** Portrait: bets sit on the inner side of side seats / below top-row seats; the dealer button hugs the panel's inner edge. */
  const betPos = (seat: number): [number, number] => {
    const [x, y] = posOf(seat);
    if (!portrait) return lerp([x, y], center, 0.42);
    if (y < 30) return [x < 40 ? x + 6 : x > 60 ? x - 6 : 68, y + 9];
    if (y > 80) return [x < 40 ? x + 18 : x - 18, y + 3.5]; // bottom corners: in the gap between the corner seat and the viewer
    if (x < 40) return [x + 25, y + 3.5];
    if (x > 60) return [x - 25, y + 3.5];
    return [50, 65]; // viewer at the bottom: above its cards, towards the pot
  };
  const dealerAt: [number, number] | null = dealerPos
    ? (!portrait ? lerp(dealerPos, center, 0.27)
      : dealerPos[1] < 30 ? [dealerPos[0] + (dealerPos[0] < 40 ? 15.5 : dealerPos[0] > 60 ? -15.5 : 19), dealerPos[1] - 3.5]
      : dealerPos[1] > 80 && dealerPos[0] < 40 ? [dealerPos[0] + 12.5, dealerPos[1] - 5]
      : dealerPos[1] > 80 && dealerPos[0] > 60 ? [dealerPos[0] - 12.5, dealerPos[1] - 5]
      : dealerPos[0] < 40 ? [dealerPos[0] + 15, dealerPos[1] + 3.5]
      : dealerPos[0] > 60 ? [dealerPos[0] - 15, dealerPos[1] + 3.5]
      : [dealerPos[0] + 16, dealerPos[1] - 8])
    : null;
  const sideOf = (x: number, y: number) => (y < 30 ? 'top' : x < 40 ? (y > 80 ? 'left-low' : 'left') : x > 60 ? (y > 80 ? 'right-low' : 'right') : 'bottom');

  return (
    <div className="stage-box">
      <div className="stage" data-layout={portrait ? 'portrait' : 'landscape'}>
        <div className="table3d" aria-hidden="true">
          <div className="table3d-depth" />
          <div className="table3d-rim" />
          <div className="table3d-felt" />
          <div className="table-mark">No Limit Texas Hold’em</div>
          <div className="table-brand"><span>♠</span> PokerThen</div>
        </div>
        {portrait && (
          <div className="table-info-portrait">
            <div>OWNER: {snap.room.ownerNickname.toUpperCase()}</div>
            <b>NLH ~ {cfg.sb} / {cfg.bb}{cfg.ante ? ` · ante ${cfg.ante}` : ''}</b>
          </div>
        )}

        <Center snap={snap} fmt={fmt} serverNow={serverNow} inviteUrl={inviteUrl} boards={boards} dimSets={dimSets} delayFor={delayFor} />

        {snap.seats.map((seat) => {
          const [x, y] = posOf(seat.index);
          const style = { left: `${x}%`, top: `${y}%` };
          if (seat.empty) {
            const mine = snap.viewer.myRequest?.seat === seat.index;
            return (
              <button key={seat.index} className={`seat empty${canSit ? ' open' : ''}${mine ? ' requested' : ''}`} style={style} disabled={!canSit}
                onClick={() => onSeatClick(seat.index)} aria-label={`Empty seat ${seat.index + 1}${canSit ? ', click to sit' : ''}${mine ? ', your request is pending' : ''}`}>
                <span className="seat-num" aria-hidden="true">{seat.index + 1}</span>
                <span className="sit">{mine ? 'REQUESTED' : canSit ? 'SIT' : ''}</span>
              </button>
            );
          }
          return (
            <Seat key={seat.index} seat={seat} style={style} side={portrait ? sideOf(x, y) : undefined} snap={snap} win={wins.get(seat.index)} fmt={fmt} serverNow={serverNow}
              badge={badgeFor(seat, boards)} dealPos={dealOrder.indexOf(seat.index)} dealN={dealOrder.length} />
          );
        })}

        {snap.seats.map((seat) => {
          if (seat.empty || !seat.street || seat.street <= 0 || hand?.phase === 'COMPLETE') return null;
          const [bx, by] = betPos(seat.index);
          return <div key={'b' + seat.index} className="bet" style={{ left: `${bx}%`, top: `${by}%` }}>{fmt(seat.street)}</div>;
        })}

        {dealerAt && (
          <div className="dealer-btn" style={{ left: `${dealerAt[0]}%`, top: `${dealerAt[1]}%` }} aria-label="Dealer button" title="Dealer">D</div>
        )}
      </div>
    </div>
  );
}

/* ───────────── a seat ───────────── */

function Seat({ seat, style, side, snap, win, fmt, serverNow, badge, dealPos, dealN }: {
  seat: SeatView; style: React.CSSProperties; side?: string; snap: Snapshot; win?: number; fmt(n: number): string; serverNow: number;
  badge: string | null; dealPos: number; dealN: number;
}) {
  const hand = snap.hand;
  const me = seat.memberId === snap.viewer.memberId;
  const betting = !!hand && hand.phase === 'BETTING';
  const turn = betting && hand!.toActSeat === seat.index;
  const away = seat.participation === 'SITTING_OUT';
  const cards = seat.cards ?? (seat.holeCount ? [null, null] : null);

  const cls = ['seat'];
  if (me) cls.push('me');
  if (turn) cls.push('turn');
  if (seat.folded) cls.push('folded');
  if (win) cls.push('winner');
  if (away || seat.connected === false) cls.push('away');
  if (cards) cls.push('has-cards');

  // status caption under the avatar (only shown when no cards cover it) and the tag under the panel
  let caption: string | null = null;
  if (seat.leaving) caption = 'LEAVING';
  else if (away) caption = seat.returnOnBB ? 'ON BB' : 'AWAY';
  else if (seat.connected === false) caption = 'OFFLINE';
  else if (seat.waitingForNextHand) caption = 'WAITING';
  else if (!seat.inHand && seat.stack === 0) caption = 'OUT';

  let tag: { text: string; tone: string } | null = null;
  if (seat.folded) tag = { text: 'Folded', tone: 'dim' };
  else if (seat.allIn && seat.inHand && hand?.phase !== 'COMPLETE') tag = { text: 'All-in', tone: 'warn' };
  else if (seat.leaving) tag = { text: 'Leaving after hand', tone: 'dim' };
  else if (away) tag = { text: seat.returnOnBB ? 'Back on big blind' : 'Sitting out', tone: 'dim' };
  else if (seat.connected === false) tag = { text: 'Offline', tone: 'dim' };
  else if (seat.waitingForNextHand) tag = { text: 'Waiting for next hand', tone: 'dim' };
  else if (!seat.inHand && seat.stack === 0) tag = { text: 'Out of chips', tone: 'dim' };

  // last-action bubble
  let bubble: string | null = null;
  const a = seat.lastAction;
  if (betting && a && !turn && !seat.folded && seat.inHand) {
    if (seat.allIn && a !== 'check') bubble = 'all-in';
    else if (a === 'check' || a === 'fold') bubble = a;
    else if (a === 'call') bubble = `call ${fmt(seat.street ?? 0)}`;
    else bubble = `${a} ${fmt(seat.street ?? 0)}`;
  }

  const total = snap.room.config.actionSeconds ? snap.room.config.actionSeconds * 1000 : null;
  const left = turn && hand!.deadline ? Math.max(0, hand!.deadline - serverNow) : null;
  const pct = left !== null && total ? Math.min(100, (left / total) * 100) : null;

  return (
    <div className={cls.join(' ')} style={style} data-side={side}
      aria-label={`${seat.nickname}, seat ${seat.index + 1}, ${seat.stack} chips${tag ? ', ' + tag.text : ''}${turn ? ', their turn' : ''}${win ? `, wins ${win}` : ''}`}>
      <div className="seat-panel">
        {!cards && (
          <span className="seat-avatar"><Avatar name={seat.nickname ?? '?'} id={seat.memberId ?? ''} size="2em" />{caption && <small>{caption}</small>}</span>
        )}
        <div className="seat-text">
          <div className="seat-name">{seat.nickname}{snap.room.ownerId === seat.memberId ? <span className="host-star" title="Host" aria-label="host"> ★</span> : null}</div>
          <div className="seat-stack">{fmt(seat.stack ?? 0)}</div>
        </div>
        {win ? <span className="win-pill">+{fmt(win)}</span> : null}
        {(seat.isSB || seat.isBB) && <span className="blind-badge" title={seat.isSB ? 'Small blind' : 'Big blind'}>{seat.isSB ? 'SB' : 'BB'}</span>}
        {turn && left !== null && <span className="sr-only">{Math.ceil(left / 1000)} seconds left</span>}
        {pct !== null && <div className="seat-timer" aria-hidden="true"><i style={{ width: `${pct}%` }} data-low={left! < 5000 ? '1' : undefined} /></div>}
      </div>

      {cards && (
        <div className="seat-cards">
          {cards.map((c, j) => {
            const delay = dealPos >= 0 && dealN > 0 ? (j * dealN + dealPos) * DEAL_STAGGER_MS : j * DEAL_STAGGER_MS;
            const key = `${hand?.id ?? 'x'}-${seat.index}-${j}-${c ? 'f' : 'b'}`;
            return c
              ? <CardFace key={key} card={c} size="md" className="hole" dim={!!seat.folded} win={!!win} style={{ animationDelay: `${delay}ms` }} />
              : <CardBack key={key} size="md" className="hole" style={{ animationDelay: `${delay}ms` }} />;
          })}
          {badge && <div className="hand-badge">{badge}</div>}
        </div>
      )}

      {bubble && <div className="bubble" key={bubble}>{bubble}</div>}
      {tag && <div className={`seat-tag ${tag.tone}`}>{tag.text}</div>}
    </div>
  );
}

/* ───────────── table centre: pot, board, results, waiting cards ───────────── */

function Center({ snap, fmt, serverNow, inviteUrl, boards, dimSets, delayFor }: {
  snap: Snapshot; fmt(n: number): string; serverNow: number; inviteUrl: string; boards: string[][]; dimSets: Array<Set<string> | null>; delayFor(key: string): number;
}) {
  const hand = snap.hand;
  const r = snap.room;
  const isOwner = snap.viewer.role === 'owner';
  const idle = !hand || hand.phase === 'COMPLETE';
  const eligible = snap.seats.filter((s) => !s.empty && s.participation === 'ACTIVE' && (s.stack ?? 0) > 0).length;

  let waiting: JSX.Element | null = null;
  const copy = async () => toast((await copyText(inviteUrl)) ? 'Invite link copied' : 'Copy failed — select the link and copy it', 'good');
  if (r.status === 'CLOSED') {
    waiting = <div className="center-card"><h3>This table has ended</h3><p>The history and ledger are still available from the log.</p></div>;
  } else if (r.paused) {
    waiting = <div className="center-card"><h3>Game paused</h3><p>{isOwner ? 'Press Resume (or P) to continue.' : 'The host paused the game. Clocks are frozen.'}</p></div>;
  } else if (idle && r.gameStatus === 'STOPPED') {
    waiting = (
      <div className="center-card">
        <h3>{eligible < 2 ? 'Waiting for others' : 'Ready to start'}</h3>
        <p>{eligible < 2 ? 'At least two players need a seat and chips.' : isOwner ? 'Everyone seated? Press START GAME when you’re ready.' : 'Waiting for the host to start the game.'}</p>
        <div className="center-share">
          <span>Share this link with your friends!</span>
          <div className="center-actions">
            <button className="btn primary sm" onClick={copy}>Copy link</button>
            {typeof navigator.share === 'function' && <button className="btn sm" onClick={() => navigator.share({ title: 'Join my poker table', url: inviteUrl }).catch(() => {})}>Share</button>}
          </div>
          <code>{inviteUrl}</code>
        </div>
      </div>
    );
  } else if (idle && r.gameStatus === 'RUNNING' && !r.nextHandAt && eligible < 2) {
    waiting = <div className="center-card"><h3>Waiting for players</h3><p>Another player with chips is needed to deal the next hand.</p></div>;
  }

  const results = hand?.phase === 'COMPLETE' ? hand.results : null;
  const lines: string[] = [];
  if (results) {
    const twoRuns = hand!.boards.length === 2;
    const nameOf = (seat: number) => snap.seats[seat]?.nickname ?? `Seat ${seat + 1}`;
    for (const p of results.pots) for (const a of p.awards) for (const w of a.winners) {
      const lbl = results.pots.length > 1 ? (p.index === 0 ? 'Main pot' : `Side pot ${p.index}`) : 'Pot';
      lines.push(`${nameOf(w.seat)} wins ${fmt(w.amount)} · ${twoRuns ? `Run ${a.run} ` : ''}${lbl}${w.hand ? ` · ${w.hand}` : ''}`);
    }
    if (results.refund) lines.push(`${nameOf(results.refund.seat)} gets ${fmt(results.refund.amount)} back (uncalled)`);
  }
  const nextIn = idle && r.nextHandAt ? Math.max(0, Math.ceil((r.nextHandAt - serverNow) / 1000)) : null;
  const collected = hand?.phase === 'COMPLETE' ? 0 : hand?.collectedPot ?? 0;
  const showTotal = !!hand && hand.phase !== 'COMPLETE' && hand.totalPot > collected;

  const row = (arr: string[], bi: number, label?: string) => (
    <div className={`board${boards.length > 1 ? ' small' : ''}`} key={bi} aria-label={label ?? 'Community cards'}>
      {label && <span className="board-label">{label}</span>}
      {arr.map((c, i) => (
        <CardFace key={`${hand?.id}-${bi}-${i}-${c}`} card={c} size="lg" className="board-card" dim={!!dimSets[bi] && !dimSets[bi]!.has(c)}
          style={{ animationDelay: `${delayFor(`${hand?.id}-${bi}-${i}`)}ms` }} />
      ))}
    </div>
  );

  return (
    <>
      <div className="pot" aria-label={`Pot ${collected}`}>
        <span className="pot-val">{fmt(collected)}</span>
        {showTotal && <span className="pot-total">total {fmt(hand!.totalPot)}</span>}
      </div>
      {hand && hand.pots.length > 1 && !waiting && <div className="side-pots">{hand.pots.map((p, i) => `${i === 0 ? 'Main' : 'Side ' + i} ${fmt(p.amount)}`).join(' · ')}</div>}

      {waiting ? <div className="center-wrap">{waiting}</div> : (
        <>
          <div className="board-wrap">
            {boards.length === 2 ? <>{row(boards[0], 0, 'Run 1')}{row(boards[1], 1, 'Run 2')}</> : boards.length === 1 ? row(boards[0], 0) : null}
            {snap.rabbit && (
              <div className="board rabbit small" aria-label="Rabbit hunt, cards that were not dealt">
                <span className="board-label">NOT DEALT</span>
                {snap.rabbit.cards.map((c, i) => <CardFace key={`rb-${hand?.id}-${i}`} card={c} size="lg" className="board-card" hypothetical style={{ animationDelay: `${i * FLIP_STAGGER_MS}ms` }} />)}
              </div>
            )}
          </div>
          {hand?.vote && <div className="center-note vote">Run it twice? {hand.vote.mine === 'pending' ? 'Choose below.' : `Waiting for ${hand.vote.pendingSeats.length} player(s)…`}</div>}
          {(lines.length > 0 || nextIn !== null) && (
            <div className="results-wrap">
              {lines.length > 0 && <div className="results" aria-live="polite">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>}
              {nextIn !== null && <div className="center-note">Next hand in {nextIn}s</div>}
            </div>
          )}
        </>
      )}
    </>
  );
}
