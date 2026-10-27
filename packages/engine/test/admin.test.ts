import { describe, expect, it } from "vitest";
import { Game, id, mkDeck, playOut, strip } from "./helpers.js";

const F = "PLAYER_FOLD", K = "PLAYER_CHECK", C = "PLAYER_CALL", R = "PLAYER_RAISE";
const y = id("yash");
const cfgOf = (g: Game, over: Record<string, unknown>) => g.ok(y, { kind: "updateGame", config: { ...(g.st.config as object), ...over } as never });
const plain = (g: Game) => g.logs().map(strip);
const two = () => { const g = new Game(y); const d = g.seat("Dave", 2); return { g, d }; };
const deck2 = (d: string) => mkDeck([d, y], { [y]: ["As", "Ad"], [d]: ["Kh", "Kc"] }, ["Qd", "Js", "4h", "9c", "3s"]);

describe("seats and approvals", () => {
  it("request validation errors match SPEC 2.3", () => {
    const g = new Game(y); const p = id("Zed"); g.ok(p, { kind: "presence", connected: true });
    const body = (playerName: string, stack: number | null) => ({ seat: 2, playerName, allowSpectator: false, stack });
    let r = g.cmd(p, { kind: "requestIngress", body: body("", null) });
    expect(r).toMatchObject({ ok: false, status: 422, errors: { playerName: "must be unique and length must be between 2 and 14", stack: "must be a value between 1 and 1.000.000" } });
    r = g.cmd(p, { kind: "requestIngress", body: body("Zed", 0) });
    expect(r).toMatchObject({ ok: false, errors: { stack: "must be a value between 1 and 1.000.000" } });
    r = g.cmd(p, { kind: "requestIngress", body: body("yash", 100) });
    expect(r).toMatchObject({ ok: false, errors: { playerName: "must be unique on this game" } });
    r = g.cmd(p, { kind: "requestIngress", body: body(" a ", 100) });
    expect(r).toMatchObject({ ok: false, errors: { playerName: "must be unique and length must be between 2 and 14" } });
    expect(g.cmd(p, { kind: "requestIngress", body: body("Zed", 1_000_001) }).ok).toBe(false);
    expect(g.cmd(p, { kind: "requestIngress", body: body("Zed", 100) }).ok).toBe(true);
  });
  it("approve mid-hand -> waitingNextGameToEnter, joins next hand; reject/cancel/ignore", () => {
    const { g, d } = two();
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    const e = id("Eve"); g.ok(e, { kind: "presence", connected: true });
    g.ok(e, { kind: "requestIngress", body: { seat: 5, playerName: "Eve", allowSpectator: false, stack: 700 } });
    expect(g.frame(y).players[e]).toMatchObject({ status: "requestedGameIngress", intendedSeat: 5, requestedStack: 700 });
    expect(g.frame(d).players[e]!.intendedSeat).toBeUndefined();
    g.ok(y, { kind: "approvePlayer", playerID: e, stack: 650 });
    expect(g.st.players[e]!.status).toBe("waitingNextGameToEnter");
    expect(g.cmd(d, { kind: "approvePlayer", playerID: e }).ok).toBe(false);
    playOut(g, [[y, F]]);
    g.toResult(); g.until(() => g.st.hand!.number === 2);
    expect(g.st.players[e]!.status).toBe("inGame");
    expect(plain(g)).toContain("The player Eve joined the game with a stack of 650.");
    const f = id("Fay"); g.ok(f, { kind: "presence", connected: true });
    g.ok(f, { kind: "requestIngress", body: { seat: 6, playerName: "Fay", allowSpectator: false, stack: 100 } });
    g.ok(f, { kind: "action", action: { type: "CANCEL_REQUEST_GAME_INGRESS" } });
    expect(g.st.players[f]!.status).toBe("watching");
    g.ok(f, { kind: "requestIngress", body: { seat: 6, playerName: "Fay", allowSpectator: false, stack: 100 } });
    g.ok(y, { kind: "rejectPlayer", playerID: f });
    expect(g.st.players[f]!.status).toBe("watching");
  });
  it("start game needs 2 players (422 value), only owner", () => {
    const g = new Game(y);
    expect(g.cmd(y, { kind: "startGame" })).toMatchObject({ ok: false, status: 422, value: "Not enough players to start the game." });
    const d = g.seat("Dave", 2);
    expect(g.cmd(d, { kind: "startGame" })).toMatchObject({ ok: false, status: 403 });
  });
  it("owner tools: edit stack immediately when waiting, queued mid-hand, remove, transfer, god mode", () => {
    const { g, d } = two();
    g.ok(y, { kind: "updatePlayer", playerID: d, stackChange: 100, stackChangeMode: "ADD" });
    expect(g.st.players[d]!.stack).toBe(1100);
    expect(plain(g).slice(-1)).toEqual(["The admin updated the player Dave stack from 1000 to 1100."]);
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    const r = g.ok(y, { kind: "updatePlayer", playerID: d, stackChange: 180, stackChangeMode: "SET" });
    expect((r as { queued?: boolean }).queued).toBe(true);
    expect(plain(g).slice(-1)).toEqual(["WARNING: the admin queued the stack change for the player Dave reseting to 180 chips in the next hand."]);
    expect(g.e.playerEdit!(g.s, d)!.enqueuedChanges).toEqual([{ kind: "update", mode: "SET", value: 180 }]);
    playOut(g, [[y, F]]); g.toResult(); g.until(() => g.st.hand!.number === 2);
    expect(plain(g)).toContain("The admin updated the player Dave stack from 1090 to 180.".replace("1090", String(1100 + 10)));
    expect(g.st.players[d]!.stack + (g.st.hand!.bets[d] ?? 0) + (g.st.hand!.contrib[d]! - (g.st.hand!.bets[d] ?? 0))).toBe(180);
    g.ok(y, { kind: "transferOwnership", playerID: d });
    expect(g.e.isOwner(g.s, d)).toBe(true);
    expect(g.cmd(y, { kind: "removePlayer", playerID: d }).ok).toBe(false);
  });
  it("remove mid-hand: enqueued then quits at hand end; ledger records the cash-out", () => {
    const { g, d } = two();
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    g.ok(y, { kind: "removePlayer", playerID: d });
    expect(plain(g).slice(-1)).toEqual(['The admin "yash @ yash______" enqueued the removal of the player "Dave @ Dave______".'.replace(/"([^"]*?) @ [^"]{10}"/g, "$1")]);
    g.toResult(); 
    g.until(() => g.st.players[d]!.seat === null);
    expect(plain(g).some((l) => /^The player Dave quits the game with a stack of \d+\.$/.test(l))).toBe(true);
    const led = g.e.ledger(g.s);
    expect(led.playersInfos[d]!.buyInSum).toBe(1000);
    expect(led.buyInTotal - led.buyOutTotal - led.inGameTotal).toBe(0 + 0);
  });
});

