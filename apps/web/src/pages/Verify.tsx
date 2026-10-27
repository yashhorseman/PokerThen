import { useCallback, useEffect, useMemo, useState } from "react";
import type { FairnessRecord } from "@pokerthen/shared";
import { Icon, SuitIcon, type SuitKey } from "../art";
import { fetchFairness, fetchHandLog } from "./api";
import { HubShell } from "./HubShell";
import { PAGE_TITLES, usePageMeta } from "./usePageMeta";
import { checkChain, failedProofIndices, parseGameRef, verifyHand, type HandVerdict } from "./verify/check";
import "./fonts";

interface RunResult { gameId: string; hand: number; record: FairnessRecord; verdict: HandVerdict; logSource: "server" | "pasted" | "none" }
const SUIT_OF = (code: string) => code[1] as SuitKey;
const RANK_OF = (code: string) => (code[0] === "T" ? "10" : code[0]!);

function CardChip({ code }: { code: string }) {
  const s = SUIT_OF(code);
  return <span className="pt-mini-card pt-verify-card" style={{ color: s === "h" || s === "d" ? "#db3131" : "#2c2c2c" }}><b>{RANK_OF(code)}</b><SuitIcon suit={s} size="1em" /></span>;
}

/** `/verify` (SPEC 20.5 + docs/FAIRNESS-MERKLE.md 9 and 10). Verification runs entirely in this browser. */
export function Verify() {
  usePageMeta(PAGE_TITLES.verify);
  const params = useMemo(() => new URLSearchParams(typeof location !== "undefined" ? location.search : ""), []);
  const [ref, setRef] = useState(params.get("game") ?? "");
  const [handText, setHandText] = useState(params.get("hand") ?? "");
  const [paste, setPaste] = useState(false);
  const [recordText, setRecordText] = useState("");
  const [logText, setLogText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<RunResult | null>(null);
  const [chain, setChain] = useState<string | null>(null);

  const run = useCallback(async (gameRef: string, handStr: string, pastedRecord: string, pastedLog: string) => {
    setError(null); setRes(null); setChain(null);
    const gameId = parseGameRef(gameRef);
    const hand = Number(handStr);
    if (!gameId) { setError("Enter a table link or table id."); return; }
    if (!Number.isInteger(hand) || hand < 1) { setError("Enter a hand number (1 or higher)."); return; }
    setBusy(true);
    try {
      let record: FairnessRecord | null;
      if (pastedRecord.trim()) {
        try { record = JSON.parse(pastedRecord) as FairnessRecord; } catch { setError("The pasted record is not valid JSON."); return; }
      } else record = await fetchFairness(gameId, hand);
      if (!record) { setError(`No record for hand #${hand} of this table.`); return; }
      let logLines: string[] | null = null; let logSource: RunResult["logSource"] = "none";
      if (pastedLog.trim()) { logLines = pastedLog.split(/\r?\n/); logSource = "pasted"; }
      else { logLines = await fetchHandLog(gameId, hand); if (logLines) logSource = "server"; }
      let prev: FairnessRecord | null = null;
      if (hand > 1) { try { prev = await fetchFairness(gameId, hand - 1); } catch { prev = null; } }
      const verdict = verifyHand({ gameId, handNumber: hand, record, prevRecord: prev, firstHand: hand === 1, logLines });
      setRes({ gameId, hand, record, verdict, logSource });
    } catch (e) {
      setError(e instanceof Error ? `Could not load the record (${e.message}).` : "Could not load the record.");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (params.get("game") && params.get("hand")) void run(params.get("game")!, params.get("hand")!, "", ""); }, [params, run]);

  async function runChain() {
    const gameId = parseGameRef(ref) ?? res?.gameId;
    if (!gameId) return;
    setChain("Checking...");
    const recs: (FairnessRecord | null)[] = [];
    try {
      for (let n = 1; n <= 500; n++) { const r = await fetchFairness(gameId, n); if (!r) break; recs.push(r); }
    } catch (e) { setChain(`Could not load all hands (${e instanceof Error ? e.message : "error"}).`); return; }
    if (recs.length === 0) { setChain("No hands found for this table."); return; }
    const c = checkChain(recs);
    setChain(c.ok ? `PASS: ${c.checked} hands, every commitment is chained to the one before it.` : `FAIL: hand #${c.brokenAt} does not chain to hand #${(c.brokenAt ?? 1) - 1}.`);
  }

  const revealedCards = res?.record.reveal?.cards ?? [];
  const failedProofs = new Set<number>(res ? failedProofIndices(res.record) : []);
  const v = res?.verdict;

  return (
    <HubShell active="none" title="Verify a hand" icon="shield">
      <article className="pt-doc pt-verify">
        <h1>Verify a hand</h1>
        <p className="pt-lead">Before a hand is dealt, PokerThen publishes a fingerprint of the shuffled deck. Afterwards it publishes proof for the cards that were shown. This page checks that the two match, in your browser.</p>

        <form className="pt-verify-form" onSubmit={(e) => { e.preventDefault(); void run(ref, handText, paste ? recordText : "", paste ? logText : ""); }}>
          <label>Table link or id<input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="https://.../games/ptl..." autoCapitalize="off" spellCheck={false} /></label>
          <label className="pt-hand-field">Hand number<input value={handText} onChange={(e) => setHandText(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="1" /></label>
          <button type="submit" className="hub-home__btn start pt-load-btn" disabled={busy}>{busy ? "Loading..." : "Load"}</button>
        </form>
        <button type="button" className="pt-link-btn" onClick={() => setPaste((p) => !p)} aria-expanded={paste}>{paste ? "Hide pasted data" : "Or paste the record and log yourself"}</button>
        {paste && (
          <div className="pt-paste">
            <label>Fairness record (JSON from <code>/api/games/&lt;table&gt;/fairness/&lt;hand&gt;</code>)<textarea value={recordText} onChange={(e) => setRecordText(e.target.value)} rows={6} spellCheck={false} /></label>
            <label>Hand log (optional, one line per row; also checks the logged commitment and shown cards)<textarea value={logText} onChange={(e) => setLogText(e.target.value)} rows={6} spellCheck={false} /></label>
          </div>
        )}
        {error && <div className="pt-verify-error" role="alert">{error}</div>}

        {res && v && (
          <section className="pt-result" aria-live="polite">
            <div className={`pt-verdict ${v.overall.toLowerCase()}`}>
              <Icon name={v.overall === "PASS" ? "check" : v.overall === "FAIL" ? "close" : "clock"} size={26} />
              <div>
                <div className="pt-verdict-word">{v.overall === "PENDING" ? "NOT REVEALED YET" : v.overall}</div>
                <div className="pt-verdict-sub">Hand #{res.hand} of table {res.gameId}{res.logSource === "none" ? " (hand log not available, log checks skipped)" : ""}</div>
              </div>
            </div>
            <ul className="pt-checks">
              {v.checks.map((c) => (
                <li key={c.id} className={c.status}>
                  <span className="pt-check-mark"><Icon name={c.status === "pass" ? "check" : c.status === "fail" ? "close" : "minus"} size={16} /></span>
                  <span><b>{c.title}</b><small>{c.detail}</small></span>
                </li>
              ))}
            </ul>
            <dl className="pt-facts">
              <dt>Commitment</dt><dd><code>{res.record.commitment}</code></dd>
              <dt>Previous hand</dt><dd><code>{res.record.prevCommitment}</code></dd>
              <dt>Merkle root</dt><dd><code>{res.record.root}</code></dd>
            </dl>
            {revealedCards.length > 0 && (
              <>
                <h3>Cards revealed for this hand ({revealedCards.length})</h3>
                <ul className="pt-revealed">
                  {[...revealedCards].sort((a, b) => a.index - b.index).map((r) => (
                    <li key={r.index} className={failedProofs.has(r.index) ? "bad" : ""}>
                      <span className="pt-pos">#{r.index}</span><CardChip code={r.card} />
                    </li>
                  ))}
                </ul>
                <p className="pt-note">Folded, mucked, burned and undealt cards are never published.</p>
              </>
            )}
          </section>
        )}

        <div className="pt-chain">
          <button type="button" className="pt-link-btn" onClick={() => void runChain()} disabled={!parseGameRef(ref) && !res}>Check the chain across all hands of this table</button>
          {chain && <div className={`pt-chain-result ${chain.startsWith("PASS") ? "pass" : chain.startsWith("FAIL") ? "fail" : ""}`}>{chain}</div>}
        </div>

        <h2>How it works</h2>
        <ol className="pt-steps">
          <li>The server shuffles the 52 cards and gives every deck position its own secret salt. Each (position, card, salt) is hashed; the hashes are combined into one Merkle root.</li>
          <li>The commitment is the hash of the table, hand number, the previous hand's commitment and that root. It appears in the hand log before any card is dealt, and each hand is chained to the one before.</li>
          <li>When the hand ends, every card that was shown to anyone is published with its salt and a short proof. This page recomputes each leaf, folds the proof up to the root and checks the commitment, the chain and the hand log.</li>
        </ol>
        <p className="pt-honest"><b>What this proves, and what it does not.</b> The proof shows that the order of the deck was fixed before anyone saw a card and that every card shown came from that deck. It cannot by itself prove the shuffle was uniformly random; that is guaranteed by the open-source Fisher-Yates shuffle with rejection sampling and its tests.</p>
      </article>
    </HubShell>
  );
}
