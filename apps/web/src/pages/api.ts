import type { NewGameRequest, NewGameResponse, FairnessRecord, LogEntry } from "@pokerthen/shared";

export type CreateGameResult =
  | { ok: true; data: NewGameResponse }
  | { ok: false; status: number; errors?: Record<string, string> };
export type CreateGame = (req: NewGameRequest) => Promise<CreateGameResult>;

/** Default POST /new-game (W4 may inject its own `createGame`). 10 s timeout; HTTP 202 reloads the page (SPEC 1.1). */
export const defaultCreateGame: CreateGame = async (req) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch("/new-game", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req), credentials: "same-origin", signal: ctl.signal });
    if (res.status === 202) { location.reload(); return { ok: false, status: 202 }; }
    if (res.status === 200 || res.status === 201) return { ok: true, data: (await res.json()) as NewGameResponse };
    let errors: Record<string, string> | undefined;
    if (res.status === 422) { try { errors = (await res.json()) as Record<string, string>; } catch { /* ignore */ } }
    return { ok: false, status: res.status, errors };
  } catch {
    return { ok: false, status: 0 };
  } finally { clearTimeout(t); }
};

/** Public fairness record (no cookie needed). null = not found. */
export async function fetchFairness(gameId: string, hand: number): Promise<FairnessRecord | null> {
  const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/fairness/${hand}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Server answered ${res.status}`);
  return (await res.json()) as FairnessRecord;
}

/** Hand log as rendered for the viewer (needs the table cookie; returns null when not allowed). */
export async function fetchHandLog(gameId: string, hand: number): Promise<string[] | null> {
  try {
    const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/log_v3?hand_number=${hand}`, { credentials: "same-origin" });
    if (!res.ok) return null;
    const rows = (await res.json()) as LogEntry[];
    return rows.map((r) => r.msg);
  } catch { return null; }
}
