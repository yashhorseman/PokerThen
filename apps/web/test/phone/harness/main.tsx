import "@fontsource/mulish/400.css";
import "@fontsource/mulish/700.css";
import "@fontsource/mulish/900.css";
import "@w6src/art/tokens.css";
import "@w6src/core/ui/ui.css";
import "./base.css";
import "@w6src/table/table.css";
import "@w6src/actions/actions.css";
import "@w6src/phone/portrait.css";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { ActionArea } from "../../../src/actions";
import { Table } from "../../../src/table";
import { setVM, store, useTableVM } from "./mockHooks";
import { scenario, type ScenarioName } from "../../actions/vmBuilders";

const q = new URLSearchParams(location.search);
const orient = (q.get("o") ?? "portrait") as "portrait" | "landscape";
document.documentElement.className = orient;
const w = window as unknown as { __patch: (fn: (v: any) => any) => void; __setScenario: (n: ScenarioName) => void; __ready?: boolean };
w.__setScenario = (n) => setVM({ ...scenario(n), orientation: orient });
w.__patch = (fn: (v: any) => any) => setVM(fn(store.vm));
w.__setScenario((q.get("s") ?? "turn-facing-bet") as ScenarioName);

/** recompute rem on every canvas resize (SPEC 3) */
function useRem() {
  useEffect(() => {
    const c = document.getElementById("canvas")!;
    const apply = () => {
      document.documentElement.style.fontSize = 0.032 * c.getBoundingClientRect().height + "px";
      w.__ready = true;
    };
    const ro = new ResizeObserver(apply);
    ro.observe(c);
    apply();
    return () => ro.disconnect();
  }, []);
}

function App() {
  useTableVM();
  useRem();
  return (
    <div id="canvas">
      <Table />
      {/* W7 stand-in: Chat/Log stack (the real ChatDock/LogButton live in menus/) */}
      {orient === "portrait" && (
        <div className="aux-chat-bottom-buttons-ctn">
          <button className="show-chat-button">Chat</button>
          <button className="show-log-button">Log</button>
        </div>
      )}
      <ActionArea />
    </div>
  );
}
createRoot(document.getElementById("main-container")!).render(<App />);
