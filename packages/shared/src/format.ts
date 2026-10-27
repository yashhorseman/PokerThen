/** Number formatting used by plates, pot, action labels. Mode comes from prefs.displayValueStyle and config.centsMode. */
import type { DisplayValueStyle } from "./prefs.js";

export function formatValue(v: number, opts: { cents?: boolean; style?: DisplayValueStyle; bigBlind?: number }): string {
  const style = opts.style ?? "none";
  if (style === "big-blind" && opts.bigBlind) {
    const bb = v / opts.bigBlind;
    return `${Number.isInteger(bb) ? bb : Math.round(bb * 100) / 100}BB`;
  }
  if (opts.cents) return (v / 100).toFixed(2);
  if (style === "formatted") return v.toLocaleString("en-US");
  return String(v);
}

/** log timestamps are epoch ms * 100 (05 s2.2); UI shows HH:MM 24h en-US */
export function logTime(createdAt: number): string {
  return new Date(createdAt / 100).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

/** Strip `"Name @ id"` to name for display; returns [name,id] pairs via replacer. */
export const LOG_NAME_RE = /"([^"]*?) @ ([A-Za-z0-9_-]{10})"/g;

/** Chat bubble lifetime over a player's plate: fixed 7.2 s, measured live for 2-word and ~10-word messages on desktop and phone (research/07 s6; U-C1). */
export const TABLE_BUBBLE_MS = 7200;
/** Phone auto-message balloon lifetime (SPEC 17.2, unmeasured; formula read from the reference client): 2300 + 300 * wordCount ms. */
export function chatBubbleMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return 2300 + 300 * words;
}
export const autoMessageBalloonMs = chatBubbleMs;
/** Bubble text truncated to 30 chars + ellipsis (SPEC 4.5). */
export function truncateBubble(text: string): string {
  return text.length > 30 ? text.slice(0, 30) + "…" : text;
}
