import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ICONS, ICON_NAMES } from "../../src/art/icons";
import { PALETTE } from "../../src/art/palette";
import { SUIT_PATHS } from "../../src/art/svg/suits";
import { cardBackSvg } from "../../src/art/svg/cardBack";
import { feltSvg } from "../../src/art/svg/felt";
import { logoFull } from "../../src/art/svg/logo";

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, "../../public/art");
const repo = resolve(here, "../../../..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

describe("art assets", () => {
  it("asset budget: public/art + art sources + audio < 400 KB", () => {
    const files = [...walk(pub), ...walk(resolve(here, "../../src/art")), ...walk(resolve(here, "../../src/audio"))];
    const total = files.reduce((n, f) => n + statSync(f).size, 0);
    console.log(`ASSET BUDGET: ${(total / 1024).toFixed(1)} KB of 400 KB (public/art ${(walk(pub).reduce((n, f) => n + statSync(f).size, 0) / 1024).toFixed(1)} KB)`);
    expect(total).toBeLessThan(400 * 1024);
  });

  it("required files exist with the required sizes", () => {
    for (const f of ["favicon.png", "apple-touch-icon.png", "og-image.png", "card-back.svg", "felt-desktop.svg", "felt-phone.svg", "felt-desktop-red.svg", "felt-phone-red.svg", "room.svg", "dealer.svg", "straddle.svg", "logo.svg"]) expect(existsSync(join(pub, f)), f).toBe(true);
    const dim = (f: string) => { const b = readFileSync(join(pub, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    expect(dim("favicon.png")).toEqual([60, 60]);
    expect(dim("apple-touch-icon.png")).toEqual([180, 180]);
    expect(dim("og-image.png")).toEqual([1200, 630]);
  });

  it("every icon has paths; all names catalogued", () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(30);
    for (const n of ICON_NAMES) { expect(ICONS[n].length, n).toBeGreaterThan(0); for (const p of ICONS[n]) expect(p.d).toMatch(/^M/); }
    for (const n of ["options", "leave-seat", "away", "im-back", "sound-off", "sound-low", "sound-med", "sound-high", "eye", "pause", "play", "stop", "fullscreen", "clock", "trophy", "fold", "exit", "chat", "send", "copy", "record", "house", "close"]) expect(ICON_NAMES).toContain(n);
  });

  it("four suits, svgs are well formed", () => {
    expect(Object.keys(SUIT_PATHS).sort()).toEqual(["c", "d", "h", "s"]);
    for (const s of [cardBackSvg(), feltSvg("desktop"), feltSvg("phone", true), logoFull("light")]) {
      expect(s.startsWith("<svg")).toBe(true);
      expect(s.endsWith("</svg>")).toBe(true);
      expect((s.match(/<svg/g) ?? []).length).toBe(1);
    }
  });

  it("felt / card back colours differ from the reference values (SPEC 3, 4.8)", () => {
    const reference = ["#37a265", "#298651", "#22653f", "#212121", "#1e1e1e", "#ce7474"];
    const mine = Object.values(PALETTE).map((v) => v.toLowerCase());
    for (const r of reference) expect(mine).not.toContain(r);
  });

  it("no reference assets: no file in public/art matches (sha256) anything under research/evidence", () => {
    const ev = join(repo, "research/evidence");
    if (!existsSync(ev)) return;
    const hashes = new Set(walk(ev).map((f) => createHash("sha256").update(readFileSync(f)).digest("hex")));
    const mine = walk(pub);
    for (const f of mine) expect(hashes.has(createHash("sha256").update(readFileSync(f)).digest("hex")), f).toBe(false);
    console.log(`NO-REFERENCE-ASSETS: ${mine.length} files checked against ${hashes.size} evidence hashes, 0 matches`);
  });
});
