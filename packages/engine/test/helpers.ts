import { randomBytes, webcrypto } from 'node:crypto';
import { apply, Card, Command, Config, DEFAULT_CONFIG, EngineEvent, newDeck, newTable, nextDue, TableState, legalActions } from '../src';

export function shuffled(rand: () => number = Math.random): Card[] {
  const d = newDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
export const salts = () => Array.from({ length: 52 }, () => randomBytes(8).toString('hex'));
void webcrypto;

/** Mulberry32 for reproducible randomised tests */
export function seeded(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a deck so that, for the given dealing order (seats left of the dealer first),
 * seat k gets holes[k], and the board is flop/turn/river. Remaining cards fill the rest.
 */
export function rigDeck(holes: Array<[Card, Card]>, board: Card[]): Card[] {
  const n = holes.length;
  const used = new Set<Card>([...holes.flat(), ...board]);
  const rest = newDeck().filter((c) => !used.has(c));
  const deck: Card[] = new Array(52);
  holes.forEach((h, k) => { deck[k] = h[0]; deck[n + k] = h[1]; });
  let p = 2 * n;
  const take = () => rest.shift() as Card;
  deck[p++] = take(); // burn
  deck[p++] = board[0]; deck[p++] = board[1]; deck[p++] = board[2];
  deck[p++] = take();
  deck[p++] = board[3];
  deck[p++] = take();
  deck[p++] = board[4];
  while (p < 52) deck[p++] = take();
  return deck;
}

export class Sim {
  t: TableState;
  now = 1_000_000;
  events: EngineEvent[] = [];
  constructor(config: Partial<Config> = {}, public rand = Math.random) {
    this.t = newTable({ ...DEFAULT_CONFIG, ...config });
  }
  cmd(c: Command) {
    const r = apply(this.t, c, this.now);
    this.t = r.state;
    this.events.push(...r.events);
    return r;
  }
  seat(seat: number, stack: number, memberId = `m${seat}`) {
    this.cmd({ type: 'SEAT', seat, memberId, stack, sitOut: false });
  }
  startGame(pick = 0) { this.cmd({ type: 'START_GAME', pick }); }
  /** run engine clock until a hand is on (dealing with `deck` if given) */
  startHand(deck?: Card[]) {
    this.cmd({ type: 'START_HAND', handId: 'h' + (this.t.handNo + 1), deck: deck ?? shuffled(this.rand), salts: salts() });
  }
  get h() { return this.t.hand!; }
  act(seat: number, action: 'fold' | 'check' | 'call' | 'raise' | 'allin', raiseTo?: number) {
    return this.cmd({ type: 'ACTION', seat, turnId: this.h.turnId, action, raiseTo });
  }
  legal(seat: number) { return legalActions(this.t, seat); }
  stacks() { return this.t.seats.map((s) => (s ? s.stack : 0)); }
  /** advance timers until the engine is idle (hand complete) or `limit` steps pass; auto-plays dues */
  drain(limit = 200) {
    for (let i = 0; i < limit; i++) {
      const due = nextDue(this.t);
      if (!due || due.kind === 'START_HAND') return;
      if (due.at > this.now) this.now = due.at;
      if (due.kind === 'TIMEOUT') this.cmd({ type: 'TIMEOUT', turnId: this.h.turnId });
      else if (due.kind === 'STEP') this.cmd({ type: 'STEP' });
      else if (due.kind === 'VOTE_TIMEOUT') this.cmd({ type: 'VOTE_TIMEOUT' });
    }
  }
}