describe("away, leave, stop", () => {
  it("away mid-hand auto check/fold, no log at SUNH, stand up at hand end, skipped next hand, sit back", () => {
    const g = new Game(y); const d = g.seat("Dave", 2), e = g.seat("Eve", 3);
    g.stack(mkDeck([y, d, e], { [y]: ["As", "Ad"], [d]: ["Kh", "Kc"], [e]: ["2c", "7d"] }, ["Qd", "Js", "4h", "9c", "3s"]), 2);
    g.ok(y, { kind: "startGame" });
    g.clearFx();
    g.ok(d, { kind: "action", action: { type: "SUNH" } });
    expect(g.logs()).toEqual([]);
    playOut(g, [[e, C], [y, C]]);
    expect(plain(g).slice(-2)).toEqual(["yash calls 20", "Dave checks"]);
    g.toResult();
    expect(plain(g)).toContain("The player Dave stand up with the stack of " + g.st.players[d]!.stack + ".");
    expect(g.st.players[d]!.status).toBe("standingUp");
    g.until(() => g.st.hand!.number === 2);
    expect(g.st.hand!.participants).not.toContain(d);
    g.clearFx();
    g.ok(d, { kind: "action", action: { type: "PLAYER_SIT_BACK" } });
    expect(g.st.players[d]!.status).toBe("waitingNextGameToEnter");
    expect(g.logs()).toEqual([]);
  });
  it("leave seat mid-hand: QUITTING, auto fold, quits line at end; cancel with CQNH", () => {
    const { g, d } = two();
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    g.ok(d, { kind: "action", action: { type: "QNH" } });
    expect(g.frame(y).players[d]!.status).toBe("quiting");
    g.ok(d, { kind: "action", action: { type: "CQNH" } });
    expect(g.frame(y).players[d]!.status).toBe("inGame");
    g.ok(d, { kind: "action", action: { type: "QNH" } });
    playOut(g, [[y, C]]); // Dave (BB, quitting) auto-checks
    g.toResult(); g.until(() => g.st.players[d]!.seat === null);
    expect(plain(g).some((l) => l.startsWith("The player Dave quits the game with a stack of"))).toBe(true);
  });
  it("B3: leave seat / away while the action is on you auto-acts at once (check/fold mode starts immediately)", () => {
    const { g, d } = two();
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    const actor = g.st.hand!.actor!;
    g.ok(actor, { kind: "action", action: { type: "QNH" } });
    expect(plain(g).some((l) => l.endsWith(" folds"))).toBe(true);
    expect(g.st.hand!.actor).not.toBe(actor);
  });
  it("stop game: log, hard stop to waiting, restart picks a random dealer, hand numbers continue", () => {
    const { g, d } = two();
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    g.ok(y, { kind: "action", action: { type: "TSG", decision: true } });
    expect(plain(g).slice(-1)).toEqual(["The admin yash enqueued the game stop on next hand."]);
    expect(g.frame(y).table.stopQueued).toBe(true);
    playOut(g, [[y, F]]); g.toResult(); g.until(() => g.st.status === "waiting");
    expect(g.st.hand).toBeNull();
    g.stack(deck2(d), 1); g.ok(y, { kind: "startGame" });
    expect(g.st.hand!.number).toBe(2);
  });
  it("auto-deal off: Next Hand button flow and waiting message", () => {
    const { g, d } = two(); cfgOf(g, { autoDeal: false });
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    playOut(g, [[y, F]]); g.toResult();
    g.until(() => g.st.hand!.closed);
    expect(g.frame(y).table.waitingMessage).toBe("Waiting for the owner to deal the next hand.");
    expect(g.frame(y).result).not.toBeNull(); expect(g.frame(y).turn.nextStep).toBeNull();
    expect(g.e.nextWakeAt(g.s)).toBeNull();
    expect(g.cmd(d, { kind: "action", action: { type: "NH" } })).toMatchObject({ ok: false, status: 403 });
    g.ok(y, { kind: "action", action: { type: "NH" } });
    expect(g.st.hand!.number).toBe(2);
  });
});

