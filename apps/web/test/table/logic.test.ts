import { describe, expect, it } from "vitest";
import { nameShrinkClass, rabbitBarLeftRem, rabbitBarWidthRem, timerSegments, truncateBubble, withCountdown } from "../../src/table/logic";

describe("table logic", () => {
  it("name shrink thresholds (SPEC 4.5)", () => {
    expect(nameShrinkClass(0)).toBe("");
    expect(nameShrinkClass(1)).toBe("shrink-1");
    expect(nameShrinkClass(10)).toBe("shrink-1");
    expect(nameShrinkClass(11)).toBe("shrink-2");
    expect(nameShrinkClass(31)).toBe("shrink-3");
  });
  it("bubble truncation 30 chars + ellipsis", () => {
    expect(truncateBubble("a".repeat(30))).toBe("a".repeat(30));
    expect(truncateBubble("a".repeat(31))).toBe("a".repeat(30) + "…");
  });
  it("timer split 20 s + 1 s bank = 95.2 / 4.76 %, red above 70 %", () => {
    const t = { actionStartedAt: 0, deadlineNoBank: 20000, deadlineWithBank: 21000 };
    const s0 = timerSegments(t, 0);
    expect(s0.bankPct).toBeCloseTo(4.76, 1);
    expect(s0.normalPct).toBeCloseTo(95.24, 1);
    expect(timerSegments(t, 14100).normalRed).toBe(true);
    expect(timerSegments(t, 13000).normalRed).toBe(false);
    const s20 = timerSegments(t, 20500);
    expect(s20.normalPct).toBe(0);
    expect(s20.bankPct).toBeCloseTo(2.38, 1);
    expect(timerSegments(t, 99999).bankPct).toBe(0);
  });
  it("rabbit bar width formula 4.61n + .29(n-1) + .5", () => {
    expect(rabbitBarWidthRem(5)).toBeCloseTo(24.71, 2);
    expect(rabbitBarLeftRem(0)).toBeCloseTo(-0.25, 2);
    expect(rabbitBarLeftRem(3)).toBeCloseTo(14.45, 2);
  });
  it("countdown text", () => {
    expect(withCountdown("Waiting for run it twice decisions (9s)", 4)).toBe("Waiting for run it twice decisions (4s)");
    expect(withCountdown("x (3 seconds)", -2)).toBe("x (0 seconds)");
  });
});
