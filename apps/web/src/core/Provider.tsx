import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { GameRuntime, type RuntimeOptions } from "./runtime";

const Ctx = createContext<GameRuntime | null>(null);

export function useRuntime(): GameRuntime {
  const r = useContext(Ctx);
  if (!r) throw new Error("core hooks must be used inside <GameProvider>");
  return r;
}
export function useMaybeRuntime(): GameRuntime | null {
  return useContext(Ctx);
}

/** Creates (and starts) the runtime for one table. Pass `runtime` to inject a prebuilt one (mock/tests). */
export function GameProvider({ options, runtime, children }: { options?: RuntimeOptions; runtime?: GameRuntime; children: ReactNode }) {
  const rt = useMemo(() => runtime ?? new GameRuntime(options!), [runtime, options?.gameId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    rt.start();
    return () => rt.stop();
  }, [rt]);
  return <Ctx.Provider value={rt}>{children}</Ctx.Provider>;
}