describe("timers", () => {
  it("limit then bank: ATB needed, auto fold facing a bet, check when free, honours 800/3000/6000 ms steps", () => {
    const { g, d } = two();
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" }); // yash SB acts, owes 10
    const t0 = g.now;
    let fr = g.frame(y);
    expect(fr.turn.deadlineNoBank).toBe(t0 + 20000); expect(fr.turn.deadlineWithBank).toBe(t0 + 30000);
    g.okAct(y, { type: "ATB" });
    g.advance(29_999); expect(g.st.hand!.phase).toBe("betting");
    g.advance(1);
    expect(plain(g).slice(-1)).toEqual(["yash folds"]);
    expect(g.frame(d).turn.nextStep).toBe("NSAF"); expect(g.frame(d).turn.nextStepAt).toBe(g.now + 790);
    g.advance(790); expect(g.st.hand!.phase).toBe("result");
    expect(g.frame(d).turn.nextStep).toBe("NSAGR"); expect(g.frame(d).turn.nextStepAt).toBe(g.now + 3000);
    g.advance(3000); expect(g.st.hand!.number).toBe(2);
  });
  it("no ATB: acts at limit (+grace); check when nothing to call", () => {
    const { g, d } = two();
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    playOut(g, [[y, C]]);
    g.advance(20_000); expect(g.st.hand!.phase).toBe("betting");
    g.advance(1500);
    expect(plain(g).slice(-1)).toEqual(["Dave checks"]);
  });
  it("bank use drains and refills bankLength/N per hand", () => {
    const { g, d } = two();
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    g.okAct(y, { type: "ATB" });
    g.advance(25_000);
    g.okAct(y, { type: C }); // used 5 s of the 10 s bank
    expect(g.st.players[y]!.bankMs).toBe(5000);
    g.step(); playOut(g, [[d, K]]); g.toResult(); g.until(() => g.st.hand!.number === 2);
    expect(g.st.players[y]!.bankMs).toBe(6000); // +1 s per hand dealt in (10 s / 10 hands)
  });
  it("pause freezes deadlines; unpause shifts them; resume shifts by downtime", () => {
    const { g, d } = two();
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    const dl = g.st.hand!.deadlineNoBank!;
    g.advance(5000);
    g.ok(y, { kind: "action", action: { type: "UP" } });
    expect(g.e.nextWakeAt(g.s)).toBeNull();
    expect(g.act(y, { type: C }).ok).toBe(false);
    g.advance(60_000);
    expect(g.st.hand!.phase).toBe("betting");
    g.ok(y, { kind: "action", action: { type: "UR" } });
    expect(g.st.hand!.deadlineNoBank).toBe(dl + 60_000);
    expect(plain(g).filter((l) => /paus/i.test(l))).toEqual([]); // no log line
    g.ok("system", { kind: "resume", downtimeMs: 7000 });
    expect(g.st.hand!.deadlineNoBank).toBe(dl + 67_000);
  });
  it("offline actor uses the bank automatically (U-T6)", () => {
    const { g, d } = two();
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    g.ok(y, { kind: "presence", connected: false });
    expect(g.frame(d).players[y]!.disconnectedSince).toBe(g.now);
    g.advance(30_000);
    expect(plain(g).slice(-1)).toEqual(["yash folds"]);
  });
});

