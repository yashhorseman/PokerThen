import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FUNCS, S } from "../../src/menus/strings";

const root = new URL("../../../../", import.meta.url).pathname;
const spec = readFileSync(root + "docs/SPEC.md", "utf8");
const r04 = readFileSync(root + "research/04-settings-and-roles.md", "utf8");
const hay = spec + "\n" + r04;
// strings that are PokerThen adaptations / structural (not copied verbatim from the catalogue)
const EXEMPT = new Set(["ok", "close", "save", "apply", "edit", "chat", "mute", "unmute", "stack", "net", "details", "hideDetails", "loading", "tablePlayer", "players", "game", "reject", "accept", "ignore", "playerStack", "stackPlaceholder", "valuePlaceholder", "currentLabel"]);

describe("strings are verbatim in SPEC/research", () => {
  for (const [k, v] of Object.entries(S)) {
    it(`S.${k}`, () => {
      if (EXEMPT.has(k)) return;
      expect(hay.toLowerCase()).toContain(v.toLowerCase());
    });
  }
  it("templates", () => {
    expect(FUNCS.wantsToJoin("Bob")).toBe('The player "Bob" wants to join the game!');
    expect(FUNCS.requestedIngress(6)).toBe("Requested Ingress (Intended Seat Number: 6)");
    expect(FUNCS.editHeader("Bob", "abc")).toBe("Bob (ID: abc)");
    expect(FUNCS.sessionLabel(3, null)).toBe("hand #3 until #now");
    expect(FUNCS.sessionLabel(null, null)).toBe("Not Started Session");
    expect(FUNCS.chatN(0)).toBe("Chat");
    expect(FUNCS.chatN(2)).toBe("Chat (2)");
    expect(FUNCS.playerIdTitle("x")).toBe("Player ID: x");
  });
});
