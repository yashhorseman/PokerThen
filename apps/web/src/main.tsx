import "@fontsource/mulish/200.css";
import "@fontsource/mulish/300.css";
import "@fontsource/mulish/400.css";
import "@fontsource/mulish/700.css";
import "@fontsource/mulish/900.css";
import "@fontsource/abril-fatface/400.css";
import "./core/styles/base.css";
import "./art/tokens.css";
import "./core/ui/ui.css";
import "./table/table.css";
import "./actions/actions.css";
import "./menus/menus.css";
import "./pages/pages.css";
import "./phone/portrait.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