describe("rebuy (08 d)", () => {
  it("busted player is asked, owner approves another stack, stack added before Player stacks line", () => {
    const g = new Game(y); const k = g.seat("Kim", 2, 100); cfgOf(g, { allowRebuy: true, autoDeal: false });
    g.stack(mkDeck([k, y], { [y]: ["As", "Ad"], [k]: ["2c", "7d"] }, ["Kd", "Js", "4h", "9c", "3s"]), 0);
    g.ok(y, { kind: "startGame" });
    playOut(g, [[y, R, 100], [k, C]]);
    g.toResult(); g.until(() => g.st.hand!.closed);
    expect(g.st.players[k]!.stack).toBe(0);
    g.ok(y, { kind: "action", action: { type: "NH" } });
    expect(plain(g).slice(-1)).toEqual(["Asking to busted players the rebuy decision."]);
    let f = g.frame(y);
    expect(f.turn.nextStep).toBe("NSARB"); expect(f.turn.rebuyPromptIds).toEqual([k]); expect(f.turn.rebuy!.deadlineAt).toBe(g.now + 20_000);
    expect(g.cmd(k, { kind: "requestRebuy", value: 0 })).toMatchObject({ ok: false, status: 422, message: "must be a value between 1 and 1.000.000" });
    g.ok(k, { kind: "requestRebuy", value: 1000 });
    expect(g.frame(y).turn.nextStep).toBe("FOAR");
    expect(plain(g).slice(-1)).toEqual(["The player Kim requested a rebuy of 1000."]);
    g.stack(mkDeck([k, y], { [y]: ["As", "Ad"], [k]: ["2c", "7d"] }, ["Kd", "Js", "4h", "9c", "3s"]), 1);
    g.ok(y, { kind: "resolveRebuy", playerID: k, approve: true, stack: 500 });
    const l = plain(g);
    expect(l.slice(-12).indexOf("The player Kim rebought. New stack 500.")).toBeGreaterThan(-1);
    expect(l.findIndex((x) => x.startsWith("Player stacks:") && x.includes("Kim (500)"))).toBeGreaterThan(l.indexOf("The player Kim rebought. New stack 500."));
    expect(g.st.hand!.number).toBe(2);
  });
  it("timeout/deny -> quits with stack 0", () => {
    const g = new Game(y); const k = g.seat("Kim", 2, 100); const m = g.seat("Max", 3, 1000); cfgOf(g, { allowRebuy: true, autoDeal: false });
    g.stack(mkDeck([k, m, y], { [y]: ["As", "Ad"], [k]: ["2c", "7d"], [m]: ["3c", "4d"] }, ["Kd", "Js", "4h", "9c", "8s"]), 0);
    g.ok(y, { kind: "startGame" });
    playOut(g, [[y, R, 100], [k, C], [m, F]]);
    g.toResult(); g.until(() => g.st.hand!.closed);
    g.ok(y, { kind: "action", action: { type: "NH" } });
    g.advance(20_000);
    expect(plain(g)).toContain("The player Kim quits the game with a stack of 0.");
    expect(g.st.hand!.number).toBe(2);
    expect(g.st.players[k]!.seat).toBeNull();
  });
});

