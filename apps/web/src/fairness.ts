import { useEffect, useRef, useState } from 'react';
import { verifyProof } from '@pokerthen/engine';
import type { CardProof } from '@pokerthen/engine';
import type { Snapshot } from '@pokerthen/protocol';

export interface HandCheck {
  handNo: number;
  commit: string;
  /** false if this browser first saw the hand after cards were already dealt/revealed */
  sawCommitBeforeDeal: boolean;
  proofsChecked: number;
  proofsOk: boolean;
  positionsOk: boolean;
  displayedMatchesProofs: boolean;
  uniqueCards: boolean;
  complete: boolean;
  ok: boolean;
  notes: string[];
}

/**
 * Verifies, in this browser, that every card revealed to this viewer (own hole cards, board, shown hands,
 * burn cards after the hand, rabbit cards) is part of the deck the table committed to before dealing, sits at
 * the position the dealing procedure says it must, and matches what is displayed on screen.
 */
export class FairnessTracker {
  commits = new Map<number, string>();
  checks = new Map<number, HandCheck>();

  observe(s: Snapshot): boolean {
    const f = s.fairness, h = s.hand;
    if (!f || !h) return false;
    let changed = false;
    if (!this.commits.has(f.handNo)) { this.commits.set(f.handNo, f.commit); changed = true; }
    const commit = this.commits.get(f.handNo) as string;
    const notes: string[] = [];
    const all: CardProof[] = [...f.proofs, ...f.mine, ...f.rabbit];
    let proofsOk = commit === f.commit;
    if (commit !== f.commit) notes.push('The commitment for this hand changed after it was first published!');
    for (const p of all) if (!verifyProof(commit, p)) { proofsOk = false; notes.push(`Card at position ${p.index} does not match the commitment.`); }

    const n = f.playersInDealOrder.length;
    const byIndex = new Map(all.map((p) => [p.index, p.card] as const));
    const expectAt = (i: number, card: string | null | undefined, label: string) => {
      const committed = byIndex.get(i);
      if (card && committed && committed !== card) { notes.push(`${label} shows ${card} but the committed card there is ${committed}.`); return false; }
      return true;
    };
    let positionsOk = true, displayedOk = true;
    // hole cards: player k (counting from the seat left of the dealer) holds deck[k] and deck[n+k]
    for (const seat of s.seats) {
      if (seat.empty || !seat.cards) continue;
      const k = f.playersInDealOrder.indexOf(seat.index);
      if (k < 0) continue;
      seat.cards.forEach((c, i) => { if (!expectAt(i === 0 ? k : n + k, c, `Seat ${seat.index + 1} card ${i + 1}`)) displayedOk = false; });
    }
    for (const p of f.proofs.concat(f.mine)) {
      // any proof inside the hole-card region must sit where one of the players' cards belongs
      if (p.index < 2 * n) { if (p.index % n >= n) positionsOk = false; }
    }
    // run-1 board: flop = burn at 2n then 2n+1..2n+3, turn = 2n+5, river = 2n+7
    const board = h.boards[0] ?? [];
    const bIdx = [2 * n + 1, 2 * n + 2, 2 * n + 3, 2 * n + 5, 2 * n + 7];
    board.forEach((c, i) => { if (!expectAt(bIdx[i], c, `Board card ${i + 1}`)) displayedOk = false; });
    for (const p of f.proofs) {
      const bi = bIdx.indexOf(p.index);
      if (bi >= 0 && board[bi] && board[bi] !== p.card) displayedOk = false;
    }
    if (f.complete) {
      const burns = [2 * n, 2 * n + 4, 2 * n + 6].slice(0, board.length >= 5 ? 3 : board.length >= 4 ? 2 : board.length >= 3 ? 1 : 0);
      for (const b of burns) if (!byIndex.has(b)) notes.push(`Burn card at position ${b} was not revealed.`);
    }
    const distinct = [...new Map(all.map((p) => [p.index, p.card] as const)).entries()];
    const uniqueCards = new Set(distinct.map(([, c]) => c)).size === distinct.length;
    const prev = this.checks.get(f.handNo);
    // first sighting counts as "before the deal" only if no board or shown card existed yet
    const sawBefore = prev ? prev.sawCommitBeforeDeal : (h.boards[0]?.length ?? 0) === 0 && f.proofs.every((p) => p.index < 2 * n);
    const next: HandCheck = {
      handNo: f.handNo, commit, sawCommitBeforeDeal: sawBefore, proofsChecked: all.length, proofsOk, positionsOk, displayedMatchesProofs: displayedOk,
      uniqueCards, complete: f.complete, ok: proofsOk && positionsOk && displayedOk && uniqueCards && notes.length === 0, notes,
    };
    if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) { this.checks.set(f.handNo, next); changed = true; }
    return changed;
  }
}

export function useFairness(snap: Snapshot | null) {
  const tracker = useRef(new FairnessTracker());
  const [, setTick] = useState(0);
  useEffect(() => {
    if (snap && tracker.current.observe(snap)) setTick((x) => x + 1);
  }, [snap]);
  const checks = [...tracker.current.checks.values()].sort((a, b) => b.handNo - a.handNo);
  const done = checks.filter((c) => c.complete);
  return { checks, verified: done.filter((c) => c.ok).length, completed: done.length, failed: done.filter((c) => !c.ok).length };
}
