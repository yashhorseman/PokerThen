import { SuitIcon, type SuitKey } from "../art";
import { HubShell } from "./HubShell";
import { PAGE_TITLES, usePageMeta } from "./usePageMeta";
import "./fonts";

type C = [string, SuitKey];
const RANKINGS: { name: string; cards: C[]; note: string }[] = [
  { name: "Royal flush", cards: [["A", "h"], ["K", "h"], ["Q", "h"], ["J", "h"], ["10", "h"]], note: "A-K-Q-J-10 of one suit." },
  { name: "Straight flush", cards: [["9", "s"], ["8", "s"], ["7", "s"], ["6", "s"], ["5", "s"]], note: "Five in a row, one suit." },
  { name: "Four of a kind", cards: [["8", "c"], ["8", "d"], ["8", "h"], ["8", "s"], ["K", "d"]], note: "Four cards of the same rank." },
  { name: "Full house", cards: [["Q", "s"], ["Q", "d"], ["Q", "c"], ["4", "h"], ["4", "s"]], note: "Three of a kind plus a pair." },
  { name: "Flush", cards: [["A", "d"], ["J", "d"], ["8", "d"], ["5", "d"], ["2", "d"]], note: "Five cards of one suit." },
  { name: "Straight", cards: [["10", "c"], ["9", "d"], ["8", "h"], ["7", "s"], ["6", "c"]], note: "Five in a row. The ace plays high or low." },
  { name: "Three of a kind", cards: [["7", "h"], ["7", "s"], ["7", "d"], ["K", "c"], ["2", "h"]], note: "Three cards of the same rank." },
  { name: "Two pair", cards: [["J", "s"], ["J", "h"], ["5", "c"], ["5", "d"], ["A", "s"]], note: "Two different pairs." },
  { name: "Pair", cards: [["10", "d"], ["10", "c"], ["A", "h"], ["6", "s"], ["3", "d"]], note: "Two cards of the same rank." },
  { name: "High card", cards: [["A", "s"], ["J", "c"], ["8", "h"], ["6", "d"], ["3", "c"]], note: "Nothing else: the highest card plays." }
];
const RED = new Set(["h", "d"]);

/** `/poker-tutorial`: static rules page. U-H2: PokerNow's interactive tutorial copy is unknown; this text is PokerThen's own. */
export function Tutorial() {
  usePageMeta(PAGE_TITLES.tutorial);
  return (
    <HubShell active="none" title="How to play Texas Hold'em" icon="info">
      <article className="pt-doc">
        <h1>How to play Texas Hold'em</h1>
        <p className="pt-lead">Everyone gets two private cards. Five shared cards come face up. Make the best five-card hand from any of the seven, or make everyone else fold.</p>

        <h2>One hand, step by step</h2>
        <ol className="pt-steps">
          <li><b>Blinds.</b> The two players left of the dealer button post forced bets (small blind, big blind) so there is something to win.</li>
          <li><b>Pre-flop.</b> Each player gets two hole cards. Starting left of the big blind, everyone folds, calls the big blind, or raises.</li>
          <li><b>Flop.</b> Three shared cards are dealt. Another round of betting begins left of the button.</li>
          <li><b>Turn.</b> A fourth shared card, then betting.</li>
          <li><b>River.</b> The fifth and last shared card, then the final betting round.</li>
          <li><b>Showdown.</b> Players still in reveal their hands. The best five-card hand takes the pot; equal hands split it.</li>
        </ol>

        <h2>Your choices</h2>
        <dl className="pt-defs">
          <dt>Fold</dt><dd>Give up your hand and your chips already bet.</dd>
          <dt>Check</dt><dd>Pass without betting, when nobody has bet in this round.</dd>
          <dt>Call</dt><dd>Match the current bet.</dd>
          <dt>Bet / Raise</dt><dd>Put in more chips. A raise must be at least as big as the previous bet or raise.</dd>
          <dt>All in</dt><dd>Bet every chip you have. You can only win what you matched from each opponent; the rest goes into a side pot.</dd>
        </dl>

        <h2>Hand rankings (best first)</h2>
        <ul className="pt-rankings">
          {RANKINGS.map((r, i) => (
            <li key={r.name}>
              <span className="pt-rank-n">{i + 1}</span>
              <span className="pt-rank-cards">
                {r.cards.map(([rank, s], k) => (
                  <span key={k} className="pt-mini-card" style={{ color: RED.has(s) ? "#db3131" : "#2c2c2c" }}>
                    <b>{rank}</b><SuitIcon suit={s} size="1em" />
                  </span>
                ))}
              </span>
              <span className="pt-rank-text"><b>{r.name}</b><small>{r.note}</small></span>
            </li>
          ))}
        </ul>

        <h2>On PokerThen</h2>
        <p>The table owner creates a game, shares the link, and approves players who ask for a seat. Chips are play money. Every hand's shuffle is committed before the cards are dealt, and you can check it afterwards on the <a href="/verify">verify page</a>.</p>
        <p><a className="hub-home__btn start pt-inline-btn" href="/start-game">Start a new game</a></p>
      </article>
    </HubShell>
  );
}
