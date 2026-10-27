import { useEffect, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { FIELD_ERRORS, STACK_MAX, type NewGameRequest, type NewGameResponse } from "@pokerthen/shared";
import { PlaceholderTable, RoomBackground } from "../art";
import { defaultCreateGame, type CreateGame } from "./api";
import { ConnectCard, type ConnectState } from "./ConnectCard";
import { TosBar } from "./TosBar";
import { useIsPortrait } from "./useIsPortrait";
import { NEW_GAME_DESCRIPTION, PAGE_TITLES, usePageMeta } from "./usePageMeta";
import "./fonts";

/* W4's scaled canvas (core/canvas/ScaledCanvas.tsx) when present; otherwise a minimal local one so this page also runs standalone. */
const found = import.meta.glob("../core/canvas/ScaledCanvas.tsx", { eager: true }) as Record<string, { ScaledCanvas?: ComponentType<{ children?: ReactNode }>; default?: ComponentType<{ children?: ReactNode }> }>;
const mod = Object.values(found)[0];
const W4Canvas = mod?.ScaledCanvas ?? mod?.default;

/** Standalone fallback: #main-container > #canvas with html font-size = 3.2% of canvas height (SPEC 3). */
function LocalCanvas({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => { document.documentElement.style.fontSize = `${0.032 * el.getBoundingClientRect().height}px`; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div id="canvas" ref={ref}>{children}</div>;
}
const Canvas = W4Canvas ?? LocalCanvas;

export interface NewGameProps {
  /** injected by the router (W4); defaults to a plain POST /new-game */
  createGame?: CreateGame;
  /** called after a successful create; the router does history.replaceState + mounts the table (SPEC 1.3) */
  onCreated?: (res: NewGameResponse) => void;
  /** when set, shows the connection card instead of the form (blurred table stays) */
  connection?: ConnectState | null;
}

export const NEW_GAME_REQUEST_DEFAULTS = { gM: "th", playerStack: 1000, bigBlind: 20, smallBlind: 10, cM: false } as const; // playerStack is the form default; the host can change it (deliberate difference from the reference)

/** Content of the New Game scene (inside the canvas). */
export function NewGameScene({ createGame = defaultCreateGame, onCreated, connection }: NewGameProps) {
  const [name, setName] = useState("");
  const [stack, setStack] = useState(String(NEW_GAME_REQUEST_DEFAULTS.playerStack));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stackError, setStackError] = useState<string | null>(null);
  const portrait = useIsPortrait();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    // DEVIATION from the reference (owner decision 2026-10-27): the host chooses their own starting stack here (the reference always uses 1000).
    // Same rule and message as the seat form: a whole number from 1 to 1.000.000.
    const typed = stack.trim();
    const stackNum = /^\d+$/.test(typed) ? Number(typed) : NaN;
    if (!Number.isInteger(stackNum) || stackNum < 1 || stackNum > STACK_MAX) { setStackError(FIELD_ERRORS.stackRange); return; }
    setLoading(true); setError(null); setStackError(null);
    const req: NewGameRequest = { ...NEW_GAME_REQUEST_DEFAULTS, playerName: name, playerStack: stackNum };
    const r = await createGame(req);
    if (r.ok) { onCreated?.(r.data); return; } // stay in "Loading..." while the router swaps the screen
    setLoading(false);
    if (r.status === 422 && r.errors?.playerName) setError(r.errors.playerName);
    if (r.status === 422 && r.errors?.stack) setStackError(r.errors.stack);
  }

  return (
    <div className="pt-scene pt-newgame">
      <RoomBackground />
      <div className="placeholder-background"><PlaceholderTable kind={portrait ? "phone" : "desktop"} /></div>
      {connection ? (
        <ConnectCard state={connection} />
      ) : (
        <div className="waiting-container-center-container">
          <form className="pt-newgame-form" onSubmit={submit} noValidate>
            <h1 className="pt-card-title">New Game</h1>
            <p className="pt-card-sub">Play free private online poker with your friends.<br />No download and no registration needed.</p>
            <label htmlFor="pt-nick">Your Nickname</label>
            <input id="pt-nick" name="playerName" type="text" maxLength={14} placeholder="Your Nickname" autoFocus autoComplete="off" autoCapitalize="off" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} />
            {error && <span className="error-message">{error}</span>}
            <label htmlFor="pt-stack">Your Stack</label>
            <input id="pt-stack" name="playerStack" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="Your Stack" autoComplete="off" spellCheck={false} value={stack} onChange={(e) => setStack(e.target.value)} />
            {stackError && <span className="error-message">{stackError}</span>}
            <button type="submit" className="pt-create-btn button-1 green highlighted" disabled={loading}>{loading ? "Loading..." : "Create Game"}</button>
            <p className="new-game-secondary-link">
              New to poker? <a href="/poker-tutorial" target="_blank" rel="noreferrer">Learn the rules in our free interactive tutorial</a>.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}

/** `/start-game` (SPEC 1.3). */
export function NewGame(props: NewGameProps) {
  usePageMeta(PAGE_TITLES.newGame, NEW_GAME_DESCRIPTION);
  return (
    <>
      <Canvas><NewGameScene {...props} /></Canvas>
      <TosBar />
    </>
  );
}
