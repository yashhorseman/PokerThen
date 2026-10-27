import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COPY, FIELD_ERRORS, fillCopy, chatBubbleMs, TABLE_BUBBLE_MS, truncateBubble } from "../src/index.js";

const spec = readFileSync(new URL("../../../docs/SPEC.md", import.meta.url), "utf8");
const leaves = (o: unknown, path = ""): Array<[string, string]> =>
  typeof o === "string" ? [[path, o]] : Object.entries(o as object).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));

describe("verbatim copy (SPEC)", () => {
  it.each(leaves(COPY))("%s appears verbatim in SPEC.md", (_p, text) => {
    expect(spec.includes(text)).toBe(true);
  });
  it("FIELD_ERRORS match SPEC 2.3", () => {
    for (const v of Object.values(FIELD_ERRORS)) expect(spec.includes(v)).toBe(true);
  });
  it("helpers", () => {
    expect(fillCopy(COPY.actions.call, { n: 20 })).toBe("Call 20");
    expect(chatBubbleMs("hello there friend")).toBe(3200);
    expect(TABLE_BUBBLE_MS).toBe(7200);
    expect(truncateBubble("x".repeat(31))).toBe("x".repeat(30) + "…");
  });
});
