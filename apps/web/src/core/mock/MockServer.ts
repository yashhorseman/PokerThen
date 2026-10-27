import { diffFrames, type ClientMsg, type Frame, type ServerMsg } from "@pokerthen/shared";
import type { SocketLike } from "../socket/session";

/**
 * Scripted in-memory server for UI development before the real server exists (and for tests).
 * `createSocket` is a SocketLike factory: on connect it answers `registered` with the current frame.
 * `push(frame)` sends a delta (chain intact); `pushRaw(msg)` sends anything (e.g. a broken-chain delta).
 */
export class MockServer {
  frame: Frame;
  you: { id: string; name: string; mutedIds: string[]; straddling: boolean };
  sockets: MockSocket[] = [];
  received: ClientMsg[] = [];
  autoRegister = true;
  constructor(frame: Frame) {
    this.frame = frame;
    this.you = { id: frame.you!.id, name: frame.you!.name, mutedIds: frame.you!.mutedIds, straddling: frame.you!.straddling };
  }
  createSocket = (url: string): MockSocket => {
    const s = new MockSocket(this, url);
    this.sockets.push(s);
    return s;
  };
  get live(): MockSocket | undefined {
    return this.sockets.filter((s) => s.open).at(-1);
  }
  /** next frame; meta.now strictly increases and meta.pre chains */
  next(frame: Frame): Frame {
    return { ...frame, meta: { ...frame.meta, pre: this.frame.meta.now, now: Math.max(frame.meta.now, this.frame.meta.now + 1) } };
  }
  push(frame: Frame): void {
    const n = this.next(frame);
    const delta = diffFrames(this.frame, n) ?? { meta: { now: n.meta.now, pre: n.meta.pre } };
    (delta as { meta: Record<string, unknown> }).meta = { ...(delta as { meta?: object }).meta, now: n.meta.now, pre: n.meta.pre, sN: n.meta.sN };
    this.frame = n;
    this.live?.deliver({ t: "gC", delta: delta as never });
  }
  pushRaw(msg: ServerMsg): void {
    this.live?.deliver(msg);
  }
  onClient(msg: ClientMsg, from: MockSocket): void {
    this.received.push(msg);
    if (msg.t === "ping") from.deliver({ t: "pong", ts: msg.ts, serverNow: Date.now() });
    if (msg.t === "action" && msg.action.type === "RUP") from.deliver({ t: "rup", frame: this.frame });
    if (msg.t === "rue") from.deliver({ t: "rEM", version: this.frame.meta.mEV, emojis: {} });
  }
}

export class MockSocket implements SocketLike {
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  open = false;
  closed = false;
  constructor(
    readonly server: MockServer,
    readonly url: string
  ) {
    queueMicrotask(() => {
      if (this.closed) return;
      this.open = true;
      this.onopen?.({});
      if (server.autoRegister) this.deliver({ t: "registered", frame: server.frame, you: server.you });
    });
  }
  send(data: string): void {
    this.server.onClient(JSON.parse(data) as ClientMsg, this);
  }
  close(code = 1000): void {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.onclose?.({ code });
  }
  deliver(msg: ServerMsg): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  /** simulate a network drop / server close */
  drop(code = 1006): void {
    this.closed = true;
    this.open = false;
    this.onclose?.({ code });
  }
}
