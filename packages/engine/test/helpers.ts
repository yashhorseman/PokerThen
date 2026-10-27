import { engine } from "../src/index.js";
import { type CardCode, type EngineApi, type EngineCommand, type EngineEffect, type Entropy, type Frame, type TableState, type ActionMsg } from "@pokerthen/shared";
import { seededEntropy, stackedDeck } from "@pokerthen/shared/testing";
import { asS } from "../src/state.js";

/** words that make Fisher-Yates (i=51..1, j = u % (i+1)) produce exactly `target` from the canonical deck */
export function deckWords(target: readonly CardCode[]): number[] {
  const a = stackedDeck([]) as CardCode[];
  const words: number[] = [];
  for (let i = 51; i >= 1; i--) {
    const j = a.indexOf(target[i]!);
    words.push(j);
    const t = a[i]!; a[i] = a[j]!; a[j] = t;
  }
  return words;
}

export class QEntropy {
  q: number[] = [];
  fallback: Entropy;
  constructor(seed = 1) { this.fallback = seededEntropy(seed); }
  push(...w: number[]) { this.q.push(...w); }
  fn: Entropy = (n) => {
    if (this.q.length && n % 4 === 0 && n <= this.q.length * 4) {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i += 4) { const w = this.q.shift()!; out[i] = w >>> 24; out[i + 1] = (w >>> 16) & 255; out[i + 2] = (w >>> 8) & 255; out[i + 3] = w & 255; }
      return out;
    }
    return this.fallback(n);
  };
}

export const id = (n: string) => n.padEnd(10, "_").slice(0, 10);

export class Game {
  s!: TableState; now = 1_800_000_000_000; ent = new QEntropy(); fx: EngineEffect[] = [];
  e: EngineApi = engine;
  constructor(public owner = id("yash"), stack = 1000, sb = 10, bb = 20) {
    const r = this.e.createTable({ gameId: "game0000000000000000abcd", ownerId: owner, ownerName: "yash", stack, sb, bb }, this.ctx());
    this.s = r.state;
  }
  ctx() { return { now: this.now, entropy: this.ent.fn }; }
  cmd(actor: string, c: EngineCommand) {
    const r = this.e.command(this.s, actor, c, this.ctx());
    if (r.ok) { this.s = r.state; this.fx.push(...r.effects); }
    return r;
  }
  ok(actor: string, c: EngineCommand) {
    const r = this.cmd(actor, c);
    if (!r.ok) throw new Error(`command failed ${JSON.stringify(c)} -> ${JSON.stringify(r)}`);
    return r;
  }
  act(actor: string, a: ActionMsg) { return this.cmd(actor, { kind: "action", action: a }); }
  okAct(actor: string, a: ActionMsg) { return this.ok(actor, { kind: "action", action: a }); }
  advance(ms: number) {
    this.now += ms;
    const r = this.e.tick(this.s, this.ctx());
    if (!r.ok) throw new Error("tick failed");
    this.s = r.state; this.fx.push(...r.effects);
  }
  /** advance to the next wake time and tick; returns false when idle */
  step(): boolean {
    const w = this.e.nextWakeAt(this.s);
    if (w === null) return false;
    this.now = Math.max(this.now, w);
    const r = this.e.tick(this.s, this.ctx());
    if (!r.ok) throw new Error("tick failed");
    this.s = r.state; this.fx.push(...r.effects);
    return true;
  }
  /** step until predicate true (bounded) */
  until(pred: () => boolean, max = 400) { for (let i = 0; i < max; i++) { if (pred()) return; if (!this.step()) break; } if (!pred()) throw new Error("until: condition not reached"); }
  /** finish the running hand (stop at award result window) */
  toResult() { this.until(() => this.st.hand!.phase === "result"); }
  /** join players: names -> {id, seat, stack}; owner already seated at seat 1 */
  seat(name: string, seat: number, stack = 1000) {
    const pid = id(name);
    this.ok(pid, { kind: "presence", connected: true });
    this.ok(pid, { kind: "requestIngress", body: { seat, playerName: name, allowSpectator: false, stack } });
    this.ok(this.owner, { kind: "approvePlayer", playerID: pid });
    return pid;
  }
  frame(viewer: string | null): Frame { return this.e.frame(this.s, viewer, this.now); }
  get st() { return asS(this.s); }
  logs(onlyFor?: string): string[] {
    return this.fx.filter((f): f is Extract<EngineEffect, { kind: "log" }> => f.kind === "log" && (f.onlyFor === undefined || f.onlyFor === onlyFor)).map((f) => f.msg);
  }
  clearFx() { this.fx = []; }
  /** deal setup: push dealer index (participant order) + deck words */
  stack(deck: readonly CardCode[], dealerIdx?: number) { if (dealerIdx !== undefined) this.ent.push(dealerIdx); this.ent.push(...deckWords(stackedDeck(deck))); }
}
export const strip = (m: string) => m.replace(/"([^"]*?) @ [^"]{10}"/g, "$1");

/** Build a full deck top for a hand: holes dealt round-robin in `order`, then burn+flop, burn+turn, burn+river, then `extra`. */
export function mkDeck(order: string[], holes: Record<string, [CardCode, CardCode]>, board: CardCode[], extra: CardCode[] = []): CardCode[] {
  const used = new Set<CardCode>([...Object.values(holes).flat(), ...board, ...extra]);
  const free = stackedDeck([]).filter((c) => !used.has(c));
  const burn = () => free.shift()!;
  const top: CardCode[] = [];
  for (const k of [0, 1]) for (const p of order) top.push(holes[p]![k]!);
  top.push(burn(), board[0]!, board[1]!, board[2]!, burn(), board[3]!, burn(), board[4]!);
  top.push(...extra);
  return top;
}
export const lines = (g: Game, from = "-- starting"): string[] => { const l = g.logs(); const i = l.map((x) => x.startsWith(from)).lastIndexOf(true); return l.slice(i); };
export function playOut(g: Game, steps: Array<[string, string, number?]>) {
  for (const [who, a, v] of steps) { g.okAct(who, (v === undefined ? { type: a } : { type: a, value: v }) as never); g.step(); }
}
