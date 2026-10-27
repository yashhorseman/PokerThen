import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TableViewModel } from "@pokerthen/shared";
import { scenario, type ScenarioName } from "./vmBuilders";

const h = vi.hoisted(() => ({ vm: null as unknown, keys: [] as string[], confirm: vi.fn() }));
vi.mock("../../src/actions/deps", () => ({
  useTableVM: () => h.vm,
  useTableActions: () => new Proxy({}, { get: () => () => undefined }),
  usePrefs: () => [{ autoActivateTimeBank: false }, {}],
  useServerNow: () => () => Date.now(),
  useOrientation: () => "portrait",
  useBetPanelVM: () => null,
  useHotkey: (k: string) => void h.keys.push(k),
  showConfirm: h.confirm
}));
import { ActionArea } from "../../src/actions/ActionArea";

const html = (n: ScenarioName) => {
  h.vm = scenario(n) as TableViewModel;
  return renderToStaticMarkup(<ActionArea />);
};
beforeEach(() => void (h.keys = []));

describe("ActionArea markup", () => {
  it("your turn: labels, signal, no low class", () => {
    const m = html("turn-facing-bet");
    expect(m).toContain("Call 10");
    expect(m).toContain("Your Turn");
    expect(m).not.toContain(" low");
    expect(m).toMatch(/<button[^>]*action-button[^>]*check[^>]*disabled/);
  });
  it("off turn: low container, check-or-fold pill, no signal", () => {
    const m = html("offturn-checkorfold");
    expect(m).toContain("game-decisions-ctn low");
    expect(m).toContain("Check or Fold");
    expect(m).not.toContain("Your Turn");
  });
  it("time bank chip when activated", () => {
    expect(html("turn-timebank")).toContain("Extra Time Activated");
  });
  it("RIT prompt", () => {
    const m = html("rit");
    expect(m).toContain("Run it Twice?");
    expect(m).toContain("rit-yes");
    expect(m).toContain("rit-no");
  });
  it("show hand buttons with card text", () => {
    const m = html("showhand");
    expect(m).toContain("Show All Cards");
    expect(m).toContain("4♥");
    expect(m).toContain("4♠");
  });
  it("I'm back and cancel ingress", () => {
    expect(html("away")).toContain("iamback");
    expect(html("away")).not.toContain("Call");
    expect(html("cancel-ingress")).toContain("Cancel Game Ingress Request");
    const both = html("result-away-showhand");
    expect(both).toContain("iamback");
    expect(both).toContain("7♣");
  });
  it("renders nothing when the bar is hidden", () => {
    h.vm = { ...scenario("turn-facing-bet"), action: { ...scenario("turn-facing-bet").action, visible: false, yourTurn: false } };
    expect(renderToStaticMarkup(<ActionArea />)).toBe("");
  });
  it("registers the W6 hotkeys k c r f i t s 1 2", () => {
    html("turn-facing-bet");
    expect(h.keys.sort()).toEqual(["1", "2", "c", "f", "i", "k", "r", "s", "t"].sort());
  });
});