describe("config queue", () => {
  it("waiting: immediate; running: queued, straddle/showdown apply at once, rest logged at next hand start", () => {
    const { g, d } = two();
    const r1 = cfgOf(g, { rabbitHunt: true });
    expect((r1 as { queued?: boolean }).queued).toBe(false);
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    g.clearFx();
    const r2 = cfgOf(g, { rabbitHunt: false, straddleAllowed: true, showdownTime: "fast", decisionLimitSec: 30 });
    expect((r2 as { queued?: boolean }).queued).toBe(true);
    expect(g.st.config.straddleAllowed).toBe(true); expect(g.st.config.showdownTime).toBe("fast"); expect(g.st.config.rabbitHunt).toBe(true);
    expect(g.e.currentOrNextConfig!(g.s)).toMatchObject({ queued: true, rabbitHunt: false, decisionLimitSec: 30 });
    expect(g.frame(y).table.configQueued).toBe(true);
    expect(plain(g)).toEqual(["Game Config Changes\n* Allow Straddle: off » on\n* Showdown Speed: Normal » Fast"]);
    g.clearFx();
    playOut(g, [[y, F]]); g.toResult(); g.until(() => g.st.hand!.number === 2);
    const i = plain(g).findIndex((l) => l.startsWith("Game Config Changes"));
    expect(plain(g)[i]).toBe("Game Config Changes\n* Rabbit Hunt: on » off\n* Decision Limit Time: 20s » 30s");
    expect(i).toBeLessThan(plain(g).findIndex((l) => l.startsWith("-- starting hand #2")));
    expect(g.st.config.rabbitHunt).toBe(false);
  });
  it("validation: 422 field errors; non-owner 403", () => {
    const { g, d } = two();
    expect(g.cmd(d, { kind: "updateGame", config: g.st.config })).toMatchObject({ ok: false, status: 403 });
    const bad = { ...g.st.config, decisionLimitSec: 0 };
    expect(g.cmd(y, { kind: "updateGame", config: bad })).toMatchObject({ ok: false, status: 422, errors: { decisionLimitSec: "invalid value" } });
  });
});

