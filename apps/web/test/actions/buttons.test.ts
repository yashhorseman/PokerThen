import { describe, expect, it } from "vitest";
import { buildActionButtons, clickEffect, timeBankLabel } from "../../src/actions/buttons";
import { scenario } from "./vmBuilders";

const bar = (n: Parameters<typeof scenario>[0]) => scenario(n).action;
const state = (n: Parameters<typeof scenario>[0], locked = false) =>
  buildActionButtons(bar(n), locked).map((b) => `${b.label}:${b.enabled ? "on" : "off"}${b.highlighted ? "*" : ""}`);

describe("action bar slots (SPEC 6.1) - always 4 slots in order Call, Raise, Check, Fold", () => {
  it.each([
    ["turn-facing-bet", ["Call 10:on", "Raise:on", "Check:off", "Fold:on"]],
    ["turn-free-check", ["Bet 20:on", "Bet:on", "Check:on", "Fold:on"]],
    ["offturn-callpre", ["Call 10:on", "Raise:off", "Check:off", "Fold:on"]],
    ["offturn-checkorfold", ["Call:off", "Bet:off", "Check:on", "Fold:on"]],
    ["allin-call", ["All In 990:on", "Raise:off", "Check:off", "Fold:on"]]
  ] as const)("%s", (n, expected) => {
    expect(state(n)).toEqual(expected);
  });
  it("lock disables every button for 750 ms", () => {
    expect(state("turn-facing-bet", true).every((s) => s.includes(":off"))).toBe(true);
  });
  it("colours: fold red, call/check/raise green", () => {
    const c = buildActionButtons(bar("turn-facing-bet"), false).map((b) => b.color);
    expect(c).toEqual(["green", "green", "green", "red"]);
  });
});

describe("click effects (SPEC 6.2)", () => {
  const opts = { locked: false, skipFoldConfirm: false };
  it("your turn: send at once", () => {
    expect(clickEffect(bar("turn-facing-bet"), "call", opts)).toEqual({ kind: "send", action: "call" });
    expect(clickEffect(bar("turn-facing-bet"), "fold", opts)).toEqual({ kind: "send", action: "fold" });
    expect(clickEffect(bar("turn-free-check"), "check", opts)).toEqual({ kind: "send", action: "check" });
  });
  it("raise opens the panel on your turn only", () => {
    expect(clickEffect(bar("turn-facing-bet"), "raise", opts)).toEqual({ kind: "openPanel" });
    expect(clickEffect(bar("offturn-callpre"), "raise", opts)).toEqual({ kind: "ignore" });
  });
  it("unnecessary fold asks for confirmation unless skipped this session", () => {
    expect(clickEffect(bar("turn-free-check"), "fold", opts)).toEqual({ kind: "confirmFold" });
    expect(clickEffect(bar("turn-free-check"), "fold", { ...opts, skipFoldConfirm: true })).toEqual({ kind: "send", action: "fold" });
  });
  it("off turn: queue / toggle off / disabled ignored", () => {
    expect(clickEffect(bar("offturn-callpre"), "call", opts)).toEqual({ kind: "queue", intent: "call" });
    expect(clickEffect(bar("offturn-callpre"), "check", opts)).toEqual({ kind: "ignore" });
    const hl = { ...bar("offturn-callpre"), call: { ...bar("offturn-callpre").call!, highlighted: true } };
    expect(clickEffect(hl, "call", opts)).toEqual({ kind: "clearIntent" });
  });
  it("check-or-fold toggles", () => {
    expect(clickEffect(bar("offturn-checkorfold"), "checkOrFold", opts)).toEqual({ kind: "queue", intent: "checkOrFold" });
    const hl = { ...bar("offturn-checkorfold"), checkOrFold: { visible: true, highlighted: true } };
    expect(clickEffect(hl, "checkOrFold", opts)).toEqual({ kind: "clearIntent" });
    expect(clickEffect(bar("turn-facing-bet"), "checkOrFold", opts)).toEqual({ kind: "ignore" });
  });
  it("locked ignores everything", () => {
    expect(clickEffect(bar("turn-facing-bet"), "call", { ...opts, locked: true })).toEqual({ kind: "ignore" });
  });
});

describe("time bank label", () => {
  it("labels", () => {
    expect(timeBankLabel({ visible: true, activated: false, secondsLeft: 10 })).toBe("Activate Extra Time (10s)");
    expect(timeBankLabel({ visible: true, activated: true, secondsLeft: 10 })).toBe("Extra Time Activated");
  });
});
