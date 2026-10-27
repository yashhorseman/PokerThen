import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameStore } from "../../src/core/store/gameStore";
import { GameSession } from "../../src/core/socket/session";
import { MockServer } from "../../src/core/mock/MockServer";
import { fixtures } from "@pokerthen/shared/fixtures";
import { T, type Frame } from "@pokerthen/shared";

function setup() {
  const server = new MockServer(fixtures["preflop-your-turn"]!);
  const store = new GameStore("fixture1");
  const session = new GameSession({ store, createSocket: server.createSocket, buildUrl: (q) => `mock://ws?${q}`, layout: () => "d", random: () => 0.5 });
  return { server, store, session };
}
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

describe("GameSession against a scripted socket", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("connects, registers, applies chained deltas", async () => {
    const { server, store, session } = setup();
    session.start();
    expect(store.getState().connection.status).toBe("connecting");
    await flush();
    expect(store.getState().connection.status).toBe("connected");
    expect(server.sockets[0]!.url).toContain("firstConnection=true");
    const next: Frame = { ...server.frame, hand: { ...server.frame.hand!, pot: 55 } };
    server.push(next);
    expect(store.getState().frame!.hand!.pot).toBe(55);
    session.stop();
  });

  it("broken chain sends RUP, ignores deltas until the rup frame", async () => {
    const { server, store, session } = setup();
    session.start();
    await flush();
    const base = store.getState().frame!;
    const bad = { t: "gC", delta: { meta: { pre: base.meta.now + 999, now: base.meta.now + 1000 }, hand: { pot: 1 } } } as never;
    server.onClient = (m) => void server.received.push(m); // no rup reply: stay in awaiting state
    server.pushRaw(bad);
    expect(server.received.some((m) => m.t === "action" && m.action.type === "RUP")).toBe(true);
    expect(store.getState().frame!.hand!.pot).toBe(base.hand!.pot);
    // ignored while awaiting RUP... until rup arrives (mock answers synchronously with its own frame)
    expect(session.stats.rups).toBe(1);
    server.pushRaw(bad);
    expect(session.stats.rups).toBe(1);
    session.stop();
  });

  it("reconnects with backoff and replays registered (no prev frame); firstConnection dropped", async () => {
    const { server, store, session } = setup();
    session.start();
    await flush();
    server.sockets[0]!.drop(1006);
    expect(store.getState().connection.status).toBe("disconnected");
    await vi.advanceTimersByTimeAsync(T.RECONNECT_MAX);
    expect(server.sockets.length).toBe(2);
    expect(server.sockets[1]!.url).not.toContain("firstConnection");
    await flush();
    expect(store.getState().connection.status).toBe("connected");
    expect(store.getState().prev).toBeNull();
    session.stop();
  });

  it("close 4401 => failed session-missing-token, no reconnect", async () => {
    const { server, store, session } = setup();
    session.start();
    await flush();
    server.sockets[0]!.drop(4401);
    expect(store.getState().connection).toMatchObject({ status: "failed", failedCode: "session-missing-token" });
    await vi.advanceTimersByTimeAsync(20000);
    expect(server.sockets.length).toBe(1);
    session.stop();
  });

  it("drops actions before registered except RUP; pings every 20 s", async () => {
    const { server, session } = setup();
    server.autoRegister = false;
    session.start();
    await flush();
    expect(session.sendAction({ type: "PLAYER_FOLD" })).toBe(false);
    expect(session.sendAction({ type: "RUP" })).toBe(true);
    server.live!.deliver({ t: "registered", frame: server.frame, you: server.you });
    await vi.advanceTimersByTimeAsync(T.APP_PING + 10);
    expect(server.received.some((m) => m.t === "ping")).toBe(true);
    session.stop();
  });

  it("no pong within 5 s => reconnect", async () => {
    const { server, store, session } = setup();
    server.onClient = () => undefined; // never answers
    session.start();
    await flush();
    await vi.advanceTimersByTimeAsync(T.APP_PING + T.PONG_TIMEOUT + 10);
    expect(store.getState().connection.status).toBe("disconnected");
    await vi.advanceTimersByTimeAsync(T.RECONNECT_MAX);
    expect(server.sockets.length).toBe(2);
    session.stop();
  });
});
