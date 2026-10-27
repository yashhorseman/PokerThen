import type { WebSocket } from "ws";
import { diffFrames, type Frame, type PlayerId, type ServerMsg } from "@pokerthen/shared";
import { LIMITS } from "../limits.js";
import type { Subscriber, TableRunner } from "../tables/runner.js";

type Json = Record<string, unknown>;
const stripMeta = (f: Frame | null): unknown => (f ? { ...f, meta: undefined } : null);

/**
 * One WebSocket client. Keeps the last frame sent to THIS socket: deltas are diffs against it and chain by
 * meta.pre === previous meta.now (ARCH 5.3).
 */
export class Conn implements Subscriber {
  registered = false;
  last: Frame | null = null;
  lastNow = 0;
  alive = true;
  lastSeenAt: number;
  msgTimes: number[] = [];
  pongTimer: NodeJS.Timeout | null = null;
  closed = false;

  constructor(readonly ws: WebSocket, readonly runner: TableRunner, readonly viewer: PlayerId, readonly ip: string, private clock: () => number) {
    this.lastSeenAt = clock();
  }

  send(msg: ServerMsg | Json): void {
    if (this.closed || this.ws.readyState !== 1) return;
    if (this.ws.bufferedAmount > LIMITS.MAX_BUFFERED_BYTES) { this.ws.terminate(); return; }
    this.ws.send(JSON.stringify(msg));
  }

  private nextNow(): number { return Math.max(this.clock(), this.lastNow + 1); }

  /** Full frame for this viewer (registered / rup). */
  fullFrame(): Frame {
    const now = this.nextNow();
    const f = this.runner.project(this.viewer, now);
    f.meta.now = now; f.meta.pre = this.lastNow; f.meta.sN = now;
    this.last = f; this.lastNow = now;
    return f;
  }

  pushUpdate(force = false): void {
    if (this.closed) return;
    if (!this.last) return; // not registered yet
    const now = this.nextNow();
    const f = this.runner.project(this.viewer, now);
    f.meta.now = now; f.meta.pre = this.lastNow; f.meta.sN = now;
    const changed = diffFrames(stripMeta(this.last), stripMeta(f)) !== undefined;
    if (!changed && !force) return;
    const delta = (diffFrames(this.last, f) ?? {}) as Json;
    delta.meta = { ...((delta.meta as Json | undefined) ?? {}), now, pre: f.meta.pre, sN: now };
    this.send({ t: "gC", delta: delta as never });
    this.last = f; this.lastNow = now;
  }
}
