/**
 * /verify logic (docs/FAIRNESS-MERKLE.md items 9 and 10). Pure functions, no DOM, no fetch: the page and the tests share them.
 * Uses the shared Merkle primitives (same code as the engine and scripts/verify-hand.ts).
 */
import {
  GENESIS_PREV_COMMITMENT, computeCommitmentSync, computeLeaf, foldProof, isCardCode,
  type FairnessRecord, type FairnessReveal, type FairnessUsage
} from "@pokerthen/shared";

export type CheckStatus = "pass" | "fail" | "skip";
export interface Check { id: string; title: string; status: CheckStatus; detail: string }
export interface HandVerdict { overall: "PASS" | "FAIL" | "PENDING"; checks: Check[] }

export interface VerifyInput {
  gameId: string;
  handNumber: number;
  record: FairnessRecord;
  /** the previous hand's record (or null/undefined for hand 1 / unavailable) */
  prevRecord?: FairnessRecord | null;
  /** hand 1 has no previous hand; set when the hand number is 1 */
  firstHand?: boolean;
  /** rendered hand log text (one line per row) as shown in the log modal; optional */
  logLines?: string[] | null;
}

const HEX64 = /^[0-9a-f]{64}$/;
const GLYPH: Record<string, string> = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };

/** "10♥" / "Q♠" / "Ts" -> "Th" / "Qs" / "Ts" */
export function parseCardToken(tok: string): string | null {
  const t = tok.trim();
  const m = /^(10|[2-9TJQKA])([♠♥♦♣shdc])$/.exec(t);
  if (!m) return null;
  const rank = m[1] === "10" ? "T" : m[1]!;
  const suit = GLYPH[m[2]!] ?? m[2]!;
  const code = rank + suit;
  return isCardCode(code) ? code : null;
}

export interface ParsedLog { commitment: string | null; commitmentLine: number; firstActionLine: number; board: string[]; shown: string[] }

/** Extract what the verifier needs from a hand log (SPEC 15.2 / 20.5 line formats). */
export function parseHandLog(lines: readonly string[]): ParsedLog {
  const out: ParsedLog = { commitment: null, commitmentLine: -1, firstActionLine: -1, board: [], shown: [] };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (out.commitment === null) {
      const m = /commitment.{0,40}?\b([0-9a-f]{64})\b/i.exec(line);
      if (m) { out.commitment = m[1]!.toLowerCase(); out.commitmentLine = i; }
    }
    if (out.firstActionLine < 0 && /^(Your hand is|"?.*"? posts |Flop|Turn|River)/.test(line)) out.firstActionLine = i;
    if (/^(Flop|Turn|River)/.test(line)) {
      // the NEW cards of the street are the bracketed group: "Flop:  [7♠, 9♣, 5♦]", "Turn: 7♠, 9♣, 5♦ [9♠]"
      const br = /\[([^\]]*)\]/.exec(line);
      if (br) for (const t of br[1]!.split(",")) { const c = parseCardToken(t); if (c) out.board.push(c); }
    }
    const sh = /\bshows? an? ([^.]*)\./.exec(line);
    if (sh) for (const t of sh[1]!.split(",")) { const c = parseCardToken(t); if (c) out.shown.push(c); }
  });
  return out;
}

const c = (id: string, title: string, status: CheckStatus, detail: string): Check => ({ id, title, status, detail });

function usageBoard(usage: readonly FairnessUsage[], cardAt: Map<number, string>): { indices: number[]; known: string[] } {
  const indices = usage.filter((u) => u.kind === "board" && !u.rabbit).flatMap((u) => u.indices);
  return { indices, known: indices.map((i) => cardAt.get(i)).filter((x): x is string => !!x) };
}

