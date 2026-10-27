import { memo, useEffect, useRef, useState } from "react";
import type { BoardCardVM, BoardVM, CardCode, HoleCardVM } from "@pokerthen/shared";
import { CardBack, SuitIcon, useAudio } from "./deps";
import { BOARD_SLOT_PITCH_REM, FLIP_POLL_MS, FLIP_STAGGER_MS, rabbitBarLeftRem, rabbitBarWidthRem } from "./logic";
import { TIcon } from "./TIcon";

export type CardSize = "big" | "med" | "small" | "small-2";

/** One playing card. `code=null` = back. `flipped` drives the rotateY flipper (SPEC 4.8). */
export const Card = memo(function Card(props: {
  code: CardCode | null;
  flipped: boolean;
  size: CardSize;
  animated?: boolean;
  subSuit?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { code, flipped, size, animated, subSuit, className, style } = props;
  const rank = code ? (code[0] === "T" ? "10" : code[0]!) : "";
  const suit = code ? code[1]! : "";
  return (
    <div className={`card-container ${size}${code ? " card-s-" + code[0] : ""}${subSuit ? " sub-suit" : ""}${className ? " " + className : ""}`} style={style}>
      <div className={`card-flipper${animated ? " card-flipper-animated" : ""}${flipped && code ? " flipped" : ""}`}>
        <div className="card-face card-back-face"><CardBack /></div>
        <div className={`card-face card-front-face suit-${suit}`}>
          {code && (
            <>
              <span className="card-rank">{rank}</span>
              <span className="card-suit card-suit-big"><SuitIcon suit={suit as "s" | "h" | "d" | "c"} /></span>
              <span className="card-suit card-suit-small"><SuitIcon suit={suit as "s" | "h" | "d" | "c"} /></span>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

/** Hole-card fan `.table-player-cards` (SPEC 4.8). Keeps the last cards so the fold fade can play. */
export function HoleCards(props: { cards: HoleCardVM[]; folded: boolean; subSuit: boolean }) {
  const { cards, folded, subSuit } = props;
  const last = useRef<HoleCardVM[]>([]);
  if (cards.length) last.current = cards;
  else if (!folded) last.current = [];
  const shown = cards.length ? cards : folded ? last.current : [];
  if (!shown.length) return null;
  const size: CardSize = shown.length >= 5 ? "small-2" : shown.length === 4 ? "small" : "med";
  return (
    <div className={`table-player-cards cards-${shown.length}${folded && !cards.length ? " hide-cards" : ""}`}>
      {shown.map((c, i) => (
        <Card
          key={i}
          code={c.faceUp ? c.code : null}
          flipped={c.faceUp}
          size={size}
          subSuit={subSuit}
          className={`hole-card hole-card-${i + 1}${c.up ? " up" : ""}${c.dim ? " dim" : ""}${c.sneak ? " sneak" : ""}`}
        />
      ))}
    </div>
  );
}

/** Staggered flipping of board cards (insert face-down, flip 150 ms apart, poll 50 ms; SPEC 4.8). */
function useFlipQueue(cards: BoardCardVM[], keyOf: (c: BoardCardVM, i: number) => string, silentInitial: boolean): Set<string> {
  const audio = useAudio();
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const seen = useRef<Set<string> | null>(null);
  const [flippedKeys, setFlipped] = useState<Set<string>>(() => new Set());
  const flippedRef = useRef(flippedKeys);
  flippedRef.current = flippedKeys;
  const pending = useRef<string[]>([]);
  const lastFlip = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const keys = cards.map(keyOf);
  const sig = keys.map((k, i) => k + (cards[i]!.flipped ? "+" : "-")).join("|");

  useEffect(() => {
    const target = new Map(cards.map((c, i) => [keyOf(c, i), c.flipped] as const));
    if (seen.current === null) {
      if (silentInitial) {
        // first mount (reconnect): existing cards are already flipped, silently
        seen.current = new Set(keys);
        setFlipped(new Set(keys.filter((k) => target.get(k))));
        return;
      }
      seen.current = new Set();
    }
    const present = new Set(keys);
    const hadPending = pending.current.length > 0;
    let fresh = false;
    for (const k of keys) if (!seen.current.has(k)) { seen.current.add(k); fresh = true; }
    pending.current = pending.current.filter((k) => present.has(k));
    for (const k of keys) {
      if (target.get(k) && !flippedRef.current.has(k) && !pending.current.includes(k)) pending.current.push(k);
    }
    if (fresh && !hadPending) lastFlip.current = Date.now();
    setFlipped((prev) => {
      const n = new Set<string>();
      for (const k of prev) if (present.has(k)) n.add(k);
      return n.size === prev.size ? prev : n;
    });
    if (pending.current.length && !timer.current) {
      timer.current = setInterval(() => {
        const next = pending.current[0];
        if (next === undefined) {
          clearInterval(timer.current!);
          timer.current = null;
          return;
        }
        if (Date.now() - lastFlip.current >= FLIP_STAGGER_MS - 2) {
          pending.current.shift();
          lastFlip.current = Date.now();
          setFlipped((prev) => new Set(prev).add(next));
          try { audioRef.current.play("card-place"); } catch { /* audio is optional */ }
        }
      }, FLIP_POLL_MS);
    }
  }, [sig]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  return flippedKeys;
}

function Row(props: { cards: BoardCardVM[]; run: 1 | 2; handNumber: number; extra?: React.ReactNode; ghosts?: number }) {
  const { cards, run, handNumber, extra, ghosts = 0 } = props;
  const keyOf = (c: BoardCardVM, i: number) => `${handNumber}:${run}:${i}:${c.code}`;
  const flipped = useFlipQueue(cards, keyOf, run === 1);
  return (
    <div className={`table-cards run-${run}`}>
      {cards.map((c, i) => {
        const k = keyOf(c, i);
        return (
          <Card
            key={k}
            code={c.code}
            flipped={flipped.has(k) && c.flipped}
            animated
            size="big"
            className={`board-card${c.highlighted ? " up" : ""}${c.semiHide ? " semi-hide" : ""}${c.rabbit ? " rabbit" : ""}${c.afterPadding ? " after-padding" : ""}`}
          />
        );
      })}
      {Array.from({ length: ghosts }, (_, i) => (
        <Card key={`g${i}`} code={null} flipped={false} size="big" className="hide semi-hide ghost-card" />
      ))}
      {extra}
    </div>
  );
}

/** Board: run 1 row, optional run 2 row, rabbit ghost slots + REVEAL bar (SPEC 4.8, 14). */
export function BoardCards(props: { board: BoardVM; handNumber: number; onReveal: () => void }) {
  const { board, handNumber, onReveal } = props;
  const n = board.rabbitSlots;
  const bar =
    n > 0 && board.rabbitAvailable ? (
      <button
        type="button"
        className="reveal-button"
        style={{ left: `${rabbitBarLeftRem(board.run1.length)}rem`, width: `${rabbitBarWidthRem(n)}rem` }}
        onClick={onReveal}
      >
        <TIcon name="eye" className="reveal-eye" />
        <span className="reveal-label">Reveal</span>
        <span className="reveal-tip">h</span>
      </button>
    ) : null;
  return (
    <>
      <Row cards={board.run1} run={1} handNumber={handNumber} ghosts={n} extra={bar} />
      {board.run2.length > 0 ? <Row cards={board.run2} run={2} handNumber={handNumber} /> : null}
    </>
  );
}
export { BOARD_SLOT_PITCH_REM };
