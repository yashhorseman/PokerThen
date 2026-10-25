/**
 * Original PokerThen card back: ivory border, deep midnight-blue field with a gold diamond lattice, framed panel with
 * corner studs and a central chip-medallion carrying a spade.  180-degree symmetric (no "upside down" tell).
 * Drawn on a 100 x 121 grid (card aspect 3.05 : 3.7); used as a CSS background so hundreds of copies stay cheap.
 */
import { SUIT_PATHS } from './marks';

const GOLD = '#d9b665';
const NAVY0 = '#173560';
const NAVY1 = '#0a1730';

export const CARD_BACK_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 121' preserveAspectRatio='none'>` +
  `<defs>` +
  `<linearGradient id='f' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${NAVY0}'/><stop offset='1' stop-color='${NAVY1}'/></linearGradient>` +
  `<radialGradient id='m' cx='.5' cy='.45' r='.6'><stop offset='0' stop-color='#1d3f72'/><stop offset='1' stop-color='#0b1a36'/></radialGradient>` +
  `<pattern id='l' width='9' height='9' patternUnits='userSpaceOnUse' patternTransform='rotate(45 50 60.5)'>` +
  `<path d='M0 0H9M0 0V9' stroke='${GOLD}' stroke-opacity='.26' stroke-width='.7' fill='none'/>` +
  `<circle cx='0' cy='0' r='.9' fill='${GOLD}' fill-opacity='.55'/></pattern>` +
  `<clipPath id='p'><rect x='8' y='8' width='84' height='105' rx='3'/></clipPath>` +
  `</defs>` +
  `<rect width='100' height='121' fill='#f3efe6'/>` +
  `<rect x='3.5' y='3.5' width='93' height='114' rx='4' fill='url(#f)'/>` +
  `<rect x='3.5' y='3.5' width='93' height='114' rx='4' fill='none' stroke='${GOLD}' stroke-opacity='.5' stroke-width='.6'/>` +
  `<g clip-path='url(#p)'><rect x='8' y='8' width='84' height='105' fill='#0c1b38'/><rect x='8' y='8' width='84' height='105' fill='url(#l)'/></g>` +
  `<rect x='8' y='8' width='84' height='105' rx='3' fill='none' stroke='${GOLD}' stroke-width='1.2'/>` +
  `<rect x='11' y='11' width='78' height='99' rx='1.5' fill='none' stroke='${GOLD}' stroke-opacity='.55' stroke-width='.5'/>` +
  // corner studs (diamonds), 4-fold
  [[16, 16], [84, 16], [16, 105], [84, 105]].map(([x, y]) => `<path d='M${x} ${y - 3.6}L${x + 3.6} ${y} ${x} ${y + 3.6} ${x - 3.6} ${y}Z' fill='${GOLD}'/>`).join('') +
  // medallion
  `<circle cx='50' cy='60.5' r='21' fill='#0a1730' stroke='${GOLD}' stroke-width='1.4'/>` +
  `<circle cx='50' cy='60.5' r='17.2' fill='url(#m)' stroke='${GOLD}' stroke-opacity='.85' stroke-width='.7'/>` +
  `<circle cx='50' cy='60.5' r='19.1' fill='none' stroke='${GOLD}' stroke-width='2.6' stroke-dasharray='4.2 4.6' stroke-opacity='.9'/>` +
  `<g transform='translate(36.6 47.2) scale(1.12)' fill='${GOLD}'><path d='${SUIT_PATHS.s}'/></g>` +
  `</svg>`;

/** `url("data:...")` ready for `background-image` */
export const cardBackUrl = `url("data:image/svg+xml,${encodeURIComponent(CARD_BACK_SVG).replace(/'/g, '%27')}")`;

/** CSS declarations for a card back (a plain background); `.card-back-art` carries exactly this. */
export const cardBackCss = `background-color:#0c1b38;background-image:${cardBackUrl};background-size:100% 100%;background-repeat:no-repeat;background-position:center;`;
