import "@fontsource/mulish/400.css";
import "@fontsource/mulish/700.css";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { OptionsBadge, OptionsPopover, ConfigScreen, SitPopover, QuickAcceptHost, LogButton, ChatDock, openConfig, openLog, setMenusApi, toggleOptions } from "../../../src/menus";
import "../../../src/menus/menus.css";
import { harness, touch } from "./stubDeps";
import { BOB, CAROL, DAVE, LEDGER, LOG, SESSIONS, makeFrame } from "./mockData";
import { setMenuState } from "../../../src/menus/store";

const q = new URLSearchParams(location.search);
const portrait = q.get("o") === "portrait";
const view = q.get("view") ?? "options";
const h = harness();
h.orientation = portrait ? "portrait" : "landscape";
h.tableStatus = q.get("running") ? "inProgress" : "waiting";
h.frame = makeFrame({ you: q.get("as") === "guest" ? BOB : undefined, status: h.tableStatus, spectatorMode: !!q.get("spec") });
setMenusApi({
  loadConfigs: async () => ({ ...h.frame.table.config, queued: !!q.get("queued") }),
  loadLog: async (hand, after) => (hand === 0 ? [] : LOG.filter((e) => after == null || e.createdAt > after)),
  loadLedger: async () => LEDGER,
  loadLedgerSessions: async () => SESSIONS,
  loadPlayerEdit: async () => { throw new Error("unused"); },
  ledgerCsvUrl: () => "/ledger.csv",
  logCsvUrl: () => "/log.csv"
});
if (q.get("quickrequest")) h.quick = [{ playerId: DAVE, name: "PhoneP", stack: 1000, seat: 6 }];
if (view === "chat") {
  const t = Date.now();
  h.chat = [
    { at: t - 90000, playerID: BOB, playerName: "Bob", message: "nice hand" },
    { at: t - 60000, playerID: CAROL, playerName: "Carol", message: "gg, one more orbit then I leave" },
    { at: t - 30000, playerID: h.frame.you!.id, playerName: "Yash", message: "deal" }
  ];
}

function App() {
  const [, force] = useState(0);
  useEffect(() => {
    const H = 810;
    const apply = () => {
      const [w, hh] = portrait ? [390, 702] : [1440, 810];
      document.documentElement.style.fontSize = `${0.032 * hh}px`;
      document.documentElement.className = portrait ? "portrait" : "landscape";
      void w; void H;
    };
    apply();
    if (view === "config-game") openConfig("game");
    if (view === "players") openConfig("players");
    if (view === "edit") { openConfig("players"); setMenuState({ editPlayerId: BOB }); }
    if (view === "edit-pending") { openConfig("players"); setMenuState({ editPlayerId: DAVE }); }
    if (view === "prefs") openConfig("preferences");
    if (view === "log") openLog("log");
    if (view === "ledger") openLog("ledger");
    if (view === "options") setMenuState({ optionsOpen: true });
    if (view === "chat" && portrait && q.get("sheet")) setMenuState({ chatOpen: true });
    if (view === "chat" && !portrait && q.get("compose")) setMenuState({ composeOpen: true });
    force(1);
    touch();
  }, []);
  const [w, hh] = portrait ? [390, 702] : [1440, 810];
  return (
    <div id="main-container" style={{ position: "relative", width: w, height: hh, margin: "0 auto", background: "#1d4a57", overflow: "hidden", fontSize: "1rem" }}>
      <div id="canvas" style={{ position: "absolute", inset: 0 }}>
        <div className="top-buttons" style={{ position: "absolute", left: ".3rem", top: ".3rem" }}>
          <button className="top-buttons-button options" style={{ position: "relative", width: "2.6rem", height: "2.6rem" }} onClick={toggleOptions}>
            OPT<OptionsBadge />
          </button>
          <OptionsPopover />
        </div>
        {view === "sit" ? (
          <div style={{ position: "absolute", left: portrait ? "6rem" : "30rem", top: portrait ? "8rem" : "10rem", width: "6rem", height: "3rem" }}>
            <SitPopover seatNo={3} position={portrait ? 3 : 1} onClose={() => undefined} />
          </div>
        ) : null}
        <ConfigScreen />
        <ChatDock><LogButton /></ChatDock>
        <QuickAcceptHost />
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
