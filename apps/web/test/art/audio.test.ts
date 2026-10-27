import { describe, expect, it } from "vitest";
import { SOUND_NAMES } from "@pokerthen/shared";
import { MAX_SECONDS, PokerThenAudio, renderSound } from "../../src/audio";

const SR = 44100;
describe("synthesised sounds", () => {
  for (const name of SOUND_NAMES) {
    it(`${name}: non-silent (except dumb-sound), within length limit, no clipping`, () => {
      const d = renderSound(name, SR);
      const secs = d.length / SR;
      expect(secs).toBeLessThanOrEqual(MAX_SECONDS[name]);
      let peak = 0, sum = 0;
      for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; expect(Number.isFinite(v)).toBe(true); }
      const rms = Math.sqrt(sum / d.length);
      if (name === "dumb-sound") expect(peak).toBe(0);
      else {
        expect(rms).toBeGreaterThan(0.01);
        expect(peak).toBeGreaterThan(0.5);
        expect(peak).toBeLessThan(0.98);
      }
    });
  }
  it("winner is the only sound allowed to exceed 600 ms", () => {
    expect(renderSound("winner", SR).length / SR).toBeGreaterThan(0.6);
    expect(renderSound("winner", SR).length / SR).toBeLessThanOrEqual(1.5);
    for (const n of SOUND_NAMES) if (n !== "winner") expect(renderSound(n, SR).length / SR).toBeLessThanOrEqual(0.6);
  });
  it("is deterministic", () => {
    expect(renderSound("chips", SR)).toEqual(renderSound("chips", SR));
  });
});

describe("AudioApi rules", () => {
  it("muted until unlocked, respects volume off, secondary class and chat beep", () => {
    const a = new PokerThenAudio();
    a.play("beep");
    expect(a.log).toEqual([]); // not unlocked
    expect(a.wouldPlay("beep")).toBe(true);
    a.setVolume("off");
    expect(a.wouldPlay("beep")).toBe(false);
    a.setVolume("low");
    a.setSecondaryDisabled(true);
    for (const n of ["two-taps", "chips", "fold", "card-place"] as const) expect(a.wouldPlay(n)).toBe(false);
    expect(a.wouldPlay("winner")).toBe(true);
    a.setChatBeepDisabled(true);
    expect(a.wouldPlay("chat-beep")).toBe(false);
    expect(a.wouldPlay("dumb-sound")).toBe(false);
  });
});
