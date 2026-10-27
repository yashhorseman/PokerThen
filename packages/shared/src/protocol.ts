import type { CardCode } from "./cards.js";
import type { Frame, FrameDelta, GameId, PlayerId, SeatNo } from "./frame.js";

/* ---------- client -> server (JSON text frames over WebSocket) ---------- */

/** Game actions (SPEC 6, 05 s2.1). No ack: the effect arrives in the next delta. */
export type ActionMsg =
  | { type: "PLAYER_FOLD" }
  | { type: "PLAYER_CHECK" }
  | { type: "PLAYER_CALL" }
  /** value = total bet-to amount for the street (integer chips, or cents when centsMode) */
  | { type: "PLAYER_RAISE"; value: number }
  | { type: "ATB" } // activate time bank
  | { type: "NH" } // owner: next hand
  | { type: "RS" } // owner: shuffle seats
  | { type: "UP" } // owner: pause
  | { type: "UR" } // owner: unpause
  | { type: "TSG"; decision: boolean } // owner: stop game after this hand / cancel
  | { type: "SUNH" } // away (sit out next hand)
  | { type: "PLAYER_SIT_BACK"; waitBB?: boolean }
  | { type: "QNH" } // leave seat next hand
  | { type: "CQNH" } // cancel leave
  | { type: "CANCEL_REQUEST_GAME_INGRESS" }
  | { type: "DRITD"; decision: boolean } // run it twice vote
  | { type: "SHOW_HAND"; cardToShow: "all" | CardCode }
  | { type: "RUC" } // rabbit hunt reveal click
  | { type: "SSP"; value: boolean } // preference: auto straddle
  | { type: "TOGGLE_MUTE_PLAYER"; otherPlayerID: PlayerId }
  | { type: "ME"; emoji: string | null }
  | { type: "RUP" }; // request full frame

export type ActionType = ActionMsg["type"];

export type ClientMsg =
  | { t: "action"; action: ActionMsg }
  | { t: "chat"; text: string }
  | { t: "ping"; ts: number }
  | { t: "rue" }; // request emoji table

/* ---------- server -> client ---------- */

export interface ChatMessage {
  /** epoch ms */
  at: number;
  playerID: PlayerId | null; // null = system
  playerName: string;
  message: string;
  highlight?: boolean;
  autoMessage?: boolean;
}

export type NoticeKind = "profanity" | "maintenance" | "ownershipTransferred" | "removed" | "spectatorWarning"; // spectatorWarning (additive): data.names = string[] (SPEC 8 modal)

export type ServerMsg =
  /** full state on connect/reconnect; frame is projected for this viewer */
  | { t: "registered"; frame: Frame; you: { id: PlayerId; name: string; mutedIds: PlayerId[]; straddling: boolean } }
  /** incremental change; chain check: delta.meta.pre === lastFrame.meta.now else client sends RUP */
  | { t: "gC"; delta: FrameDelta }
  /** full replacement (reply to RUP) */
  | { t: "rup"; frame: Frame }
  | { t: "chat"; message: ChatMessage }
  | { t: "chatHistory"; messages: ChatMessage[] }
  /** emoji delta [version, playerId, emoji] and full table */
  | { t: "nEM"; version: number; playerId: PlayerId; emoji: string | null }
  | { t: "rEM"; version: number; emojis: Record<PlayerId, string | null> }
  | { t: "igpu"; name: string; mutedIds: PlayerId[]; straddling: boolean }
  | { t: "notice"; kind: NoticeKind; message: string; data?: Record<string, unknown> }
  | { t: "pong"; ts: number; serverNow: number }
  /** table closed/replaced: no reconnect UI */
  | { t: "disposed" }
  | { t: "failed"; code?: string; msg?: string };

/** WebSocket endpoint: wss://host/ws?gameID=<id>&layout=d|m  (cookie ptn identifies the player). */
export interface WsQuery {
  gameID: GameId;
  layout: "d" | "m";
  firstConnection?: "true";
}

/** WS close codes used by the server. */
export const WS_CLOSE = {
  NORMAL: 1000,
  BAD_ORIGIN: 4403,
  UNKNOWN_GAME: 4404,
  TOO_MANY_CONNECTIONS: 4429,
  TOO_MANY_ACTIONS: 4430,
  NO_SESSION: 4401,
  DISPOSED: 4410
} as const;

export type SeatPosition = SeatNo;
