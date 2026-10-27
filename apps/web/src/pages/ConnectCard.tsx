import { PlaceholderTable, RoomBackground } from "../art";
import { useIsPortrait } from "./useIsPortrait";

export type ConnectState =
  | { kind: "connecting" }
  | { kind: "failed"; code?: string; msg?: string }
  | { kind: "locked"; msg: string };

/** Failure bodies (SPEC 1.3). */
export function connectFailureText(code?: string, msg?: string): string {
  switch (code) {
    case "too-many-connections": return "Your IP reached the max quantity of connections, please try to finish some other browser tabs/windows.";
    case "session-missing-token": return "Wasn't possible to detect your session. Please check if the cookies are enabled and try again.";
    case "too-many-actions": return "You were disconnected because you sent too many actions.";
    default: return msg || "Please check if the cookies are enabled and try again.";
  }
}

/** Card for `Connecting...` / `Connection failed!` / `Warning`; same style as the New Game card. Place inside the canvas. */
export function ConnectCard({ state }: { state: ConnectState }) {
  return (
    <div className="waiting-container-center-container pt-connect-card" role="status">
      {state.kind === "connecting" && <p className="pt-connect-text">Connecting...</p>}
      {state.kind === "failed" && (
        <p className="pt-connect-text"><b>Connection failed!</b><br />{connectFailureText(state.code, state.msg)}</p>
      )}
      {state.kind === "locked" && (<><h1 className="pt-card-title">Warning</h1><p className="pt-connect-text">{state.msg}</p></>)}
    </div>
  );
}

/** Blurred own-art table + card (full canvas scene) for the connection phase. */
export function ConnectScreen({ state }: { state: ConnectState }) {
  const portrait = useIsPortrait();
  return (
    <div className="pt-scene">
      <RoomBackground />
      <div className="placeholder-background"><PlaceholderTable kind={portrait ? "phone" : "desktop"} /></div>
      <ConnectCard state={state} />
    </div>
  );
}
