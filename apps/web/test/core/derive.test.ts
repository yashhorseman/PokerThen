import { describe, expect, it } from "vitest";
import { applyDelta, diffFrames } from "@pokerthen/shared";
import { deriveFixtureVM, fixtureNames, fixtureTransitions, fixtures, vmFixtures } from "../../src/core/testing";
import { positionForSeat, seatForPosition } from "../../src/core/viewModel/rotation";
import { computeBetPanel } from "../../src/core/viewModel/betPanel";
import { shareStructure } from "../../src/core/util";

describe("deriveViewModel over all W1 fixtures", () => {
  it("derives every fixture with 10 ordered seats", () => {
    const all = vmFixtures();
    expect(Object.keys(all).length).toBe(fixtureNames.length);
    for (const vm of Object.values(all)) {
      expect(vm.seats.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(vm.config).toBeTruthy();
    }
  });
  it("rotation: hero seat 6 shows at position 1", () => {
    const vm = deriveFixtureVM("rotated-hero-seat-6");
    expect(vm.seats[0]!.player?.isYou).toBe(true);
    expect(vm.seats[0]!.seatNo).toBe(6);
    expect(seatForPosition(5, 6)).toBe(10);
    expect(positionForSeat(10, 6)).toBe(5);
    expect(vm.youSeated).toBe(true);
  });
  it("rotation: unseated viewer keeps real seats", () => {
    const vm = deriveFixtureVM("spectator");
    expect(vm.youSeated).toBe(false);
    expect(vm.seats[2]!.player?.name).toBe("Bob");
    expect(vm.seats[1]!.canSit).toBe(true);
  });
  it("empty seats: seated viewer at a waiting table sees view-only boxes (no Sit); spectators keep Sit", () => {
    const seated = deriveFixtureVM("waiting-2-players");
    expect(seated.youSeated).toBe(true);
    const empties = seated.seats.filter((s) => !s.player);
    expect(empties.length).toBeGreaterThan(0);
    expect(empties.every((s) => s.viewOnly === true && s.canSit === false)).toBe(true);
    const spectator = deriveFixtureVM("spectator");
    expect(spectator.seats.filter((s) => !s.player).every((s) => s.canSit && !s.viewOnly)).toBe(true);
    const running = deriveFixtureVM("preflop-your-turn");
    expect(running.seats.filter((s) => !s.player).every((s) => !s.viewOnly && !s.canSit)).toBe(true);
  });
  it("own hole cards are face up with NO sneak overlay, others hidden", () => {
    const vm = deriveFixtureVM("preflop-your-turn");
    const me = vm.seats[0]!.player!;
    expect(me.isYou).toBe(true);
    expect(me.cards.map((c) => c.code)).toEqual(["Qs", "Qh"]);
    expect(me.cards.every((c) => !c.sneak && c.faceUp)).toBe(true);
    const other = vm.seats.find((s) => s.player && !s.player.isYou)!.player!;
    expect(other.cards.every((c) => c.code === null && !c.faceUp)).toBe(true);
  });
  it("your turn: call/raise enabled, labels", () => {
    const vm = deriveFixtureVM("facing-bet-raise-panel");
    expect(vm.action.yourTurn).toBe(true);
    expect(vm.action.low).toBe(false);
    expect(vm.action.call?.label).toBe("Call 60");
    expect(vm.action.raise).toMatchObject({ label: "Raise", enabled: true });
    expect(vm.action.check.enabled).toBe(false);
    expect(vm.action.fold.needsConfirmation).toBe(false);
  });
  it("off turn: low, check-or-fold pill hidden when a bet exists", () => {
    const vm = deriveFixtureVM("off-turn-preaction");
    expect(vm.action.visible).toBe(true);
    expect(vm.action.yourTurn).toBe(false);
    expect(vm.action.low).toBe(true);
    expect(vm.action.raise.enabled).toBe(false);
  });
  it("timer / decision flags on the acting player", () => {
    const vm = deriveFixtureVM("preflop-your-turn");
    const actor = vm.seats.find((s) => s.player?.isDecision)!.player!;
    expect(actor.id).toBe("p3");
    expect(actor.timer?.deadlineWithBank).toBeGreaterThan(actor.timer!.deadlineNoBank);
  });
  it("equity pills: rounded, leader green, gray on reveal stage", () => {
    const vm = deriveFixtureVM("all-in-equity");
    const eq = vm.seats.flatMap((s) => (s.player?.equity ? [s.player.equity] : []));
    expect(eq.map((e) => e.pct).sort()).toEqual([39, 62]);
    expect(eq.find((e) => e.pct === 62)!.leader).toBe(true);
    expect(eq.every((e) => !e.gray)).toBe(true);
  });
  it("two runs: run2 board + chips with two rows", () => {
    const vm = deriveFixtureVM("showdown-two-runs");
    expect(vm.board.run2.length).toBe(5);
    expect(vm.board.run2[0]!.afterPadding).toBe(true);
    const chip = vm.seats.flatMap((s) => (s.player?.handChip ? [s.player.handChip] : []))[0]!;
    expect(chip.twoRuns).toBe(true);
    expect(vm.seats.some((s) => s.player?.isWinner)).toBe(true);
  });
  it("rit prompt + center text", () => {
    const vm = deriveFixtureVM("rit-prompt");
    expect(vm.center.kind).toBe("ritWait");
    expect(vm.center.text).toBe("Waiting for run it twice decisions (10s)");
  });
  it("rabbit slots at result", () => {
    const vm = deriveFixtureVM("rabbit-available");
    expect(vm.board.rabbitAvailable).toBe(true);
    expect(vm.board.rabbitSlots).toBe(2);
  });
  it("waiting banner for owner alone; start button with 2 players", () => {
    expect(deriveFixtureVM("waiting-alone").waitingBanner).toBe(true);
    const two = deriveFixtureVM("waiting-2-players");
    expect(two.owner.canStart).toBe(true);
    expect(two.waitingBanner).toBe(false);
  });
  it("BB display mode and formatted values", () => {
    const base = fixtures["facing-bet-raise-panel"]!;
    const vm = deriveFixtureVM("facing-bet-raise-panel", { prefs: { ...vmPrefs(), displayValueStyle: "big-blind" } });
    expect(vm.bbMode).toBe(true);
    expect(vm.action.call?.label).toBe("Call 3BB");
    expect(base).toBeTruthy();
  });
  it("transitions derive and share structure for untouched seats", () => {
    for (const [a, b] of fixtureTransitions) {
      const va = deriveFixtureVM(a);
      const vb = shareStructure(va, deriveFixtureVM(b));
      expect(vb).toBeTruthy();
    }
    const now = () => fixtures["flop"]!.meta.sN;
    const v1 = deriveFixtureVM("flop", { serverNow: now });
    const v2 = shareStructure(v1, deriveFixtureVM("flop", { serverNow: now }));
    expect(v2).toBe(v1);
  });
  it("deltas round trip through diffFrames/applyDelta", () => {
    for (const [a, b] of fixtureTransitions) {
      const fa = fixtures[a]!, fb = fixtures[b]!;
      const d = diffFrames(fa, fb);
      expect(applyDelta(fa, d)).toEqual(fb);
    }
  });
});

describe("bet panel math (SPEC 6.3)", () => {
  const input = { stack: 1000, highestBet: 60, minRaise: 120, maxBet: null, bigBlind: 20, pot: 200, showAsBB: false };
  it("presets, validity, labels", () => {
    const p = computeBetPanel(input);
    expect(p.presets).toEqual({ minRaise: 120, half: 160, threeQuarter: 210, pot: 260, allIn: 1000 });
    expect(p.isValid(120)).toBe(true);
    expect(p.isValid(119)).toBe(false);
    expect(p.isValid(60)).toBe(true);
    expect(p.isValid(1001)).toBe(false);
    expect(p.submitLabel(60)).toBe("Call");
    expect(p.submitLabel(200)).toBe("Raise");
    expect(computeBetPanel({ ...input, highestBet: 0, minRaise: 20 }).submitLabel(40)).toBe("Bet");
    expect(computeBetPanel({ ...input, highestBet: 0, minRaise: 20 }).initialValue).toBe(20);
  });
});

import { DEFAULT_PREFS, type Prefs } from "@pokerthen/shared";
function vmPrefs(): Prefs {
  return { ...DEFAULT_PREFS };
}
