import type { ChatMessage, PlayerId } from "@pokerthen/shared";
import { CHAT_MAX } from "@pokerthen/shared";
import { LIMITS } from "../limits.js";

export const SYSTEM_SENDER = "PokerThen";

/** Profanity filter is a placeholder interface (U-C2): disabled until the owner supplies rules. */
export interface ProfanityFilter {
  /** return {allow:false, system} to block and answer with system messages (formats in SPEC 17.4) */
  check(text: string, playerId: PlayerId, now: number): { allow: boolean; system?: string[] };
}
export const noProfanityFilter: ProfanityFilter = { check: () => ({ allow: true }) }; // U-C2

export interface StoredChat extends ChatMessage { seq: number }

/** Normalise an incoming chat line: trimmed, 1..CHAT_MAX chars (server enforces), no control characters. */
export function sanitizeChat(text: string): string | null {
  const t = text.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!t || [...t].length > CHAT_MAX) return null;
  return t;
}

export class ChatStore {
  private msgs: StoredChat[] = [];
  static fromRows(rows: unknown[]): ChatStore {
    const s = new ChatStore();
    for (const r of rows as StoredChat[]) s.add(r);
    return s;
  }
  add(m: StoredChat): void {
    this.msgs.push(m);
    if (this.msgs.length > LIMITS.CHAT_HISTORY) this.msgs.splice(0, this.msgs.length - LIMITS.CHAT_HISTORY);
  }
  history(isMutedSender: (id: PlayerId) => boolean): ChatMessage[] {
    return this.msgs
      .filter((m) => !m.playerID || !isMutedSender(m.playerID))
      .map(({ seq: _s, ...m }) => m);
  }
}
