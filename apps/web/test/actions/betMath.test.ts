import { describe, expect, it } from "vitest";
import { clamp, convertedTag, inputModeFor, presetValue, sanitizeInput, stepBet, textToValue, valueToText } from "../../src/actions/betMath";
import { bigBlindFromText, computeBetPanel } from "../../src/actions/deriveBetPanel";

describe("input parsing (SPEC 6.3)", () => {
  it("int mode strips non-digits", () => {
    expect(sanitizeInput("1a2,3.4", "int")).toBe("1234");
    expect(textToValue("", "int", 20)).toBeNull();
    expect(textToValue("40", "int", 20)).toBe(40);
  });
  it("cents mode is decimal aware, 2 decimals", () => {
    expect(sanitizeInput("1.505", "cents")).toBe("1.50");
    expect(sanitizeInput("1,5", "cents")).toBe("1.5");
    expect(textToValue("1.50", "cents", 20)).toBe(150);
    expect(valueToText(150, "cents", 20)).toBe("1.50");
  });
  it("BB mode: bet = floor(bb * bigBlind)", () => {
    expect(textToValue("2.5", "bb", 20)).toBe(50);
    expect(textToValue("2.55", "bb", 20)).toBe(51);
    expect(valueToText(50, "bb", 20)).toBe("2.5");
    expect(valueToText(40, "bb", 20)).toBe("2");
  });
  it("mode selection and converted tag", () => {
    expect(inputModeFor({ centsMode: false, showAsBB: true })).toBe("bb");
    expect(inputModeFor({ centsMode: true, showAsBB: false })).toBe("cents");
    expect(convertedTag(40, "int", 20, false)).toBe("2BB");
    expect(convertedTag(250, "int", 20, false)).toBe("12.5BB");
    expect(convertedTag(50, "bb", 20, false)).toBe("50");
  });
  it("+/- step by one big blind, clamped", () => {
    expect(stepBet(40, 1, 20, 990)).toBe(60);
    expect(stepBet(10, -1, 20, 990)).toBe(0);
    expect(stepBet(980, 1, 20, 990)).toBe(990);
    expect(clamp(5, 1, 3)).toBe(3);
  });
});

describe("bet panel math (SPEC 6.3)", () => {
  // heads-up style: pot 30 collected earlier, other bets 20, highest 20, BB 20, stack 990, minRaise 40
  const p = computeBetPanel({ stack: 990, highestBet: 20, minRaise: 40, maxBet: null, pot: 30, otherBets: 20, bigBlind: 20, showAsBB: false });
  it("presets: Min Raise / H+P/2 / H+3P/4 / H+P / stack", () => {
    // P = pot + others + H = 70
    expect(p.pot).toBe(70);
    expect(p.presets).toEqual({ minRaise: 40, half: 55, threeQuarter: 72, pot: 90, allIn: 990 });
  });
  it("validity", () => {
    expect(p.isValid(40)).toBe(true);
    expect(p.isValid(990)).toBe(true);
    expect(p.isValid(39)).toBe(false);
    expect(p.isValid(20)).toBe(true); // H is a precise value (call)
    expect(p.isValid(991)).toBe(false);
  });
  it("labels", () => {
    expect(p.submitLabel(40)).toBe("Raise");
    expect(p.submitLabel(20)).toBe("Call");
    const open = computeBetPanel({ stack: 990, highestBet: 0, minRaise: 20, maxBet: null, pot: 30, otherBets: 0, bigBlind: 20, showAsBB: false });
    expect(open.submitLabel(60)).toBe("Bet");
    expect(open.initialValue).toBe(20);
  });
  it("short stack: stack always valid and caps min raise", () => {
    const s = computeBetPanel({ stack: 30, highestBet: 20, minRaise: 40, maxBet: null, pot: 30, otherBets: 20, bigBlind: 20, showAsBB: false });
    expect(s.isValid(30)).toBe(true);
    expect(s.presets.minRaise).toBe(30);
    expect(presetValue(s.presets, "pot", s.maxAllowed)).toBe(30);
  });
  it("effective cap maxBet", () => {
    const s = computeBetPanel({ stack: 990, highestBet: 20, minRaise: 40, maxBet: 200, pot: 30, otherBets: 20, bigBlind: 20, showAsBB: false });
    expect(s.maxAllowed).toBe(200);
    expect(s.isValid(201)).toBe(false);
    expect(s.isValid(200)).toBe(true);
  });
  it("parses blinds text", () => {
    expect(bigBlindFromText("10 / 20", false)).toBe(20);
    expect(bigBlindFromText("1,000 / 2,000", false)).toBe(2000);
    expect(bigBlindFromText("0.10 / 0.20", true)).toBe(20);
  });
});
