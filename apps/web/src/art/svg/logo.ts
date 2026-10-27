import { PALETTE as P } from "../palette";

/** Logo mark: a chip ring with a "P" cut from a spade-tipped stem. Original. Drawn in a 32x32 box. */
export function logoMarkInner(): string {
  return [
    `<circle cx="16" cy="16" r="14.2" fill="${P.ink}"/>`,
    `<circle cx="16" cy="16" r="14.2" fill="none" stroke="${P.amber}" stroke-width="3" stroke-dasharray="5.6 2.2" stroke-linecap="butt"/>`,
    `<circle cx="16" cy="16" r="10.4" fill="none" stroke="${P.amber}" stroke-width="1" opacity=".55"/>`,
    // P: stem + bowl, stem ends in a small diamond foot
    `<path d="M11.6 8.2h5.2c3 0 4.9 1.7 4.9 4.3s-1.9 4.3-4.9 4.3h-2.4v4.4l-1.4 1.5-1.4-1.5z" fill="${P.cream}"/>`,
    `<path d="M14.4 10.6v3.8h2.2c1.2 0 1.9-.7 1.9-1.9s-.7-1.9-1.9-1.9z" fill="${P.ink}"/>`
  ].join("");
}

/** Full horizontal logo, viewBox 0 0 120 28 (the table-top tag size). tone: text colour for dark (default) or light backgrounds. */
export function logoFull(tone: "dark" | "light" = "dark"): string {
  const t = tone === "dark" ? P.cream : P.ink;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 28" width="120" height="28" role="img" aria-label="PokerThen">` +
    `<g transform="translate(0 0) scale(.875)">${logoMarkInner()}</g>` +
    `<text x="31" y="19.4" font-family="Mulish, 'Helvetica Neue', Arial, sans-serif" font-size="14.5" font-weight="900" fill="${t}" textLength="49" lengthAdjust="spacingAndGlyphs">POKER</text>` +
    `<text x="81.5" y="19.4" font-family="Mulish, 'Helvetica Neue', Arial, sans-serif" font-size="14.5" font-weight="300" fill="${P.amber}" textLength="37.5" lengthAdjust="spacingAndGlyphs">THEN</text>` +
    `</svg>`
  );
}

export function logoMarkSvg(size = 32): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" role="img" aria-label="PokerThen">${logoMarkInner()}</svg>`;
}

/** Favicon / touch icon master (rounded square with the mark), 64x64 box. */
export function iconMaster(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.plumLight}"/><stop offset="1" stop-color="${P.plumDeep}"/></linearGradient></defs>` +
    `<rect width="64" height="64" rx="14" fill="url(#g)"/>` +
    `<g transform="translate(6 6) scale(1.625)">${logoMarkInner()}</g></svg>`
  );
}
