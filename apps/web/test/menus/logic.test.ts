import { describe, expect, it } from "vitest";
import { defaultGameConfig, type PlayerInfo } from "@pokerthen/shared";
import {
  HandCache, addLevel, addPreset, applyPreset, logEntryClass, orderPlayers, parseReveal, playerStatusText, removeLevel,
  sortLedger, splitLogNames, toggleSort, DEFAULT_SORT, arrow, netText, validateConfig, digitsOnly, toIntOrNull
} from "../../src/menus/logic";
import { balloonMs } from "../../src/menus/ChatDock";

const pl = (o: Partial<PlayerInfo>): PlayerInfo => ({ id: "a", name: "A", status: "inGame", stack: 10, winCount: 0, quitCount: 0, ...o });

describe("log", () => {
  it("splits names", () => {
    expect(splitLogNames('"Bob @ 2nQAu2OoHX" folds')).toEqual([{ name: "Bob", id: "2nQAu2OoHX" }, " folds"]);
  });
  it("classes", () => {
    expect(logEntryClass("-- starting hand #1 (id: x)")).toBe("start-game");
    expect(logEntryClass("Flop:  [7♠]")).toBe("entry-street");
    expect(logEntryClass("river: a")).toBe("entry-street");
    expect(logEntryClass('"X" collected 120 from pot')).toBe("entry-collect");
    expect(logEntryClass('"X" folds')).toBe("entry-fold");
    expect(logEntryClass('"X" raises to 50')).toBe("entry-raise");
    expect(logEntryClass('"X" posts a big blind of 20')).toBe("entry-raise");
    expect(logEntryClass('"X" checks')).toBe("entry-check");
    expect(logEntryClass('"X" calls 20')).toBe("entry-call");
    expect(logEntryClass("Hand commitment (SHA-256): ab")).toBe("entry-fairness");
    expect(logEntryClass("Hand reveal: salt a, deck b. Verify")).toBe("entry-fairness");
  });
  it("reveal verify link", () => expect(parseReveal("Hand reveal: salt a, deck b. Verify").verify).toBe("Verify"));
  it("cache keeps max 50", () => {
    const c = new HandCache<number>(50);
    for (let i = 0; i < 60; i++) c.set(i, i);
    expect(c.size).toBe(50);
    expect(c.has(9)).toBe(false);
    expect(c.has(10)).toBe(true);
  });
});

describe("ledger", () => {
  const rows = [
    { id: "1", name: "b", buyInSum: 1, buyOutSum: 0, inGame: 0, nitEscrow: 0, net: -1000 },
    { id: "2", name: "a", buyInSum: 2, buyOutSum: 0, inGame: 4000, nitEscrow: 0, net: 3000 }
  ];
  it("default net desc, toggle, arrows", () => {
    expect(sortLedger(rows, DEFAULT_SORT).map((r) => r.id)).toEqual(["2", "1"]);
    const s = toggleSort(DEFAULT_SORT, "net");
    expect(s.dir).toBe("asc");
    expect(sortLedger(rows, s).map((r) => r.id)).toEqual(["1", "2"]);
    expect(arrow(DEFAULT_SORT, "net")).toBe("↓");
    expect(arrow(s, "net")).toBe("↑");
    expect(arrow(s, "name")).toBe("");
    expect(toggleSort(s, "name")).toEqual({ col: "name", dir: "desc" });
  });
  it("net text", () => {
    expect(netText(3000)).toBe("+3000");
    expect(netText(-5)).toBe("-5");
  });
});

describe("players", () => {
  it("order pending, seated, watchers", () => {
    const o = orderPlayers({
      w: pl({ id: "w", status: "watching" }),
      s: pl({ id: "s" }),
      p: pl({ id: "p", status: "requestedGameIngress" })
    });
    expect(o.map((x) => x.id)).toEqual(["p", "s", "w"]);
  });
  it("status strings", () => {
    expect(playerStatusText(pl({ stack: 4000 }))).toBe("Playing with 4000 stack");
    expect(playerStatusText(pl({ status: "requestedGameIngress", intendedSeat: 6 }))).toBe("Requested Ingress (Intended Seat Number: 6)");
    expect(playerStatusText(pl({ status: "waitingNextGameToEnter" }))).toBe("Waiting next turn to enter");
    expect(playerStatusText(pl({ away: true }))).toBe("Away");
    expect(playerStatusText(pl({ quitNextHand: true }))).toBe("Player will quit in the Next Turn");
    expect(playerStatusText(pl({ status: "watching" }))).toBe("Watching");
  });
});

describe("config editing", () => {
  it("defaults equal SPEC 10", () => {
    const c = defaultGameConfig();
    expect(c.blindLevels).toEqual([{ sb: 10, bb: 20, ante: null, durationMin: null }]);
    expect([c.antes, c.centsMode, c.rabbitHunt, c.runItTwice, c.straddleAllowed, c.autoDeal, c.showdownTime, c.dealToAway]).toEqual([false, false, false, "no", false, true, "normal", false]);
    expect([c.decisionLimitSec, c.timeBankSec, c.timeBankFillHands]).toEqual([20, 10, 10]);
    expect([c.revealAllWhenNoAction, c.spectatorMode, c.allowRebuy, c.guestChat, c.recordChat, c.autoTrimBets]).toEqual([true, false, false, true, true, false]);
  });
  it("levels", () => {
    let l = addLevel(defaultGameConfig().blindLevels, false);
    expect(l).toHaveLength(2);
    expect(l[1]!.durationMin).toBeNull();
    expect(removeLevel(l, 0)).toHaveLength(2); // first row cannot be removed
    l = removeLevel(l, 1);
    expect(l).toHaveLength(1);
  });
  it("digits", () => {
    expect(digitsOnly("1a2-3")).toBe("123");
    expect(toIntOrNull("")).toBeNull();
    expect(toIntOrNull("0x7")).toBe(7);
  });
  it("presets", () => {
    const c = defaultGameConfig();
    let p: Parameters<typeof addPreset>[0] = [];
    expect(addPreset(p, "  ", c)).toEqual({ ok: false, error: "You must define the preset name." });
    const r = addPreset(p, "A", c);
    expect(r.ok).toBe(true);
    if (r.ok) p = r.presets;
    expect(addPreset(p, "A", c)).toEqual({ ok: false, error: "There's a preset with same name." });
    for (const n of ["B", "C", "D", "E"]) {
      const x = addPreset(p, n, c);
      if (x.ok) p = x.presets;
    }
    expect(p).toHaveLength(5);
    expect(addPreset(p, "F", c)).toEqual({ ok: false, error: "You reached the max limit of 5 presets." });
  });
  it("apply ignores locked parts", () => {
    const cur = { ...defaultGameConfig(), centsMode: true };
    const pre = { ...defaultGameConfig(), centsMode: false, blindLevels: [{ sb: 1, bb: 2, ante: null, durationMin: null }] };
    const out = applyPreset(cur, pre, true, true);
    expect(out.centsMode).toBe(true);
    expect(out.blindLevels).toEqual(cur.blindLevels);
  });
  it("reset-level required when running multi-level", () => {
    const c = defaultGameConfig();
    c.blindLevels = addLevel(c.blindLevels, false);
    expect(validateConfig(c, true).blindResetLevel).toBe("You need to choose a blind reset level.");
    expect(validateConfig(c, false).blindResetLevel).toBeUndefined();
  });
});

describe("chat", () => {
  it("balloon lifetime", () => expect(balloonMs("one two three")).toBe(2300 + 900));
});
