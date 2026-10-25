/**
 * Original PokerThen brand geometry (mark + hand-built monoline lettering).  No fonts are used: the wordmark is
 * drawn from stroked paths so it renders identically everywhere and scales crisply.
 */
import type { ReactNode } from 'react';

/** Suit outlines on a 24x24 grid, fill = currentColor.  Hand drawn for PokerThen. */
export const SUIT_PATHS: Record<string, string> = {
  s: 'M12 2C14.6 5.4 20 8.2 20 13.2C20 15.6 18.1 17.4 15.8 17.4C14.4 17.4 13.2 16.8 12.5 15.8C12.6 18 13.3 19.7 14.8 21.2V22H9.2V21.2C10.7 19.7 11.4 18 11.5 15.8C10.8 16.8 9.6 17.4 8.2 17.4C5.9 17.4 4 15.6 4 13.2C4 8.2 9.4 5.4 12 2Z',
  h: 'M12 21.4C11 20.6 3 14.6 3 8.7C3 5.6 5.3 3.6 7.9 3.6C9.7 3.6 11.2 4.6 12 6.1C12.8 4.6 14.3 3.6 16.1 3.6C18.7 3.6 21 5.6 21 8.7C21 14.6 13 20.6 12 21.4Z',
  d: 'M12 2.2C12.9 4.6 15.9 8.6 20.2 12C15.9 15.4 12.9 19.4 12 21.8C11.1 19.4 8.1 15.4 3.8 12C8.1 8.6 11.1 4.6 12 2.2Z',
  c: 'M12 2.6A4.3 4.3 0 0 1 14.3 10.5A4.5 4.5 0 1 1 15.7 13.6C14.7 13.8 14.3 14.2 14.3 14.8C14.3 17.5 15 19.8 16.6 21.2V22H7.4V21.2C9 19.8 9.7 17.5 9.7 14.8C9.7 14.2 9.3 13.8 8.3 13.6A4.5 4.5 0 1 1 9.7 10.5A4.3 4.3 0 0 1 12 2.6Z',
};

/** The brand mark: a green chip-tile carrying a white spade.  `size` is the drawing box; viewBox 0 0 32 32. */
export function MarkShape({ idSuffix = 'm' }: { idSuffix?: string }): ReactNode {
  const g = 'ptm-grad-' + idSuffix;
  return (
    <>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3cc57e" />
          <stop offset="1" stopColor="#167a47" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill={`url(#${g})`} />
      <circle cx="16" cy="16" r="12.2" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.5" strokeDasharray="5.2 4.1" />
      <g transform="translate(5.6 5.4) scale(.8)" fill="#fff"><path d={SUIT_PATHS.s} /></g>
    </>
  );
}

/** Monoline letters (cap height 12, x-height 8, baseline y=12).  [path, advance] */
const L = {
  P: ['M1.5 12V1.2h4.4a3.4 3.4 0 0 1 0 6.8H1.5', 10.6],
  o: ['M4.6 4.1a3.9 3.9 0 1 1 0 7.8a3.9 3.9 0 1 1 0-7.8z', 10],
  k: ['M1.5 1V12M8 4.3L1.8 8.9M4.4 7.3L8.5 12', 9.4],
  e: ['M0.9 8h7.7a3.9 3.9 0 1 0-1 2.7', 10.2],
  r: ['M1.5 4.2V12M1.5 8c0-2.4 1.7-3.9 4.3-3.8', 7],
  T: ['M0.6 1.2h9.6M5.4 1.2V12', 10.8],
  h: ['M1.5 1V12M1.5 8.3c0-2.6 1.7-4.2 3.9-4.2s3.7 1.6 3.7 4.2V12', 10.4],
  n: ['M1.5 4.2V12M1.5 8.3c0-2.6 1.7-4.2 3.9-4.2s3.7 1.6 3.7 4.2V12', 10.4],
} as const;
const POKER = ['P', 'o', 'k', 'e', 'r'] as const;
const THEN = ['T', 'h', 'e', 'n'] as const;
const GAP = 2.2;
const poker = layout(POKER, 0);
const pokerW = poker.w;
const then = layout(THEN, pokerW + GAP);
/** total drawing width of the wordmark in glyph units (height 12 + stroke) */
export const WORD_W = then.end;

function layout(keys: readonly (keyof typeof L)[], x0: number) {
  let x = x0;
  const items = keys.map((k) => { const it = { d: L[k][0], x }; x += L[k][1]; return it; });
  return { items, w: x - x0, end: x };
}

/** the wordmark drawn at glyph scale 1 (height 12); wrap in a <g transform> to size it. */
export function WordmarkShape({ pokerColor, thenColor, stroke = 2 }: { pokerColor: string; thenColor: string; stroke?: number }): ReactNode {
  const common = { fill: 'none', strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <>
      <g stroke={pokerColor} {...common}>{poker.items.map((it, i) => <path key={i} d={it.d} transform={`translate(${it.x} 0)`} />)}</g>
      <g stroke={thenColor} {...common}>{then.items.map((it, i) => <path key={i} d={it.d} transform={`translate(${it.x} 0)`} />)}</g>
    </>
  );
}

/** SVG markup string of the mark (used for the favicon / data URIs). */
export const MARK_SVG_INNER =
  '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3cc57e"/><stop offset="1" stop-color="#167a47"/></linearGradient></defs>' +
  '<rect x="1" y="1" width="30" height="30" rx="8" fill="url(#g)"/>' +
  '<circle cx="16" cy="16" r="12.2" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="5.2 4.1"/>' +
  `<g transform="translate(5.6 5.4) scale(.8)" fill="#fff"><path d="${SUIT_PATHS.s}"/></g>`;