/** Run every check of FAIRNESS-MERKLE item 9 for one hand. */
export function verifyHand(inp: VerifyInput): HandVerdict {
  const { record, gameId, handNumber } = inp;
  const checks: Check[] = [];
  const rev: FairnessReveal | null = record.reveal;

  // commitment well-formed
  const shapeOk = HEX64.test(record.commitment) && HEX64.test(record.prevCommitment) && HEX64.test(record.root);
  checks.push(c("format", "Published commitment is well-formed", shapeOk ? "pass" : "fail", shapeOk ? "commitment, previous commitment and Merkle root are 64-digit SHA-256 values." : "A published value is not a 64-digit hexadecimal SHA-256."));

  // log: commitment printed BEFORE the hand
  const log = inp.logLines ? parseHandLog(inp.logLines) : null;
  if (!log) checks.push(c("log-commit", "Commitment appears in the hand log before any card", "skip", "No hand log available (it needs a seat or the log to be pasted)."));
  else if (!log.commitment) checks.push(c("log-commit", "Commitment appears in the hand log before any card", "fail", "The hand log has no commitment line."));
  else {
    const before = log.firstActionLine < 0 || log.commitmentLine < log.firstActionLine;
    const same = log.commitment === record.commitment;
    checks.push(c("log-commit", "Commitment appears in the hand log before any card", same && before ? "pass" : "fail",
      !same ? `The log shows ${log.commitment} but the server now publishes ${record.commitment}.` : before ? "The log line matches and sits before the first hole card / blind." : "The commitment line is logged after the hand started."));
  }

  // chain
  if (inp.firstHand || handNumber === 1) {
    const ok = record.prevCommitment === GENESIS_PREV_COMMITMENT;
    checks.push(c("chain", "Chained to the previous hand", ok ? "pass" : "fail", ok ? "First hand of the table: previous commitment is 64 zeros." : "First hand must chain to 64 zeros."));
  } else if (inp.prevRecord) {
    const ok = inp.prevRecord.commitment === record.prevCommitment;
    checks.push(c("chain", "Chained to the previous hand", ok ? "pass" : "fail", ok ? `Previous hand #${handNumber - 1} commitment equals this hand's prevCommitment.` : `Previous hand #${handNumber - 1} published ${inp.prevRecord.commitment}, this hand claims ${record.prevCommitment}.`));
  } else checks.push(c("chain", "Chained to the previous hand", "skip", "The previous hand's record could not be loaded."));

  if (!rev) {
    checks.push(c("revealed", "Hand revealed", "skip", "This hand's cards are published when its result window closes. The commitment above is already fixed."));
    const failed = checks.some((k) => k.status === "fail");
    return { overall: failed ? "FAIL" : "PENDING", checks };
  }

  // reveal belongs to this record
  const sameIds = rev.gameId === gameId && rev.handNumber === handNumber && rev.commitment === record.commitment && rev.prevCommitment === record.prevCommitment && rev.root === record.root;
  checks.push(c("identity", "Reveal belongs to the committed hand", sameIds ? "pass" : "fail", sameIds ? `Table ${rev.gameId}, hand #${rev.handNumber}, id ${rev.handId}.` : "The reveal's table, hand number, commitment or root differs from the published commitment."));

  // commitment = H(prev, root)
  const recomputed = computeCommitmentSync({ gameId: rev.gameId, handNumber: rev.handNumber, handId: rev.handId, prevCommitment: rev.prevCommitment, root: rev.root });
  checks.push(c("hash", "Commitment recomputes from previous commitment + Merkle root", recomputed === record.commitment ? "pass" : "fail", recomputed === record.commitment ? "SHA-256(PT1C|table|hand|id|previous|root) equals the commitment logged before the hand." : `Recomputed ${recomputed}, published ${record.commitment}.`));

  // cards: shape + duplicates
  const cardAt = new Map<number, string>();
  let shapeBad: string | null = null; let conflict: string | null = null; const seenCodes = new Map<string, number>();
  for (const r of rev.cards) {
    if (!Number.isInteger(r.index) || r.index < 0 || r.index > 51 || !isCardCode(r.card) || !HEX64.test(r.salt) || r.proof.length !== 6 || !r.proof.every((p) => HEX64.test(p))) shapeBad = shapeBad ?? `index ${r.index}`;
    const prior = cardAt.get(r.index);
    if (prior !== undefined && prior !== r.card) conflict = conflict ?? `index ${r.index} revealed as ${prior} and ${r.card}`;
    cardAt.set(r.index, r.card);
    const at = seenCodes.get(r.card);
    if (at !== undefined && at !== r.index) conflict = conflict ?? `${r.card} revealed at positions ${at} and ${r.index}`;
    seenCodes.set(r.card, r.index);
  }
  checks.push(c("cards", "Revealed cards are consistent", !shapeBad && !conflict ? "pass" : "fail", shapeBad ? `Malformed revealed card (${shapeBad}).` : conflict ?? `${rev.cards.length} cards revealed, no deck position or card appears twice.`));

  // proofs
  let bad: number[] = [];
  if (!shapeBad) {
    for (const r of rev.cards) {
      const leaf = computeLeaf(rev.gameId, rev.handNumber, rev.handId, r.index, r.card, r.salt);
      if (foldProof(leaf, r.index, r.proof) !== record.root) bad.push(r.index);
    }
  } else bad = rev.cards.map((r) => r.index);
  checks.push(c("proofs", "Every revealed card sat at its position in the committed deck", bad.length === 0 ? "pass" : "fail", bad.length === 0 ? "Each leaf (card + salt + position) folds through its proof to the committed Merkle root." : `Proof fails for deck position(s) ${bad.join(", ")}.`));

  // usage structure
  const idxSeen = new Set<number>(); let usageErr: string | null = null;
  for (const u of rev.usage) for (const ix of u.indices) {
    if (!Number.isInteger(ix) || ix < 0 || ix > 51 || idxSeen.has(ix)) usageErr = usageErr ?? `deck position ${ix} is invalid or used twice`;
    idxSeen.add(ix);
  }
  const unaccounted = rev.cards.filter((r) => !idxSeen.has(r.index)).map((r) => r.index);
  if (!usageErr && unaccounted.length) usageErr = `revealed position(s) ${unaccounted.join(", ")} are not in the deal map`;
  checks.push(c("usage", "Deal map is consistent with the revealed cards", usageErr ? "fail" : "pass", usageErr ?? `${idxSeen.size} distinct deck positions were dealt; every revealed card was actually dealt.`));

  // board vs log
  const board = usageBoard(rev.usage, cardAt);
  if (!log) checks.push(c("log-board", "Revealed cards match the hand log", "skip", "No hand log available to compare."));
  else {
    const logBoard = [...new Set(log.board)]; const revBoard = [...new Set(board.known)];
    const missing = logBoard.filter((x) => !revBoard.includes(x));
    const extra = revBoard.filter((x) => !logBoard.includes(x));
    const shownBad = log.shown.filter((x) => ![...cardAt.values()].includes(x));
    const ok = missing.length === 0 && extra.length === 0 && shownBad.length === 0;
    checks.push(c("log-board", "Revealed cards match the hand log", ok ? "pass" : "fail",
      ok ? `Board (${logBoard.length}) and ${log.shown.length} shown hole card(s) in the log are all revealed from the committed deck.` :
        [missing.length ? `Logged but not proven: ${missing.join(" ")}.` : "", extra.length ? `Revealed board cards missing from the log: ${extra.join(" ")}.` : "", shownBad.length ? `Shown but not proven: ${shownBad.join(" ")}.` : ""].filter(Boolean).join(" ")));
  }

  // timing
  if (typeof record.committedAtMs === "number" && typeof rev.revealedAtMs === "number") {
    const ok = record.committedAtMs <= rev.revealedAtMs;
    checks.push(c("timing", "Commitment was published before the reveal", ok ? "pass" : "fail", ok ? `Committed ${new Date(record.committedAtMs).toISOString()}, revealed ${new Date(rev.revealedAtMs).toISOString()}.` : "The reveal is older than the commitment."));
  }

  const failed = checks.some((k) => k.status === "fail");
  return { overall: failed ? "FAIL" : "PASS", checks };
}