describe("rabbit hunt and showing cards", () => {
  it("fold-win before the flop: requester gets cards and own-log line only, window +3 s", () => {
    const { g, d } = two(); cfgOf(g, { rabbitHunt: true });
    g.stack(mkDeck([d, y], { [y]: ["As", "Ad"], [d]: ["Kh", "Kc"] }, ["Qd", "Js", "4h", "9c", "3s"]), 0); g.ok(y, { kind: "startGame" });
    playOut(g, [[y, R, 60], [d, F]]);
    g.toResult();
    let f = g.frame(d);
    expect(f.rabbit.enabled).toBe(true); expect(f.rabbit.cards).toBeNull(); expect(f.rabbit.hunters).toEqual([]);
    const at = g.st.hand!.nextStepAt!;
    g.clearFx();
    g.ok(d, { kind: "action", action: { type: "RUC" } });
    expect(g.fx.filter((x) => x.kind === "log")).toMatchObject([{ msg: "Undealt cards:  [Q♦, J♠, 4♥, 9♣, 3♠]", onlyFor: d }]);
    expect(g.st.hand!.nextStepAt).toBe(at + 3000);
    f = g.frame(d);
    expect(f.rabbit.cards).toEqual({ "1": ["Qd", "Js", "4h", "9c", "3s"] }); expect(f.cards[d]!.name1RH).toBe("pair (K)");
    expect(g.frame(y).rabbit.cards).toBeNull(); expect(g.frame(y).rabbit.hunters).toEqual([d]);
    expect(JSON.stringify(g.frame(y))).not.toContain('"Qd"');
  });
  it("after a flop fold only the missing cards, with 'Undealt cards: <board> [..]' format", () => {
    const { g, d } = two(); cfgOf(g, { rabbitHunt: true });
    g.stack(mkDeck([d, y], { [y]: ["As", "Ad"], [d]: ["Kh", "Kc"] }, ["Qd", "Js", "4h", "9c", "3s"]), 0); g.ok(y, { kind: "startGame" });
    playOut(g, [[y, C], [d, K], [d, R, 20], [y, F]]);
    g.toResult();
    g.clearFx(); g.ok(y, { kind: "action", action: { type: "RUC" } });
    expect(g.fx.filter((x) => x.kind === "log")).toMatchObject([{ msg: "Undealt cards: Q♦, J♠, 4♥ [9♣, 3♠]" }]);
  });
  it("SHOW_HAND after a fold-win logs and flips cards for everyone", () => {
    const { g, d } = two();
    g.stack(deck2(d), 0); g.ok(y, { kind: "startGame" });
    playOut(g, [[y, R, 60], [d, F]]);
    g.toResult();
    g.ok(y, { kind: "action", action: { type: "SHOW_HAND", cardToShow: "As" } });
    expect(plain(g).slice(-1)).toEqual(["yash shows a A♠."]);
    expect(g.frame(d).cards[y]!.cards).toEqual([{ value: "As", showing: true }, { value: null, showing: false }]);
    g.ok(y, { kind: "action", action: { type: "SHOW_HAND", cardToShow: "all" } });
    expect(g.frame(d).cards[y]!.cards.every((c) => c.showing)).toBe(true);
  });
});

describe("ledger", () => {
  it("net = buyOut + stack - buyIn, sessions and movements", () => {
    const { g, d } = two();
    g.ok(y, { kind: "updatePlayer", playerID: d, stackChange: 250, stackChangeMode: "ADD" });
    g.ok(y, { kind: "updatePlayer", playerID: d, stackChange: 50, stackChangeMode: "REMOVE" });
    const led = g.e.ledger(g.s);
    expect(led.playersInfos[d]).toMatchObject({ buyInSum: 1250, buyOutSum: 50, inGame: 1200, net: 0 });
    expect(g.e.ledgerSessions(g.s, d)[0]!.movements).toEqual([{ kind: "tookSeat", value: 1000 }, { kind: "addStack", value: 250 }, { kind: "removed", value: 50 }]);
    expect(led).toMatchObject({ buyInTotal: 2250, buyOutTotal: 50, inGameTotal: 2200, gameHasRake: false });
  });
});
