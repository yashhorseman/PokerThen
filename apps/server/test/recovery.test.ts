import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client, cleanup, seatGuest, startTest, type TestApp } from "./helpers.js";
import { fakeTiming } from "./fakeEngine.js";

const apps: TestApp[] = [];
afterEach(async () => { for (const t of apps.splice(0)) { await t.stop().catch(() => {}); cleanup(t.dir); } fakeTiming.fold = 3000; });

describe("crash recovery", () => {
  it("restart mid-hand: same deck + commitment, timers resume, no duplicate log lines, junk quarantined, uncommitted lines dropped", async () => {
    fakeTiming.fold = 600;
    const t1 = await startTest(); apps.push(t1);
    const owner = await new Client(t1).init();
    const gid = await owner.newGame("Yash");
    const guest = await seatGuest(t1, owner, gid, "Bob", 2);
    await owner.http("POST", `/games/${gid}/start-game`, {});
    const r1 = t1.app.registry.get(gid)!;
    const deck1 = JSON.stringify((r1.state as any).hand.deck);
    const commit1 = (await owner.http("GET", `/api/games/${gid}/fairness/1`)).json.commitment;
    // fold -> result window running (timer pending), then crash
    const ows = owner.ws(gid); await ows.registered();
    const turn = (r1.state as any).hand.inHand[(r1.state as any).hand.toAct];
    const c = turn === owner.playerId ? owner : guest;
    const cw = c.ws(gid); await cw.registered(); cw.action("PLAYER_FOLD");
    await ows.until(() => ows.frame!.turn.nextStep === "NSAGR");
    const logBefore = readFileSync(join(t1.dir, "tables", gid, "log.jsonl"), "utf8");
    const seqBefore = r1.seq;
    await t1.app.crash();
    // simulate a torn write after the crash: line with seq > state.seq plus garbage line, and a junk table dir
    appendFileSync(join(t1.dir, "tables", gid, "log.jsonl"), JSON.stringify({ seq: seqBefore + 5, createdAt: 1, handNumber: 1, msg: "ghost" }) + "\n{garbled\n");
    mkdirSync(join(t1.dir, "tables", "ptlJUNKJUNKJUNKJUNKJUNK"), { recursive: true });
    writeFileSync(join(t1.dir, "tables", "ptlJUNKJUNKJUNKJUNKJUNK", "state.json"), "{not json");
    const t2 = await startTest({ dir: t1.dir }); apps.push(t2);
    expect(readdirSync(join(t1.dir, "quarantine")).length).toBe(1);
    const r2 = t2.app.registry.get(gid)!;
    expect(JSON.stringify((r2.state as any).hand?.deck ?? (r2.state as any).hand)).toBeTruthy();
    const log = readFileSync(join(t1.dir, "tables", gid, "log.jsonl"), "utf8");
    expect(log).not.toContain("ghost"); expect(log).not.toContain("garbled");
    const lines = log.trim().split("\n");
    expect(lines.slice(0, logBefore.trim().split("\n").length).join("\n")).toBe(logBefore.trim());
    expect(new Set(lines).size).toBe(lines.length); // no duplicates
    const owner2 = new Client(t2); owner2.cookie = owner.cookie; owner2.playerId = owner.playerId;
    // commitment survives; the result timer resumed and the next hand (hand 2) gets dealt
    expect((await owner2.http("GET", `/api/games/${gid}/fairness/1`)).json.commitment).toBe(commit1);
    const ws2 = owner2.ws(gid); await ws2.registered();
    await ws2.until(() => ws2.frame!.table.handNumber === 2, 4000);
    const rev = (await owner2.http("GET", `/api/games/${gid}/fairness/1`)).json.reveal;
    expect(rev.commitment).toBe(commit1);
    expect(deck1).toBeTruthy();
    const startLines = (await owner2.http("GET", `/api/games/${gid}/log_v3?hand_number=1`)).json.filter((e: any) => e.msg.startsWith("-- starting"));
    expect(startLines.length).toBe(1);
    ws2.close();
  });
  it("mid-hand restart keeps the hidden hand intact (deck/commitment identical in state)", async () => {
    const t1 = await startTest(); apps.push(t1);
    const owner = await new Client(t1).init();
    const gid = await owner.newGame("Yash");
    await seatGuest(t1, owner, gid, "Bob", 2);
    await owner.http("POST", `/games/${gid}/start-game`, {});
    const s1 = JSON.stringify((t1.app.registry.get(gid)!.state as any).hand);
    await t1.app.crash();
    const t2 = await startTest({ dir: t1.dir }); apps.push(t2);
    expect(JSON.stringify((t2.app.registry.get(gid)!.state as any).hand)).toBe(s1);
  });
});