/** Chain check across hands 1..n: each prevCommitment equals the previous commitment. Returns the first broken hand or null. */
export function checkChain(records: readonly (FairnessRecord | null)[]): { ok: boolean; checked: number; brokenAt: number | null; missing: number[] } {
  let prev: string = GENESIS_PREV_COMMITMENT; let checked = 0; const missing: number[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r) { missing.push(i + 1); prev = ""; continue; }
    if (prev !== "" && r.prevCommitment !== prev) return { ok: false, checked, brokenAt: i + 1, missing };
    prev = r.commitment; checked++;
  }
  return { ok: true, checked, brokenAt: null, missing };
}

/** Accept "https://host/games/ptlXXXX", "/games/ptlXXXX?x", or a bare id. */
export function parseGameRef(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = /\/games\/([A-Za-z0-9_-]+)/.exec(s);
  const id = m ? m[1]! : s;
  return /^[A-Za-z0-9_-]{3,64}$/.test(id) ? id : null;
}

/** Deck positions whose revealed (card, salt, proof) does not fold to the record's root (for per-card marks in the UI). */
export function failedProofIndices(record: FairnessRecord): number[] {
  const rev = record.reveal;
  if (!rev) return [];
  const bad: number[] = [];
  for (const r of rev.cards) {
    try {
      const leaf = computeLeaf(rev.gameId, rev.handNumber, rev.handId, r.index, r.card, r.salt);
      if (foldProof(leaf, r.index, r.proof) !== record.root) bad.push(r.index);
    } catch { bad.push(r.index); }
  }
  return bad;
}
