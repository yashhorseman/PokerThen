/**
 * The table: dark rail with an inner bevel, felt with soft light / vignette / fine cloth grain and a faint betting line.
 * Pure SVG (crisp at any scale).  The SVG fills its parent box exactly (preserveAspectRatio="none"); the parent must be
 * 55.55 x 26.25 rem (landscape) or 17.4 x 28 rem (portrait) so that the geometry matches the reference proportions
 * (research/02 §3, research/03 §3.1): the table image has transparent margins, the oval itself spans x 9.5-46 rem,
 * y 3.5-23.3 rem of the landscape box and x 1.4-16 rem, y 2.3-25.8 rem of the portrait box.
 */
import { cloneElement } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { WordmarkShape, WORD_W } from './marks';

export type FeltTone = 'green' | 'red' | 'blue';
const TONES: Record<FeltTone, [string, string, string]> = {
  green: ['#2c8f5d', '#1c6b43', '#0f4027'],
  red: ['#a43a3a', '#7a2323', '#451212'],
  blue: ['#2f6fa8', '#1f4f80', '#102c4d'],
};

function Defs({ id, tone, w, h }: { id: string; tone: FeltTone; w: number; h: number }) {
  const [c0, c1, c2] = TONES[tone];
  return (
    <defs>
      <radialGradient id={`${id}-felt`} cx="50%" cy="40%" r="75%" fx="50%" fy="36%">
        <stop offset="0" stopColor={c0} />
        <stop offset=".55" stopColor={c1} />
        <stop offset="1" stopColor={c2} />
      </radialGradient>
      <radialGradient id={`${id}-vig`} cx="50%" cy="48%" r="62%">
        <stop offset=".55" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".5" />
      </radialGradient>
      <linearGradient id={`${id}-top`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".1" />
        <stop offset=".45" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-rail`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4a4c50" />
        <stop offset=".14" stopColor="#323437" />
        <stop offset=".6" stopColor="#1b1c1e" />
        <stop offset="1" stopColor="#101112" />
      </linearGradient>
      <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1a1b1c" />
        <stop offset="1" stopColor="#050505" />
      </linearGradient>
      <linearGradient id={`${id}-hi`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".42" />
        <stop offset=".35" stopColor="#fff" stopOpacity=".05" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-bev`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#74777c" />
        <stop offset=".5" stopColor="#3a3c3f" />
        <stop offset="1" stopColor="#202123" />
      </linearGradient>
      <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="11" />
        <feColorMatrix type="matrix" values="1.6 0 0 0 -.3  1.6 0 0 0 -.3  1.6 0 0 0 -.3  0 0 0 0 1" />
      </filter>
      <filter id={`${id}-blur`} x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation={Math.max(w, h) * 0.014} /></filter>
      <filter id={`${id}-soft`} x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation={Math.max(w, h) * 0.004} /></filter>
    </defs>
  );
}

/** the pieces common to both orientations, parameterised by a shape drawer `S(inset, extra)` */
function Table({ id, shape, dy, bevelInset, feltInset, lineShape, w, h, mark }: {
  id: string;
  shape: (inset: number, y?: number) => ReactElement;
  dy: number;
  bevelInset: number;
  feltInset: number;
  lineShape: ReactElement;
  w: number;
  h: number;
  mark: { x: number; y: number; k: number };
}) {
  const withProps = (el: ReactElement, props: Record<string, unknown>) => cloneElement(el, props);
  const feltClipId = `${id}-clip`;
  return (
    <>
      {/* contact shadow on the room floor */}
      {withProps(shape(-2, dy + 6), { fill: '#000', opacity: 0.55, filter: `url(#${id}-blur)` })}
      {/* side wall of the rail (visible as the dark lip below the table) */}
      {withProps(shape(0, dy), { fill: `url(#${id}-wall)` })}
      {/* rail top surface */}
      {withProps(shape(0), { fill: `url(#${id}-rail)` })}
      {withProps(shape(0), { fill: '#fff', filter: `url(#${id}-grain)`, style: { mixBlendMode: 'overlay' }, opacity: 0.22 })}
      {withProps(shape(0.6), { fill: 'none', stroke: `url(#${id}-hi)`, strokeWidth: 1.2 })}
      {/* inner bevel: lighter lip where the felt is sunk into the rail */}
      {withProps(shape(bevelInset - 1.4), { fill: '#000', opacity: 0.55, filter: `url(#${id}-soft)` })}
      {withProps(shape(bevelInset), { fill: 'none', stroke: `url(#${id}-bev)`, strokeWidth: 2.2 })}
      {/* felt */}
      <clipPath id={feltClipId}>{shape(feltInset)}</clipPath>
      {withProps(shape(feltInset), { fill: `url(#${id}-felt)` })}
      <g clipPath={`url(#${feltClipId})`}>
        <rect width={w} height={h} fill="#fff" filter={`url(#${id}-grain)`} style={{ mixBlendMode: 'overlay' }} opacity={0.55} />
        <rect width={w} height={h} fill={`url(#${id}-top)`} />
        <rect width={w} height={h} fill={`url(#${id}-vig)`} />
        {withProps(shape(feltInset + 1.2), { fill: 'none', stroke: '#000', strokeOpacity: 0.35, strokeWidth: 2.4, filter: `url(#${id}-soft)` })}
        {/* betting line */}
        {withProps(lineShape, { fill: 'none', stroke: '#fff', strokeOpacity: 0.13, strokeWidth: 0.9 })}
        {/* faint brand watermark */}
        <g transform={`translate(${mark.x - (WORD_W * mark.k) / 2} ${mark.y}) scale(${mark.k})`} opacity={0.14}>
          <WordmarkShape pokerColor="#fff" thenColor="#fff" stroke={2.2} />
        </g>
      </g>
    </>
  );
}

const LW = 555.5, LH = 262.5; // landscape viewBox (rem x 10)
const PW = 174, PH = 280; // portrait viewBox

function ellipse(cx: number, cy: number, rx: number, ry: number) {
  return (inset: number, y = 0) => <ellipse cx={cx} cy={cy + y + inset * 0.02} rx={rx - inset} ry={ry - inset * 0.62} />;
}
function stadium(x: number, y: number, w: number, h: number, r: number) {
  return (inset: number, dy = 0) => <rect x={x + inset} y={y + inset + dy} width={w - 2 * inset} height={h - 2 * inset} rx={Math.max(2, r - inset)} />;
}

export function FeltArt({ orientation, blur, tone = 'green' }: { orientation: 'landscape' | 'portrait'; blur?: boolean; tone?: FeltTone }) {
  const land = orientation === 'landscape';
  const id = (land ? 'ptfl' : 'ptfp') + tone[0];
  const W = land ? LW : PW, H = land ? LH : PH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block' }} aria-hidden="true" focusable="false" role="presentation">
      <Defs id={id} tone={tone} w={W} h={H} />
      {land ? (
        <Table id={id} w={W} h={H} dy={10} bevelInset={11.5} feltInset={14.2}
          shape={ellipse(277.75, 129, 182.5, 94)}
          lineShape={<ellipse cx={277.75} cy={124} rx={118} ry={55} />}
          mark={{ x: 277.75, y: 178, k: 0.8 }} />
      ) : (
        <Table id={id} w={W} h={H} dy={6} bevelInset={10.5} feltInset={13}
          shape={stadium(14, 23, 146, 234, 62)}
          lineShape={<rect x={46} y={68} width={82} height={142} rx={34} />}
          mark={{ x: 87, y: 214, k: 0.62 }} />
      )}
      {blur ? <rect width={W} height={H} fill="#1b1a1b" opacity=".12" /> : null}
    </svg>
  );
}

export function feltBlurStyle(): CSSProperties {
  return { filter: 'blur(.35rem) saturate(.85) brightness(.82)' };
}
