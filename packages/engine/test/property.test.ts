import { describe, expect, it } from "vitest";
import { playRandom } from "./randomPlay.js";

describe("random hands", () => {
  it("conserves chips, unique cards, never deadlocks (many seeds)", () => {
    let hands = 0;
    for (let seed = 1; seed <= 60; seed++) { const r = playRandom(seed, 120); hands += r.done; expect(r.done).toBeGreaterThan(10); }
    expect(hands).toBeGreaterThan(3000);
  }, 120_000);
});
