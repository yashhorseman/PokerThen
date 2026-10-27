import { useEffect, useMemo } from "react";
import { ActionArea } from "../../actions";
import { ChatDock, ConfigScreen, LogButton, QuickAcceptHost } from "../../menus";
import { ConnectScreen, TosBar } from "../../pages";
import { Table } from "../../table";
import { navigate } from "../../router";
import { AppApi } from "../api/client";
import { ScaledCanvas } from "../canvas/ScaledCanvas";
import { useHotkey } from "../hotkeys";
import { useTableVM, usePrefs } from "../hooks";
import { GameProvider, useRuntime } from "../Provider";
import { GameRuntime } from "../runtime";
import { audio } from "../../audio";

const appApi = new AppApi();

function Inner() {
  const vm = useTableVM();
  const [prefs, api] = usePrefs();
  const rt = useRuntime();
  // `b` toggles big-blind display and posts a local auto chat (SPEC 6.4, 16)
  useHotkey("b", () => {
    if (prefs.displayValueStyle === "big-blind") {
      api.set({ displayValueStyle: prefs.previousDisplayValueStyle ?? prefs.nonBBDisplayValueStyle ?? "none" });
    } else {
      api.set({ previousDisplayValueStyle: prefs.displayValueStyle ?? "none", nonBBDisplayValueStyle: prefs.displayValueStyle ?? "none", displayValueStyle: "big-blind" });
      rt.store.pushChat({ at: Date.now(), playerID: null, playerName: "PokerThen", message: "You are now seeing the values as big blinds, to toggle it, press b", autoMessage: true });
    }
  });
  const c = vm.connection;
  useEffect(() => {
    if (c.status === "failed" && c.failedCode === "unknown-game") navigate("/", { replace: true });
  }, [c.status, c.failedCode]);
  const ready = c.status !== "failed" && vm.youId !== "";
  return (
    <ScaledCanvas className={`game-main-container${vm.fourColor ? " four-color" : ""}`}>
      {ready ? (
        <>
          <Table />
          <ActionArea />
          <ChatDock />
          <LogButton />
          <ConfigScreen />
          <QuickAcceptHost />
          <TosBar />
        </>
      ) : (
        <ConnectScreen state={c.status === "failed" ? { kind: "failed", ...(c.failedCode ? { code: c.failedCode } : {}), ...(c.failedMsg ? { msg: c.failedMsg } : {}) } : { kind: "connecting" }} />
      )}
    </ScaledCanvas>
  );
}

export function TableScreen({ gameId }: { gameId: string }) {
  const rt = useMemo(() => {
    const mock = import.meta.env.DEV ? new URLSearchParams(location.search).get("mock") : null;
    if (mock) {
      // dev-only scripted server from W1 fixtures
      return import("../mock/devMock").then((m) => m.createMockRuntime(gameId, mock));
    }
    return new GameRuntime({
      gameId,
      audio: () => audio,
      beforeConnect: async () => void (await appApi.currentPlayerInfos())
    });
  }, [gameId]);
  return <Loader rt={rt} />;
}

import { useState } from "react";
function Loader({ rt }: { rt: GameRuntime | Promise<GameRuntime> }) {
  const [runtime, setRuntime] = useState<GameRuntime | null>(rt instanceof GameRuntime ? rt : null);
  useEffect(() => {
    if (rt instanceof GameRuntime) setRuntime(rt);
    else void rt.then(setRuntime);
  }, [rt]);
  if (!runtime) return null;
  return (
    <GameProvider runtime={runtime}>
      <Inner />
    </GameProvider>
  );
}
