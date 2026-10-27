import { PALETTE as P } from "../palette";

/** Room background tile (SPEC 3): near-black textured, 160x160 repeating. */
export function roomTileSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">` +
    `<rect width="160" height="160" fill="${P.room}"/>` +
    `<g fill="none" stroke="${P.roomTile}" stroke-width="1.4">` +
    `<path d="M80 12L148 80 80 148 12 80z"/><path d="M80 40L120 80 80 120 40 80z" opacity=".7"/>` +
    `<path d="M0 0l12 12M160 0l-12 12M0 160l12-12M160 160l-12-12"/></g>` +
    `<g fill="${P.roomTile}"><circle cx="80" cy="80" r="2.4"/><circle cx="0" cy="0" r="2.4"/><circle cx="160" cy="0" r="2.4"/><circle cx="0" cy="160" r="2.4"/><circle cx="160" cy="160" r="2.4"/></g>` +
    `</svg>`
  );
}

/** Dealer / straddle puck, viewBox 0 0 19 16 (1.9 x 1.6 rem). */
export function discSvg(kind: "dealer" | "straddle"): string {
  const letter =
    kind === "dealer"
      ? `<path fill-rule="evenodd" d="M6.4 3.7h3c3 0 4.9 1.7 4.9 4.1s-1.9 4.1-4.9 4.1h-3zM8.4 5.4v4.8h1c1.6 0 2.6-.9 2.6-2.4S11 5.4 9.4 5.4z" fill="#2b4fd8"/>`
      : `<path d="M13 5.4C12.5 4.4 11.4 3.9 9.9 3.9 8.2 3.9 7 4.7 7 5.9c0 3.1 5.8 1.5 5.8 4.4 0 1.3-1.2 2.1-3 2.1-1.6 0-2.8-.6-3.5-1.8" fill="none" stroke="#d4272f" stroke-width="1.9" stroke-linecap="round" transform="translate(0 -.6)"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 19 16">` +
    `<ellipse cx="9.5" cy="9.6" rx="8.6" ry="5.9" fill="#000" opacity=".28"/>` +
    `<ellipse cx="9.5" cy="8.6" rx="8.5" ry="7" fill="#b9bdd0"/>` +
    `<ellipse cx="9.5" cy="7.6" rx="8.5" ry="7" fill="#fff"/>` +
    `<ellipse cx="9.5" cy="7.6" rx="7.2" ry="5.8" fill="none" stroke="#d3d6e3" stroke-width=".6"/>` +
    letter + `</svg>`
  );
}

/** Dashed empty-seat slot outline, viewBox 0 0 100 40. */
export function seatSlotSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="38" rx="6" fill="rgba(0,0,0,.18)" stroke="${P.cream}" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="5 4"/></svg>`;
}

/** Stylised table used (blurred by CSS) behind the New Game card. 1440x810 desktop, 390x702 phone. Own artwork, not a screenshot. */
export function placeholderSvg(kind: "desktop" | "phone"): string {
  const W = kind === "desktop" ? 1440 : 390;
  const H = kind === "desktop" ? 810 : 702;
  const seats: [number, number][] =
    kind === "desktop"
      ? [[200, 120], [470, 80], [970, 80], [1240, 120], [90, 380], [1350, 380], [210, 640], [480, 700], [960, 700], [1230, 640]]
      : [[195, 60], [70, 190], [320, 190], [60, 400], [330, 400], [90, 600], [300, 600]];
  const cards = seats
    .map(([x, y]) => `<g transform="translate(${x} ${y}) rotate(-6)"><rect x="-26" y="-32" width="52" height="64" rx="5" fill="${P.plum}" stroke="${P.amber}" stroke-width="2"/><rect x="-4" y="-30" width="52" height="64" rx="5" fill="${P.plumLight}" stroke="${P.amber}" stroke-width="2" transform="rotate(12)"/></g><rect x="${x + 40}" y="${y - 24}" width="110" height="48" rx="8" fill="#000" opacity=".5"/>`)
    .join("");
  const tw = kind === "desktop" ? 1180 : 330;
  const th = kind === "desktop" ? 560 : 560;
  const tx = (W - tw) / 2, ty = (H - th) / 2 - 10;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><radialGradient id="f" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="${P.feltCenter}"/><stop offset=".7" stop-color="${P.feltEdge}"/><stop offset="1" stop-color="${P.feltBottom}"/></radialGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="${P.room}"/>` +
    `<rect x="${tx - 36}" y="${ty - 36}" width="${tw + 72}" height="${th + 72}" rx="${th / 2 + 36}" fill="${P.rail}"/>` +
    `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="${th / 2}" fill="url(#f)"/>` +
    cards +
    `<rect x="${W / 2 - 150}" y="${H / 2 - 20}" width="300" height="70" rx="6" fill="#fff" opacity=".9"/>` +
    `</svg>`
  );
}
