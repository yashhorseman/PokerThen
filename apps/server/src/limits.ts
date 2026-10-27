/** U-N1: thresholds are unknown (SPEC 22). Placeholders live here only so they can be swapped in one place. */
export const LIMITS = {
  /** open sockets per client IP (U-N1) */
  MAX_SOCKETS_PER_IP: 20,
  /** WS upgrades per IP per window (each connect/disconnect is an fsync'd state write) */
  WS_UPGRADES_PER_WINDOW: 60,
  WS_UPGRADE_WINDOW_MS: 10_000,
  /** per-player chat messages per window (each is persisted) */
  CHAT_PER_WINDOW: 6,
  CHAT_WINDOW_MS: 5000,
  /** hard cap of persisted chat lines per table (chat.jsonl is append-only) */
  CHAT_PERSIST_MAX: 20_000,
  /** global table cap (no retention policy yet, U-N2) */
  MAX_TABLES: 3000,
  /** WS messages per window per socket (U-N1) */
  WS_MSG_BURST: 40,
  WS_MSG_WINDOW_MS: 2000,
  /** HTTP requests per IP per window (U-N1) */
  HTTP_BURST: 120,
  HTTP_WINDOW_MS: 10_000,
  /** POST /new-game per IP per minute (U-N1) */
  NEW_GAME_PER_MIN: 10,
  /** log endpoint concurrent/limit (U-N1) */
  LOG_PER_IP_BURST: 30,
  LOG_WINDOW_MS: 10_000,
  /** SPEC 15.1 */
  CSV_MAX_LINES: 20_000,
  MAX_BODY_BYTES: 16 * 1024,
  MAX_WS_MESSAGE_BYTES: 4 * 1024,
  CHAT_HISTORY: 200,
  /** meta-only keep-alive frame (SPEC 21: 4-20 s) */
  KEEPALIVE_FRAME_MS: 10_000,
  /** a socket whose send buffer exceeds this is dropped (it will RUP on reconnect) */
  MAX_BUFFERED_BYTES: 2 * 1024 * 1024
} as const;

/** Sliding-window counter per key. */
export class RateWindow {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number, private now: () => number = Date.now) {}
  /** returns true when the hit is allowed */
  hit(key: string): boolean {
    const t = this.now();
    const arr = (this.hits.get(key) ?? []).filter((x) => x > t - this.windowMs);
    arr.push(t);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) this.sweep(t);
    return arr.length <= this.max;
  }
  private sweep(t: number): void {
    for (const [k, v] of this.hits) if (!v.length || v[v.length - 1]! <= t - this.windowMs) this.hits.delete(k);
  }
}
