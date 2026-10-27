import { describe, expect, it } from "vitest";
import { fixtures } from "@pokerthen/shared/fixtures";
import { makeIntent, reconcileIntent, isFreeCheck } from "../../src/core/store/intent";
import { soundsForTransition, TimerWatcher } from "../../src/core/effects/sounds";
import { deriveFixtureVM } from "../../src/core/testing";
import { dispatchKey, registerHotkey } from "../../src/core/hotkeys";
import { modalLock } from "../../src/core/ui/modalLock";
import type { Frame } from "@pokerthen/shared";

const off = fixtures["off-turn-preaction"]!; // you = p1 (SB), bet 20 to call, p3 to act

describe("intent store rules (SPEC 6.2)", () => {
  it("stores while off turn, drops when highest changes (call) or street changes", () => {
    const i = makeIntent(off, "call");
    expect(reconcileIntent(i, off, "p1")).toEqual({ intent: i, send: null });
    const raised: Frame = { ...off, hand: { ...off.hand!, highestBet: 60 } };
    expect(reconcileIntent(i, raised, "p1").intent).toBeNull();
    const flop: Frame = { ...off, hand: { ...off.hand!, street: { run: 1, stage: 1 } } };
    expect(reconcileIntent(i, flop, "p1").intent).toBeNull();
  });
  it("check-or-fold becomes fold once someone bets", () => {
    const free: Frame = { ...off, hand: { ...off.hand!, highestBet: 0, bets: {} } };
    const i = makeIntent(free, "checkOrFold");
    const bet: Frame = { ...free, hand: { ...free.hand!, highestBet: 40, bets: { p2: 40 } } };
    expect(reconcileIntent(i, bet, "p1").intent?.kind).toBe("fold");
  });
  it("sends on your turn", () => {
    const mine: Frame = { ...off, turn: { ...off.turn, taking: "p1", playerId: "p1" } };
    const i = makeIntent(off, "call");
    expect(reconcileIntent(i, mine, "p1")).toEqual({ intent: null, send: { type: "PLAYER_CALL" } });
    const cof = makeIntent(off, "checkOrFold");
    expect(isFreeCheck(mine, "p1")).toBe(false);
    expect(reconcileIntent(cof, mine, "p1").send).toEqual({ type: "PLAYER_FOLD" });
  });
});

describe("sound triggers (SPEC 18.1)", () => {
  it("chips on bet change, fold, beep on your turn, silent on first frame", () => {
    const a = fixtures["off-turn-preaction"]!;
    expect(soundsForTransition(null, a, { youId: "p1", hasStoredIntent: false })).toEqual([]);
    const b: Frame = { ...a, hand: { ...a.hand!, bets: { ...a.hand!.bets, p3: 20 }, playerStatus: { ...a.hand!.playerStatus, p4: "fold" } }, turn: { ...a.turn, taking: "p1", actionStartedAt: 5 } };
    const s = soundsForTransition(a, b, { youId: "p1", hasStoredIntent: false });
    expect(s).toEqual(expect.arrayContaining(["chips", "fold", "beep"]));
    expect(soundsForTransition(a, b, { youId: "p1", hasStoredIntent: true })).not.toContain("beep");
    const chk: Frame = { ...a, hand: { ...a.hand!, bets: { ...a.hand!.bets, p3: "check" } } };
    expect(soundsForTransition(a, chk, { youId: "p1", hasStoredIntent: false })).toContain("two-taps");
  });
  it("warning beep fires once past 70% of normal time, and once for the bank", () => {
    const f = fixtures["preflop-your-turn"]!; // you p3 acting
    const t = f.turn;
    const w = new TimerWatcher();
    const start = t.actionStartedAt!;
    const reg = t.deadlineNoBank! - start;
    expect(w.check(f, "p3", start + reg * 0.5)).toBe(false);
    expect(w.check(f, "p3", start + reg * 0.71)).toBe(true);
    expect(w.check(f, "p3", start + reg * 0.8)).toBe(false);
    const bank = t.deadlineWithBank! - t.deadlineNoBank!;
    expect(w.check(f, "p3", t.deadlineNoBank! + bank * 0.71)).toBe(true);
  });
});

describe("hotkeys (SPEC 6.4)", () => {
  const ev = (key: string, target: unknown = {}): KeyboardEvent => ({ key, target, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} }) as unknown as KeyboardEvent;
  it("fires, respects modal lock, input focus and mobile UA", () => {
    let n = 0;
    const un = registerHotkey("k", () => void n++);
    const plus = registerHotkey("+", () => void n++, { skipGlobalLock: true });
    expect(dispatchKey(ev("K"), false)).toBe(true);
    expect(n).toBe(1);
    expect(dispatchKey(ev("k", { tagName: "INPUT" }), false)).toBe(false);
    const release = modalLock.acquire();
    expect(dispatchKey(ev("k"), false)).toBe(false);
    expect(dispatchKey(ev("+"), false)).toBe(true);
    release();
    expect(dispatchKey(ev("k"), true)).toBe(false);
    un();
    plus();
    expect(dispatchKey(ev("k"), false)).toBe(false);
  });
});

describe("action bar extras", () => {
  it("time bank only on your turn with bank", () => {
    expect(deriveFixtureVM("preflop-your-turn").action.timeBank).toMatchObject({ visible: true, activated: false, secondsLeft: 10 });
    expect(deriveFixtureVM("off-turn-preaction").action.timeBank.visible).toBe(false);
  });
});
