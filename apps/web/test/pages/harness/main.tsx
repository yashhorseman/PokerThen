import { createRoot } from "react-dom/client";
import "../../../src/art/tokens.css";
import "../../../src/pages/pages.css";
import "./harness.css";
import { Home, NewGame, Tutorial, Verify, ConnectScreen } from "../../../src/pages";

const q = new URLSearchParams(location.search);
const page = q.get("page") ?? "home";
const portrait = q.get("portrait") === "1";
document.documentElement.className = portrait ? "portrait" : "landscape";
const el = (() => {
  switch (page) {
    case "newgame": return <NewGame />;
    case "newgame-error": return <NewGame createGame={async () => ({ ok: false, status: 422, errors: { playerName: "must be unique and length must be between 2 and 14" } })} />;
    case "connecting": return <ConnectScreen state={{ kind: "connecting" }} />;
    case "failed": return <ConnectScreen state={{ kind: "failed" }} />;
    case "tutorial": return <Tutorial />;
    case "verify": return <Verify />;
    default: return <Home />;
  }
})();
createRoot(document.getElementById("main-container")!).render(el);
