import "@fontsource/mulish/400.css";
import "@fontsource/mulish/700.css";
import "@fontsource/abril-fatface/400.css";
import "../../../src/art/tokens.css";
import "./base.css";
import "../../../src/table/table.css";
import { createRoot } from "react-dom/client";
import { Table } from "../../../src/table";
import { buildVM, type Opts } from "../fixtures";
import { setVM } from "./mockHooks";
import type { TableViewModel } from "@pokerthen/shared";

function applyRem() {
  const el = document.getElementById("canvas")!;
  document.documentElement.style.fontSize = 0.032 * el.getBoundingClientRect().height + "px";
}
const w = window as unknown as Record<string, unknown>;
w.__setScenario = (o: Opts) => { setVM(buildVM(o)); };
w.__setVM = (vm: TableViewModel) => setVM(vm);
w.__build = buildVM;
w.__applyRem = applyRem;
document.documentElement.classList.add("landscape");
setVM(buildVM((w.__initial as Opts | undefined) ?? {}));
createRoot(document.getElementById("canvas")!).render(<Table />);
new ResizeObserver(applyRem).observe(document.getElementById("canvas")!);
applyRem();
