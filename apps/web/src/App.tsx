import { useEffect } from "react";
import { installHotkeys } from "./core/hotkeys";
import { OverlayHost } from "./core/ui";
import { TableScreen } from "./core/screens/TableScreen";
import { Home, NewGame, Tutorial, Verify } from "./pages";
import { matchRoute, navigate, useRoute } from "./router";
import { AppApi } from "./core/api/client";

const appApi = new AppApi();

function NewGameRoute() {
  return (
    <NewGame
      createGame={async (req) => {
        const r = await appApi.createGame(req.playerName, req.playerStack);
        return r.ok ? { ok: true, data: r.response } : { ok: false, status: 422, errors: r.errors };
      }}
      onCreated={(res) => navigate(`/games/${res.gameID}`, { replace: true })}
    />
  );
}

export function App() {
  const route = useRoute();
  useEffect(() => installHotkeys(), []);
  useEffect(() => {
    if (matchRoute(location.pathname) === null) navigate("/", { replace: true });
  }, [route]);
  return (
    <>
      {route.name === "home" && <Home />}
      {route.name === "newGame" && <NewGameRoute />}
      {route.name === "table" && <TableScreen key={route.gameId} gameId={route.gameId} />}
      {route.name === "verify" && <Verify />}
      {route.name === "tutorial" && <Tutorial />}
      <OverlayHost />
    </>
  );
}
