/** Pure bet-panel helpers (SPEC 6.3). No React, no DOM: unit-tested in test/actions. */

export type InputMode = "int" | "cents" | "bb";

export function inputModeFor(opts: { centsMode: boolean; showAsBB: boolean }): InputMode {
  if (opts.showAsBB) return "bb";
  return opts.centsMode ? "cents" : "int";
}

/** Keep only characters the field accepts: digits (int) or digits + one dot, 2 decimals (cents / bb). */
export function sanitizeInput(raw: string, mode: InputMode): string {
  if (mode === "int") return raw.replace(/[^0-9]/g, "").slice(0, 12);
  let out = "";
  let dot = false;
  for (const ch of raw.replace(/,/g, ".")) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !dot) {
      dot = true;
      out += ".";
    }
  }
  const i = out.indexOf(".");
  if (i >= 0) out = out.slice(0, i + 3);
  return out.slice(0, 14);
}

/** Text -> chips (integer smallest unit). null when empty/not a number. */
export function textToValue(text: string, mode: InputMode, bigBlind: number): number | null {
  const t = text.trim();
  if (t === "" || t === ".") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (mode === "int") return Math.floor(n);
  if (mode === "cents") return Math.round(n * 100);
  return Math.floor(n * bigBlind + 1e-9); // bb: floor(bb * bigBlind)
}

/** Chips -> text shown in the input. */
export function valueToText(v: number, mode: InputMode, bigBlind: number): string {
  if (mode === "int") return String(Math.max(0, Math.floor(v)));
  if (mode === "cents") return (v / 100).toFixed(2);
  return bigBlind > 0 ? trimBB(v / bigBlind) : "0";
}

function trimBB(x: number): string {
  const r = Math.round(x * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** Yellow tag top-right of the input: bet in BB (normal modes) or in chips (BB mode). */
export function convertedTag(v: number, mode: InputMode, bigBlind: number, centsMode: boolean): string {
  if (mode === "bb") return centsMode ? (v / 100).toFixed(2) : String(v);
  if (!bigBlind) return "";
  return `${trimBB(v / bigBlind)}BB`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** `-` / `+` buttons step by ONE big blind (SPEC 6.3), clamped to [0, max]. */
export function stepBet(v: number, dir: 1 | -1, bigBlind: number, max: number): number {
  return clamp(v + dir * Math.max(1, bigBlind), 0, max);
}

export const PRESET_KEYS = ["minRaise", "half", "threeQuarter", "pot", "allIn"] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];
/** Verbatim labels (rendered uppercase by CSS). U-B1: opening bet keeps `Min Raise`. */
export const PRESET_LABELS: Record<PresetKey, string> = {
  minRaise: "Min Raise",
  half: "1/2 Pot",
  threeQuarter: "3/4 Pot",
  pot: "Pot",
  allIn: "All In"
};

export function presetValue(p: Record<PresetKey, number>, key: PresetKey, max: number): number {
  return clamp(Math.floor(p[key]), 0, max);
}
