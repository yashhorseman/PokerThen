import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_PREFS } from "@pokerthen/shared";
import { makeFrame, OWNER, BOB } from "./harness/mockData";

const state = vi.hoisted(() => ({ owner: true, orientation: "landscape", pending: 1 }));
vi.mock("../../src/menus/deps", async () => {
  const f = (await import("./harness/mockData")).makeFrame;
  return {
    useFrame: () => f({ you: state.owner ? undefined : "bobIdBBBBB" }),
    useTableVM: () => ({ orientation: state.orientation, gameId: "g", youId: state.owner ? "ownerIdAAA" : "bobIdBBBBB", tableStatus: "waiting", handNumber: 4, spectatorMode: false, config: f().table.config, owner: { isOwner: state.owner, pendingRequests: state.pending, paused: false, quickAcceptQueue: [] } }),
    useTableActions: () => ({}),
    useChatVM: () => ({ messages: [], unread: 0, mutedIds: [], youCanChat: true, recording: true, names: {} }),
    usePrefs: () => [DEFAULT_PREFS, { set: () => undefined }],
    useOrientation: () => state.orientation,
    useHotkey: () => undefined,
    useServerNow: () => () => 0,
    useModalLock: () => undefined,
    useTableData: () => ({}),
    Icon: () => null
  };
});

import { OptionsBadge, OptionsPopover } from "../../src/menus/OptionsPopover";
import { setMenuState } from "../../src/menus/store";
import { PlayersList } from "../../src/menus/PlayersList";
import { EditPlayer } from "../../src/menus/EditPlayer";
import { Preferences } from "../../src/menus/Preferences";
import { SitPopover } from "../../src/menus/SitPopover";
import { ChatDock } from "../../src/menus/ChatDock";

describe("render (SSR)", () => {
  it("options popover: items in order, owner sees Players with count", () => {
    setMenuState({ optionsOpen: true });
    const h = renderToStaticMarkup(<OptionsPopover />);
    const order = ["Home", "Game Configurations", "Players", "Preferences"].map((s) => h.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(h).toContain("pt-bubble");
    expect(renderToStaticMarkup(<OptionsBadge />)).toContain(">1<");
    state.owner = false;
    expect(renderToStaticMarkup(<OptionsPopover />)).not.toContain(">Players");
    state.owner = true;
    setMenuState({ optionsOpen: false });
  });
  it("players list: pending first with Approve/Deny, others Edit", () => {
    const h = renderToStaticMarkup(<PlayersList />);
    expect(h.indexOf("PhoneP")).toBeLessThan(h.indexOf("Yash"));
    expect(h).toContain("Requested Ingress (Intended Seat Number: 6)");
    expect(h).toContain(">Approve<");
    expect(h).toContain(">Deny<");
    expect(h).toContain("Playing with 4000 stack");
    expect(h).toContain("Allowed to be Spectator");
    expect(h).toContain("ID: bobIdBBBBB");
  });
  it("edit player: owner buttons", () => {
    const h = renderToStaticMarkup(<EditPlayer playerId={BOB} />);
    expect(h).toContain("Bob (ID: bobIdBBBBB)");
    for (const s of ["PLAYER STACK", "CURRENT 4000", "Update Player", "Remove Player", "Transfer Game Ownership", "Put on Away Mode"]) expect(h).toContain(s);
    expect(h).not.toContain("Spectator Mode"); // table spectator mode off
    const self = renderToStaticMarkup(<EditPlayer playerId={OWNER} />);
    expect(self).not.toContain("Remove Player");
    expect(self).not.toContain("Transfer Game Ownership");
    const pend = renderToStaticMarkup(<EditPlayer playerId="daveIdDDDD" />);
    expect(pend).toContain("Approve Player");
    expect(pend).toContain("Player&#x27;s Stack");
  });
  it("preferences: kept rows only, in order", () => {
    const h = renderToStaticMarkup(<Preferences />);
    const labels = ["Your User ID: ownerIdAAA", "Deck Style", "Auto Straddle 2 Big Blinds when UTG?", "Hide the wins/re-entries count badges?", "Values Display Style", "Hide Mood Emoji", "Disable Secondary Sound Effects?", "Disable New Chat Message Beep?", "Run it Twice?", "Auto activate your extra time?", "Hide Hand Review Notification?", "Show Quick Accept player warning?"];
    const idx = labels.map((l) => h.indexOf(l.replace("'", "&#x27;")));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(h).not.toContain("Gestures Visibility");
    expect(h).toContain("Ask each Time");
  });
  it("sit popover fields, labels and maxlength", () => {
    const h = renderToStaticMarkup(<SitPopover seatNo={3} position={3} onClose={() => undefined} />);
    expect(h).toContain("Your Nickname");
    expect(h).toContain('maxLength="14"');
    expect(h).toContain("Your Stack"); // owner variant
    expect(h).toContain("Take the Seat");
    expect(h).toContain("Sit with Away set");
    expect(h).toContain('pattern="[0-9]*"');
    expect(h).not.toContain("Allow unseated players");
    state.owner = false;
    const g = renderToStaticMarkup(<SitPopover seatNo={3} position={3} onClose={() => undefined} />);
    expect(g).toContain("Request the Seat");
    expect(g).toContain("Intended Stack");
    state.owner = true;
  });
  it("chat dock desktop blank state / phone button", () => {
    const d = renderToStaticMarkup(<ChatDock />);
    expect(d).toContain("It&#x27;s a bit quiet here.");
    expect(d).toContain("Click on the balloon and send a Message!");
    state.orientation = "portrait";
    const p = renderToStaticMarkup(<ChatDock />);
    expect(p).toContain(">Chat<");
    state.orientation = "landscape";
  });
});
