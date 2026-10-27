// Protocol-level bots (INTEGRATION): raw WS clients that keep a Frame via snapshot+delta and can act. Used by leak/RIT/rabbit scenarios.
import { WebSocket } from "ws";
import { sleep, waitFor } from "./index.mjs";

export function applyDelta(base, delta) {
  if (delta === "<D>") return undefined;
  if (Array.isArray(delta) || delta === null || typeof delta !== "object") return delta;
  const out = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(delta)) {
    if (v === "<D>") delete out[k]; else out[k] = applyDelta(out[k], v);
  }
  return out;
}

export class Bot {
  constructor(player) { this.p = player; this.name = player.name; this.raw = []; this.frame = null; this.chat = []; this.notices = []; this.ws = null; }
  get id() { return this.p.playerID; }
  async connect(gameID = this.p.gameID, layout = "d") {
    const ck = await this.p.cookie();
    const base = this.p.h.url.replace("http", "ws");
    this.ws = new WebSocket(`${base}/ws?gameID=${gameID}&layout=${layout}`, { headers: { origin: this.p.h.url, cookie: `ptn=${ck}` } });
    this.ws.on("message", (d) => this.onMsg(String(d)));
    await new Promise((res, rej) => { this.ws.once("open", res); this.ws.once("error", rej); });
    await waitFor(() => this.frame, { what: this.name + " registered" });
    return this;
  }
  onMsg(s) {
    this.raw.push(s);
    const m = JSON.parse(s);
    if (m.t === "registered" || m.t === "rup") this.frame = m.frame;
    else if (m.t === "gC") this.frame = applyDelta(this.frame, m.delta);
    else if (m.t === "chat") this.chat.push(m.message);
    else if (m.t === "notice") this.notices.push(m);
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  action(type, extra = {}) { this.send({ t: "action", action: { type, ...extra } }); }
  close() { try { this.ws.close(); } catch {} }
  get myTurn() { const f = this.frame; return !!f && f.turn.taking === this.id && f.hand != null; }
  get myCards() { return (this.frame?.cards?.[this.id]?.cards ?? []); }
  get stack() { return this.frame?.players?.[this.id]?.stack; }
  /** bet this street */
  get myBet() { const b = this.frame?.hand?.bets?.[this.id]; return typeof b === "number" ? b : 0; }
}
export async function waitTurn(bots, timeout = 15000) { return waitFor(() => bots.find((b) => b.myTurn), { timeout, what: "a turn" }); }
export const nextStepIs = (bot, v) => bot.frame?.turn?.nextStep === v;

const RANKS = "23456789TJQKA", SUITS = "cdhs";
export const CANON = [...SUITS].flatMap((s) => [...RANKS].map((r) => r + s));
/** deck with the given prefix indices fixed (array of codes in order), remainder = unused canonical cards in canonical order */
export function mkDeck(prefix) {
  const used = new Set(prefix); if (used.size !== prefix.length) throw new Error("duplicate card in deck prefix");
  return [...prefix, ...CANON.filter((c) => !used.has(c))];
}
export const CARD_RE = /"([2-9TJQKA][cdhs])"/g;
export function cardsIn(strings) { const s = new Set(); for (const str of strings) for (const m of str.matchAll(CARD_RE)) s.add(m[1]); return s; }
