/**
 * PokerThen icon set - original, hand-authored, 24x24 grid, `currentColor`.
 * Style: rounded 2px strokes for outline glyphs, solid fills for "status" glyphs (person, pause, stop, hamburger...).
 * A `<S>` child draws with stroke, `<F>` with fill; both inherit currentColor.
 */
import type { ReactNode } from 'react';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const solid = { fill: 'currentColor', stroke: 'none' } as const;

const S = ({ d, w }: { d: string; w?: number }) => <path d={d} {...stroke} strokeWidth={w ?? 2} />;
const F = ({ d, evenodd }: { d: string; evenodd?: boolean }) => <path d={d} {...solid} fillRule={evenodd ? 'evenodd' : undefined} />;
const Dot = ({ x, y, r = 1.3 }: { x: number; y: number; r?: number }) => <circle cx={x} cy={y} r={r} {...solid} />;

/** closed gear outline: `n` rounded teeth, hub hole as an even-odd subpath */
function gear(cx: number, cy: number, ro: number, ri: number, n: number, hole: number): string {
  const pts: string[] = [];
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a = i * step - Math.PI / 2;
    const t = step * 0.2; // half tooth top width (rad)
    const b = step * 0.34; // half tooth base width
    const p = (r: number, ang: number) => `${(cx + r * Math.cos(ang)).toFixed(2)} ${(cy + r * Math.sin(ang)).toFixed(2)}`;
    pts.push(`${i === 0 ? 'M' : 'L'}${p(ri, a - b - step * 0.16)}L${p(ri, a - b)}L${p(ro, a - t)}L${p(ro, a + t)}L${p(ri, a + b)}L${p(ri, a + b + step * 0.16)}`);
  }
  return `${pts.join('')}Z M${cx + hole} ${cy}a${hole} ${hole} 0 1 0 ${-2 * hole} 0a${hole} ${hole} 0 1 0 ${2 * hole} 0Z`;
}

const bars = (
  <>
    <rect x="3.5" y="4.5" width="17" height="3" rx="1.5" {...solid} />
    <rect x="3.5" y="10.5" width="17" height="3" rx="1.5" {...solid} />
    <rect x="3.5" y="16.5" width="17" height="3" rx="1.5" {...solid} />
  </>
);
const speaker = <F d="M3.5 9.6A1.4 1.4 0 0 1 4.9 8.2H7.4L11.7 4.5A.9.9 0 0 1 13.2 5.2V18.8A.9.9 0 0 1 11.7 19.5L7.4 15.8H4.9A1.4 1.4 0 0 1 3.5 14.4Z" />;
const person = <F d="M8 9h8c.8 0 1.5.7 1.5 1.5V15a1 1 0 0 1-2 0v-3.5H15V21a1.2 1.2 0 0 1-2.4 0v-5h-1.2v5A1.2 1.2 0 0 1 9 21v-9.5h-.5V15a1 1 0 0 1-2 0v-4.5C6.5 9.700 7.200 9 8 9Z" />;
const exitArrow = (
  <>
    <S d="M10.5 4H6A1.500 1.500 0 0 0 4.500 5.500v13A1.500 1.500 0 0 0 6 20H10.500" w={2.2} />
    <S d="M9.500 12H20M16 7.500L20.500 12 16 16.500" w={2.2} />
  </>
);
const eye = (
  <>
    <S d="M2 12C4.500 7.500 8 5.200 12 5.200S19.500 7.500 22 12C19.500 16.500 16 18.800 12 18.800S4.500 16.500 2 12Z" />
    <circle cx="12" cy="12" r="3.200" {...solid} />
  </>
);
const chev = (d: string) => <S d={d} w={2.4} />;

export const ICON_NAMES_EXTRA = [
  'chevron-right', 'chevrons-up', 'chevrons-down', 'send', 'info', 'bell', 'link', 'edit', 'trash', 'download', 'crown', 'lock',
] as const;

