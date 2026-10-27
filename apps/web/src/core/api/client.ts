import type {
  ApprovePlayerBody,
  CurrentOrNextConfigs,
  CurrentPlayerInfos,
  FairnessRecord,
  FieldErrors,
  GameConfig,
  LedgerResponse,
  LedgerSession,
  LogEntry,
  NewGameRequest,
  NewGameResponse,
  PlayerEditResponse,
  PlayerId,
  RequestIngressBody,
  TableDataApi,
  UpdatePlayerBody
} from "@pokerthen/shared";

export class HttpError extends Error {
  constructor(
    public status: number,
    public body?: unknown
  ) {
    super(`HTTP ${status}`);
  }
}

export interface HttpDeps {
  fetch: typeof fetch;
  /** HTTP 202 => reload (ARCH 5.1) */
  reload: () => void;
  timeoutMs: number;
}

export const defaultHttpDeps = (): HttpDeps => ({
  fetch: (...a) => fetch(...a),
  reload: () => location.reload(),
  timeoutMs: 10_000
});

/** The ONLY place that calls fetch (components must use hooks). 10 s timeout, 202 => reload. */
export class HttpApi {
  constructor(
    readonly gameId: string,
    private readonly deps: HttpDeps = defaultHttpDeps()
  ) {}

  async raw(method: "GET" | "POST", url: string, body?: unknown): Promise<{ status: number; text: string; json: unknown }> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.deps.timeoutMs);
    try {
      const init: RequestInit = { method, credentials: "same-origin", signal: ctl.signal };
      if (body !== undefined) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify(body);
      }
      const r = await this.deps.fetch(url, init);
      if (r.status === 202) {
        this.deps.reload();
        return new Promise(() => undefined);
      }
      const text = await r.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { status: r.status, text, json };
    } finally {
      clearTimeout(timer);
    }
  }

  private async ok<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
    const r = await this.raw(method, url, body);
    if (r.status < 200 || r.status >= 300) throw new HttpError(r.status, r.json ?? r.text);
    return r.json as T;
  }

  private g = (suffix: string) => `/games/${this.gameId}/${suffix}`;

  /* ---- session / pages ---- */
  currentPlayerInfos = () => this.ok<CurrentPlayerInfos>("GET", "/current-player-infos");
  fairness = (hand: number) => this.ok<FairnessRecord>("GET", `/api/games/${this.gameId}/fairness/${hand}`);

  /* ---- seat flow ---- */
  async requestIngress(body: RequestIngressBody): Promise<{ ok: true } | { ok: false; errors: FieldErrors }> {
    const r = await this.raw("POST", this.g("request_ingress"), body);
    if (r.status === 200) return { ok: true };
    if (r.status === 422) return { ok: false, errors: (r.json ?? {}) as FieldErrors };
    if (r.status === 403 && (r.json as { code?: string } | null)?.code === "missing_game_player") {
      this.deps.reload();
      return new Promise(() => undefined);
    }
    throw new HttpError(r.status, r.json ?? r.text);
  }
  approvePlayer = (playerID: PlayerId, stack?: number) =>
    this.ok<unknown>("POST", this.g("approve_player"), { playerID, ...(stack !== undefined ? { stack } : {}) } satisfies ApprovePlayerBody);
  rejectPlayer = (playerID: PlayerId) => this.ok<unknown>("POST", this.g("reject_player"), { playerID });
  async removePlayer(playerID: PlayerId): Promise<{ queued: boolean }> {
    const j = await this.ok<{ queued?: boolean } | null>("POST", this.g("remove_player"), { playerID });
    return { queued: !!j?.queued };
  }
  transferOwnership = (playerID: PlayerId) => this.ok<unknown>("POST", this.g("transfer_ownership"), { playerID });
  putInAway = (playerID: PlayerId) => this.ok<unknown>("POST", this.g("put_in_away_mode"), { playerID });
  updatePlayer = (playerID: PlayerId, stackChangeMode: UpdatePlayerBody["stackChangeMode"], stackChange: number) =>
    this.ok<{ queued: boolean }>("POST", this.g("update_player"), { playerID, stackChange, stackChangeMode } satisfies UpdatePlayerBody);
  toggleGodMode = (playerID: PlayerId, allow: boolean) => this.ok<unknown>("POST", this.g("toggle_god_mode"), { playerID, allow });
  updateGame = (config: GameConfig) => this.ok<{ queued: boolean }>("POST", this.g("update_game"), config);
  /** 422 body is a FieldErrors map: thrown as HttpError(422, body) */
  startGame = async (): Promise<{ ok: true } | { ok: false; value: string }> => {
    const r = await this.raw("POST", this.g("start-game"));
    if (r.status === 200) return { ok: true };
    if (r.status === 422) return { ok: false, value: String((r.json as { value?: string } | null)?.value ?? "") };
    throw new HttpError(r.status, r.json ?? r.text);
  };
  requestRebuy = (value: number) => this.ok<unknown>("POST", this.g("request_rebuy"), { value });
  resolveRebuy = (playerID: PlayerId, approve: boolean, stack?: number) =>
    this.ok<unknown>("POST", this.g("resolve_rebuy"), { playerID, approve, ...(stack !== undefined ? { stack } : {}) });

  /* ---- reads (TableDataApi) ---- */
  loadLog = (handNumber: number, afterAt?: number) =>
    this.ok<LogEntry[]>("GET", `/api/games/${this.gameId}/log_v3?hand_number=${handNumber}${afterAt != null ? `&after_at=${afterAt}` : ""}`);
  loadLedger = () => this.ok<LedgerResponse>("GET", this.g("players_sessions"));
  loadLedgerSessions = (playerId: PlayerId) => this.ok<LedgerSession[]>("GET", this.g(`players_sessions/${playerId}`));
  loadConfigs = () => this.ok<CurrentOrNextConfigs>("GET", this.g("current_or_next_configs"));
  loadPlayerEdit = (playerId: PlayerId) => this.ok<PlayerEditResponse>("GET", this.g(`players/${playerId}`));
  ledgerCsvUrl = () => this.g(`ledger_${this.gameId}.csv`);
  logCsvUrl = () => this.g(`pokerthen_log_${this.gameId}.csv`);

  tableData(): TableDataApi {
    return {
      loadLog: this.loadLog,
      loadLedger: this.loadLedger,
      loadLedgerSessions: this.loadLedgerSessions,
      loadConfigs: this.loadConfigs,
      loadPlayerEdit: this.loadPlayerEdit,
      ledgerCsvUrl: this.ledgerCsvUrl,
      logCsvUrl: this.logCsvUrl
    };
  }
}

/** App-level (no game) calls used by pages. */
export class AppApi {
  private readonly http: HttpApi;
  constructor(private readonly deps: HttpDeps = defaultHttpDeps()) {
    this.http = new HttpApi("", deps);
  }
  currentPlayerInfos = () => this.http.currentPlayerInfos();
  /** 422 => {ok:false, errors}; other statuses => {ok:false, errors:{}} (SPEC 1.3) */
  async createGame(playerName: string, stack = 1000): Promise<{ ok: true; response: NewGameResponse } | { ok: false; errors: FieldErrors }> {
    const body: NewGameRequest = { playerName, gM: "th", playerStack: stack, bigBlind: 20, smallBlind: 10, cM: false };
    try {
      const r = await this.http.raw("POST", "/new-game", body);
      if (r.status === 200 || r.status === 201) return { ok: true, response: r.json as NewGameResponse };
      return { ok: false, errors: r.status === 422 ? ((r.json ?? {}) as FieldErrors) : {} };
    } catch {
      return { ok: false, errors: {} };
    }
  }
  fairness = (gameId: string, hand: number) => new HttpApi(gameId, this.deps).fairness(hand);
}
