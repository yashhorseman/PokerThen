import { useEffect } from "react";

/** Sets document.title and (optionally) the meta description while a page is mounted. */
export function usePageMeta(title: string, description?: string): void {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    let el: HTMLMetaElement | null = null; let prevDesc: string | null = null; let created = false;
    if (description) {
      el = document.querySelector('meta[name="description"]');
      if (!el) { el = document.createElement("meta"); el.name = "description"; document.head.appendChild(el); created = true; }
      prevDesc = el.content; el.content = description;
    }
    return () => {
      document.title = prevTitle;
      if (el) { if (created) el.remove(); else el.content = prevDesc ?? ""; }
    };
  }, [title, description]);
}

export const PAGE_TITLES = {
  home: "PokerThen - Home",
  newGame: "PokerThen - New Game - Private Poker with friends",
  table: "PokerThen - Poker with Friends",
  verify: "PokerThen - Verify a hand",
  tutorial: "PokerThen - How to play Texas Hold'em"
} as const;
export const NEW_GAME_DESCRIPTION = "Start to play free private poker home game online with your friends! No download and no registration needed. Up to 10 people.";

/** Safe localStorage helpers (storage can throw in private windows). */
export function lsGet(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
export function lsSet(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* ignore */ } }