export const ICON_PATHS: Record<string, ReactNode> = {
  options: bars,
  hamburger: bars,
  'leave-seat': exitArrow,
  quitting: (
    <>
      <F d="M3 9.500h8V5.200a.8.8 0 0 1 1.300-.6l8 6.800a.8.8 0 0 1 0 1.200l-8 6.800a.8.8 0 0 1-1.300-.6V14.500H3Z" />
    </>
  ),
  away: (
    <>
      <circle cx="12" cy="4.600" r="2.600" {...solid} />
      {person}
    </>
  ),
  'im-back': (
    <>
      <F d="M8 3h8a1.500 1.500 0 0 1 1.500 1.500V11h-11V4.500A1.500 1.500 0 0 1 8 3Z" />
      <rect x="4.500" y="12.500" width="15" height="3.200" rx="1.600" {...solid} />
      <rect x="11" y="15.500" width="2" height="3.500" {...solid} />
      <S d="M6 20.500h12" w={2.200} />
    </>
  ),
  'sound-off': (<>{speaker}<S d="M16 9.500l5 5M21 9.500l-5 5" /></>),
  'sound-low': (<>{speaker}<S d="M15.500 9.200a4 4 0 0 1 0 5.600" /></>),
  'sound-med': (<>{speaker}<S d="M15.500 9.200a4 4 0 0 1 0 5.600" /><S d="M18.300 6.500a8 8 0 0 1 0 11" /></>),
  'sound-high': (<>{speaker}<S d="M15.500 9.200a4 4 0 0 1 0 5.600" /><S d="M18.300 6.500a8 8 0 0 1 0 11" /><S d="M21 4a11.500 11.500 0 0 1 0 16" /></>),
  spectators: eye,
  eye,
  pause: (<><rect x="5.500" y="4.500" width="4.200" height="15" rx="1.200" {...solid} /><rect x="14.300" y="4.500" width="4.200" height="15" rx="1.200" {...solid} /></>),
  play: <F d="M7 5.200v13.600a1 1 0 0 0 1.500.9l11-6.800a1 1 0 0 0 0-1.700l-11-6.800A1 1 0 0 0 7 5.200Z" />,
  stop: <rect x="5.500" y="5.500" width="13" height="13" rx="2.200" {...solid} />,
  fullscreen: (
    <>
      <S d="M9.500 4H5a1 1 0 0 0-1 1v4.500M4.500 4.500l5 5" w={2.200} />
      <S d="M14.500 4H19a1 1 0 0 1 1 1v4.500M19.500 4.500l-5 5" w={2.200} />
      <S d="M9.500 20H5a1 1 0 0 1-1-1v-4.500M4.500 19.500l5-5" w={2.200} />
      <S d="M14.500 20H19a1 1 0 0 0 1-1v-4.500M19.500 19.500l-5-5" w={2.200} />
    </>
  ),
  collapse: (
    <>
      <S d="M4 9.500h4.500a1 1 0 0 0 1-1V4M4 4l5.500 5.500" w={2.200} />
      <S d="M20 9.500h-4.500a1 1 0 0 1-1-1V4M20 4l-5.500 5.500" w={2.200} />
      <S d="M4 14.500h4.500a1 1 0 0 1 1 1V20M4 20l5.500-5.500" w={2.200} />
      <S d="M20 14.500h-4.500a1 1 0 0 0-1 1V20M20 20l-5.500-5.500" w={2.200} />
    </>
  ),
  external: (
    <>
      <S d="M13.500 4H20v6.500M20 4l-9 9" />
      <S d="M18 14.500v4A1.500 1.500 0 0 1 16.500 20h-11A1.500 1.500 0 0 1 4 18.500v-11A1.500 1.500 0 0 1 5.500 6h4" />
    </>
  ),
  balloon: (
    <path
      {...solid}
      fillRule="evenodd"
      d="M12 3.500c4.970 0 9 3.360 9 7.500 0 4.140-4.030 7.500-9 7.500-.95 0-1.860-.12-2.720-.35L5 20.500l.62-3.700C3.970 15.400 3 13.300 3 11c0-4.140 4.030-7.500 9-7.500ZM8.200 11a1.300 1.300 0 1 0 2.600 0a1.300 1.300 0 1 0-2.600 0ZM10.700 11M13.200 11a1.300 1.300 0 1 0 2.600 0a1.300 1.300 0 1 0-2.600 0Z"
    />
  ),
  clock: (<><circle cx="12" cy="12" r="9" {...stroke} /><S d="M12 7v5.200l3.400 2" /></>),
  fold: <S d="M5.500 5.500l13 13M18.500 5.500l-13 13" w={3.400} />,
  trophy: (
    <>
      <F d="M7 3.500h10V9a5 5 0 0 1-10 0Z" />
      <S d="M7 5.500H4.500v1.800A3 3 0 0 0 7.600 10.300M17 5.500h2.500v1.800a3 3 0 0 1-3.100 3" w={1.800} />
      <rect x="10.800" y="13.500" width="2.400" height="4" {...solid} />
      <rect x="7.500" y="17.500" width="9" height="3" rx="1.200" {...solid} />
    </>
  ),
  reentry: (
    <>
      <S d="M4.100 10.600A8 8 0 0 1 18.200 7" w={2.200} />
      <S d="M19.900 13.400A8 8 0 0 1 5.800 17" w={2.200} />
      <F d="M21.200 4.200v5.300h-5.300Z" />
      <F d="M2.800 19.800v-5.300h5.300Z" />
    </>
  ),
  home: <F d="M12 3.600a1 1 0 0 1 .65.24l8 6.800a1 1 0 0 1 .35.76V19a1.500 1.500 0 0 1-1.500 1.500H15v-5.500H9v5.500H4.500A1.500 1.500 0 0 1 3 19v-7.600a1 1 0 0 1 .35-.76l8-6.800a1 1 0 0 1 .65-.24Z" />,
  'new-game': (<><rect x="3.500" y="3.500" width="17" height="17" rx="4.500" {...stroke} /><S d="M12 8v8M8 12h8" w={2.200} /></>),
  close: <S d="M6 6l12 12M18 6L6 18" w={2.400} />,
  x: <S d="M7 7l10 10M17 7L7 17" w={2.200} />,
  copy: (<><rect x="4" y="8" width="12" height="12" rx="2.200" {...stroke} /><S d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2" /></>),
  'chevron-up': chev('M5.500 15l6.500-6.500L18.500 15'),
  'chevron-down': chev('M5.500 9l6.500 6.500L18.500 9'),
  'chevron-left': chev('M15 5.500L8.500 12l6.500 6.500'),
  'chevron-right': chev('M9 5.500l6.500 6.500L9 18.500'),
  'chevrons-up': (<><S d="M5.500 12.500L12 6l6.500 6.500" w={2.400} /><S d="M5.500 19L12 12.500 18.500 19" w={2.400} /></>),
  'chevrons-down': (<><S d="M5.500 5L12 11.500 18.500 5" w={2.400} /><S d="M5.500 11.500L12 18l6.500-6.500" w={2.400} /></>),
  plus: <S d="M12 5v14M5 12h14" w={2.400} />,
  minus: <S d="M5 12h14" w={2.400} />,
  help: (<><circle cx="12" cy="12" r="9.500" {...stroke} /><S d="M9.200 9.600a2.900 2.900 0 0 1 5.600.8c0 1.900-2.800 2.300-2.800 4.200" /><Dot x={12} y={17.500} r={1.300} /></>),
  info: (<><circle cx="12" cy="12" r="9.500" {...stroke} /><S d="M12 11v6" /><Dot x={12} y={7.600} r={1.300} /></>),
  'record-dot': (<><circle cx="12" cy="12" r="6.500" {...solid} /><circle cx="12" cy="12" r="9.600" {...stroke} strokeWidth={1.600} /></>),
  emoji: (<><circle cx="12" cy="12" r="9.500" {...stroke} /><Dot x={8.800} y={9.800} r={1.300} /><Dot x={15.200} y={9.800} r={1.300} /><S d="M8 14.200a4.500 4.500 0 0 0 8 0" /></>),
  settings: <path d={gear(12, 12, 9.800, 7.400, 8, 3.200)} {...solid} fillRule="evenodd" stroke="currentColor" strokeWidth={1.200} strokeLinejoin="round" />,
  players: (
    <>
      <circle cx="9" cy="8" r="3.400" {...solid} />
      <F d="M2.800 20v-1.200A5.300 5.300 0 0 1 8.100 13.500h1.800A5.300 5.300 0 0 1 15.200 18.800V20Z" />
      <S d="M15.200 4.800a3.200 3.200 0 0 1 0 6.400M18.600 14.200a4.500 4.500 0 0 1 2.700 4.300V20" w={1.900} />
    </>
  ),
  preferences: (
    <>
      <S d="M4 6h3.600M12.400 6H20M4 12h8.600M17.400 12H20M4 18h2.600M11.400 18H20" w={2} />
      <circle cx="10" cy="6" r="2.400" {...stroke} strokeWidth={1.900} />
      <circle cx="15" cy="12" r="2.400" {...stroke} strokeWidth={1.900} />
      <circle cx="9" cy="18" r="2.400" {...stroke} strokeWidth={1.900} />
    </>
  ),
  'video-audio': (<><rect x="2.800" y="6.500" width="12.400" height="11" rx="2.600" {...stroke} /><S d="M15.200 10.800l5.200-3v8.400l-5.200-3" /></>),
  camera: (
    <>
      <S d="M4.500 8A1.500 1.500 0 0 1 6 6.500h2L9.400 4.500h5.200L16 6.500h2A1.500 1.500 0 0 1 19.500 8v9.500A1.500 1.500 0 0 1 18 19H6a1.500 1.500 0 0 1-1.500-1.500Z" />
      <circle cx="12" cy="12.600" r="3.200" {...stroke} />
    </>
  ),
  mic: (
    <>
      <rect x="8.800" y="3" width="6.400" height="11.500" rx="3.200" {...solid} />
      <S d="M5.800 11.500a6.200 6.200 0 0 0 12.400 0M12 17.800V21M8.500 21h7" />
    </>
  ),
  'save-hand': (
    <>
      <S d="M6 4h10.500l3 3v11.500A1.500 1.500 0 0 1 18 20H6a1.500 1.500 0 0 1-1.500-1.500V5.500A1.500 1.500 0 0 1 6 4Z" />
      <S d="M8 4v4.500h7V4M8 20v-6h8v6" w={1.800} />
    </>
  ),
  log: (
    <>
      <S d="M6.500 3.500h7l5 5v11A1.500 1.500 0 0 1 17 21H6.500A1.500 1.500 0 0 1 5 19.500v-14A1.500 1.500 0 0 1 6.500 3.500Z" />
      <S d="M13.500 3.500v5h5M8.500 13h7M8.500 16.500h7" w={1.900} />
    </>
  ),
  'sign-in': (<><S d="M13.500 4H18a1.500 1.500 0 0 1 1.500 1.500v13A1.500 1.500 0 0 1 18 20h-4.500" w={2.200} /><S d="M4 12h11M10.800 7.500L15.300 12l-4.500 4.500" w={2.200} /></>),
  check: <S d="M4.800 12.600l4.800 4.800L19.200 7.200" w={2.800} />,
  user: (<><circle cx="12" cy="7.800" r="4.200" {...solid} /><F d="M4.500 20.500v-1A6 6 0 0 1 10.500 13.500h3a6 6 0 0 1 6 6v1Z" /></>),
  ledger: (
    <>
      <S d="M5 5.500A2.500 2.500 0 0 1 7.500 3H19v14H7.500A2.500 2.500 0 0 0 5 19.500Z" />
      <S d="M5 19.500A2.500 2.500 0 0 0 7.500 22H19v-5M9 8h6M9 11.500h4" w={1.900} />
    </>
  ),
  replayer: (
    <>
      <S d="M4 12a8 8 0 1 0 2.300-5.650" w={2.200} />
      <S d="M3.800 3.800v4.800h4.800" w={2.200} />
      <F d="M10.400 8.800v6.400a.6.6 0 0 0 .9.5l5.200-3.200a.6.6 0 0 0 0-1l-5.200-3.200a.6.6 0 0 0-.9.5Z" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.800L21.600 20.200H2.400Z" {...stroke} strokeWidth={2.100} />
      <S d="M12 10v4.600" w={2.200} />
      <Dot x={12} y={17.300} r={1.200} />
    </>
  ),
  send: <F d="M3.500 4.600a.9.9 0 0 1 1.250-.82l16 7.200a.9.9 0 0 1 0 1.640l-16 7.200A.9.9 0 0 1 3.500 18.400L3.500 13.600 12 12 3.500 10.400Z" />,
  bell: (<><S d="M6 17.500V11a6 6 0 0 1 12 0v6.500l1.500 1.500h-15Z" /><S d="M10 21.500h4" /></>),
  link: (<><S d="M10 14a4 4 0 0 0 5.700 0l3-3A4 4 0 0 0 13 5.300l-1.200 1.200" /><S d="M14 10a4 4 0 0 0-5.700 0l-3 3A4 4 0 0 0 11 18.700l1.200-1.200" /></>),
  edit: (<><S d="M4 20l1-4.500L16.500 4A2.100 2.100 0 0 1 19.500 7L8 18.500Z" /><S d="M14.500 6l3.500 3.500" w={1.800} /></>),
  trash: (<><S d="M4 7h16M9.500 7V4.500h5V7M6.500 7l.8 12a1.500 1.500 0 0 0 1.500 1.400h6.400a1.500 1.500 0 0 0 1.500-1.400l.8-12" /><S d="M10 11v6M14 11v6" w={1.800} /></>),
  download: (<><S d="M12 4v11M7.500 10.800L12 15.300l4.500-4.500" /><S d="M4.500 19.500h15" /></>),
  crown: <F d="M3.500 8.500l4.300 3.600L12 5l4.200 7.100 4.300-3.600-1.500 9.500H5Z" />,
  lock: (<><rect x="5" y="10.500" width="14" height="10" rx="2.200" {...solid} /><S d="M8.200 10.500V8a3.800 3.800 0 0 1 7.600 0v2.500" /></>),
};
