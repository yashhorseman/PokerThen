import { z } from "zod";
import { CHAT_MAX, NAME_MAX, STACK_MAX } from "./constants.js";
import { isCardCode } from "./cards.js";
import type { ClientMsg } from "./protocol.js";

const cardArg = z.string().refine(isCardCode, "card");

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLAYER_FOLD") }),
  z.object({ type: z.literal("PLAYER_CHECK") }),
  z.object({ type: z.literal("PLAYER_CALL") }),
  z.object({ type: z.literal("PLAYER_RAISE"), value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
  z.object({ type: z.literal("ATB") }),
  z.object({ type: z.literal("NH") }),
  z.object({ type: z.literal("RS") }),
  z.object({ type: z.literal("UP") }),
  z.object({ type: z.literal("UR") }),
  z.object({ type: z.literal("TSG"), decision: z.boolean() }),
  z.object({ type: z.literal("SUNH") }),
  z.object({ type: z.literal("PLAYER_SIT_BACK"), waitBB: z.boolean().optional() }),
  z.object({ type: z.literal("QNH") }),
  z.object({ type: z.literal("CQNH") }),
  z.object({ type: z.literal("CANCEL_REQUEST_GAME_INGRESS") }),
  z.object({ type: z.literal("DRITD"), decision: z.boolean() }),
  z.object({ type: z.literal("SHOW_HAND"), cardToShow: z.union([z.literal("all"), cardArg]) }),
  z.object({ type: z.literal("RUC") }),
  z.object({ type: z.literal("SSP"), value: z.boolean() }),
  z.object({ type: z.literal("TOGGLE_MUTE_PLAYER"), otherPlayerID: z.string().length(10) }),
  z.object({ type: z.literal("ME"), emoji: z.string().max(16).nullable() }),
  z.object({ type: z.literal("RUP") })
]);

export const clientMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("action"), action: actionSchema }),
  z.object({ t: z.literal("chat"), text: z.string().max(CHAT_MAX * 4) }),
  z.object({ t: z.literal("ping"), ts: z.number() }),
  z.object({ t: z.literal("rue") })
]);

export function parseClientMsg(raw: string): ClientMsg | null {
  try {
    const r = clientMsgSchema.safeParse(JSON.parse(raw));
    return r.success ? (r.data as ClientMsg) : null;
  } catch {
    return null;
  }
}

/** Loose HTTP bodies: field-level 422 text comes from the engine (SPEC 2.3), these only reject malformed JSON shapes. */
export const newGameSchema = z.object({ playerName: z.string().max(200).default(""), gM: z.string().optional(), playerStack: z.number().optional(), bigBlind: z.number().optional(), smallBlind: z.number().optional(), cM: z.boolean().optional() });
export const requestIngressSchema = z.object({
  seat: z.number().int().min(1).max(10),
  playerName: z.string().max(NAME_MAX * 4),
  allowSpectator: z.boolean().default(false),
  stack: z.number().max(STACK_MAX * 1000).nullable(),
  sitAsAway: z.boolean().optional()
});
export const playerIdSchema = z.object({ playerID: z.string().length(10) });
