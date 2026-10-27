import { PALETTE as P } from "../palette";

type Kind = "desktop" | "phone";

/**
 * Table = rail + felt in ONE image (SPEC 4.1/18.2). desktop viewBox 2116x1000 (55.55x26.25rem), phone 620x1000 (17.4x28rem).
 * `red` = spectator/god-mode tint (SPEC 4.3).
 */
export function feltSvg(kind: Kind, red = false): string {
  const W = kind === "desktop" ? 2116 : 620;
  const H = 1000;
  const c = red ? [P.feltRedCenter, P.feltRedMid, P.feltRedEdge, P.feltRedBottom] : [P.feltCenter, P.feltMid, P.feltEdge, P.feltBottom];
  const rx = kind === "desktop" ? 470 : 300;
  const railIn = kind === "desktop" ? 64 : 46; // rail thickness
  const x0 = 8, y0 = 8, w = W - 16, h = H - 16;
  const fx = x0 + railIn, fy = y0 + railIn, fw = w - 2 * railIn, fh = h - 2 * railIn, frx = rx - railIn;
  const sx = fx + 34, sy = fy + 34, sw = fw - 68, sh = fh - 68, srx = frx - 34;
  const cy = kind === "desktop" ? "46%" : "40%";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
    `<defs>` +
    `<linearGradient id="rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.railHi}"/><stop offset=".5" stop-color="${P.rail}"/><stop offset="1" stop-color="${P.railLo}"/></linearGradient>` +
    `<radialGradient id="felt" cx="50%" cy="${cy}" r="68%"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset=".88" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></radialGradient>` +
    `<pattern id="weave" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 7H14M7 0V14" stroke="#000" stroke-width="1" opacity=".07"/></pattern>` +
    `</defs>` +
    `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${rx}" fill="url(#rail)"/>` +
    `<rect x="${x0 + 3}" y="${y0 + 3}" width="${w - 6}" height="${h - 6}" rx="${rx - 3}" fill="none" stroke="${P.cream}" stroke-opacity=".12" stroke-width="2"/>` +
    `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="${frx}" fill="url(#felt)"/>` +
    `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="${frx}" fill="url(#weave)"/>` +
    `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="${frx}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="6"/>` +
    `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${srx}" fill="none" stroke="${P.feltLine}" stroke-opacity=".5" stroke-width="3" stroke-dasharray="${kind === "desktop" ? "26 14" : "20 12"}"/>` +
    `</svg>`
  );
}
