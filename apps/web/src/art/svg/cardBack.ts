import { PALETTE as P } from "../palette";

/** Card back, viewBox 0 0 90 110 (ratio .818). Plum field, gold lattice, medallion. Original. */
export function cardBackSvg(): string {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const x1 = 45 + Math.cos(a) * 14, y1 = 55 + Math.sin(a) * 14, x2 = 45 + Math.cos(a) * 18, y2 = 55 + Math.sin(a) * 18;
    return `<path d="M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}"/>`;
  }).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 110" preserveAspectRatio="xMidYMid slice">` +
    `<defs>` +
    `<linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.plumLight}"/><stop offset=".55" stop-color="${P.plum}"/><stop offset="1" stop-color="${P.plumDeep}"/></linearGradient>` +
    `<pattern id="l" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H10M0 0V10" stroke="${P.amber}" stroke-width=".7" opacity=".34" fill="none"/><circle cx="5" cy="5" r=".9" fill="${P.amber}" opacity=".5"/></pattern>` +
    `</defs>` +
    `<rect width="90" height="110" fill="url(#f)"/>` +
    `<rect x="7" y="7" width="76" height="96" rx="4" fill="url(#l)"/>` +
    `<rect x="7" y="7" width="76" height="96" rx="4" fill="none" stroke="${P.amber}" stroke-width="1.4"/>` +
    `<rect x="4" y="4" width="82" height="102" rx="6" fill="none" stroke="${P.cream}" stroke-width=".8" opacity=".55"/>` +
    `<circle cx="45" cy="55" r="22" fill="${P.plumDeep}" stroke="${P.amber}" stroke-width="1.4"/>` +
    `<g stroke="${P.amber}" stroke-width="1.2" stroke-linecap="round">${ticks}</g>` +
    `<path d="M45 40Q47.5 52.5 59 55 47.5 57.5 45 70 42.5 57.5 31 55 42.5 52.5 45 40z" fill="${P.amber}"/>` +
    `<circle cx="45" cy="55" r="2.2" fill="${P.plumDeep}"/>` +
    `</svg>`
  );
}
