// (7) fairness, offline part: shuffle statistics through the PRODUCTION entropy path, rejection sampling, Merkle/commit tamper tests against
// shared verifyReveal (used by scripts/verify-hand.ts) AND the /verify page logic (apps/web/src/pages/verify/check.ts).
//   node --import tsx tests/security/s07-fairness.mjs        (PT_ROOT to audit a snapshot)
import { randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { importFromRoot, mkTmp, ROOT } from "./lib/harness.mjs";
import { ok, defect, info, section, finish } from "./lib/t.mjs";

const sh = await importFromRoot("packages/shared/src/index.ts");
const eng = await importFromRoot("packages/engine/src/rng.ts");
const fair = await importFromRoot("packages/engine/src/fairness.ts");
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../.."); // web page logic and the CLI always come from the real repo
const web = await import(pathToFileURL(join(REPO, "apps/web/src/pages/verify/check.ts")).href);
// identical to apps/server/src/app.ts cryptoEntropy (that module is the one main.ts passes to the engine in production)
const cryptoEntropy = (n) => new Uint8Array(randomBytes(n));

/* ------------------------------------------------------------------ chi-square helpers */
function gammaP(a, x) { // regularized lower incomplete gamma
  if (x <= 0) return 0;
  const gln = lgamma(a);
  if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; } return sum * Math.exp(-x + a * Math.log(x) - gln); }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
}
function lgamma(z) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const cj of c) s += cj / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
const chiP = (chi, df) => 1 - gammaP(df / 2, chi / 2); // right-tail p-value

section("shuffle uniformity (production entropy path: crypto.randomBytes -> uniformInt -> Fisher-Yates)");
{
  const N = Number(process.env.SHUFFLES ?? 100000);
  const idx = new Map(sh.CANONICAL_DECK.map((c, i) => [c, i]));
  const cnt = Array.from({ length: 52 }, () => new Uint32Array(52));
  const pair = new Uint32Array(52 * 52); // (card at pos 0, card at pos 1)
  let fixed = 0, t0 = Date.now(), perm = true;
  for (let n = 0; n < N; n++) {
    const d = eng.shuffle(cryptoEntropy);
    if (n < 2000 && new Set(d).size !== 52) perm = false;
    for (let p = 0; p < 52; p++) { const c = idx.get(d[p]); cnt[p][c]++; if (c === p) fixed++; }
    pair[idx.get(d[0]) * 52 + idx.get(d[1])]++;
  }
  const e = N / 52; let minP = 1, worst = 0, sumChi = 0;
  const ps = [];
  for (let p = 0; p < 52; p++) { let chi = 0; for (let c = 0; c < 52; c++) chi += (cnt[p][c] - e) ** 2 / e; const pv = chiP(chi, 51); ps.push(pv); minP = Math.min(minP, pv); worst = Math.max(worst, chi); sumChi += chi; }
  // columns too (each card's position distribution)
  let minPc = 1; for (let c = 0; c < 52; c++) { let chi = 0; for (let p = 0; p < 52; p++) chi += (cnt[p][c] - e) ** 2 / e; minPc = Math.min(minPc, chiP(chi, 51)); }
  const ep = N / (52 * 51); let chiPair = 0; for (let a = 0; a < 52; a++) for (let b = 0; b < 52; b++) if (a !== b) chiPair += (pair[a * 52 + b] - ep) ** 2 / ep;
  const pPair = chiP(chiPair, 52 * 51 - 1);
  const expectedFixed = N; // 52 positions * N / 52
  const sdFixed = Math.sqrt(N * 52 * (1 / 52) * (51 / 52));
  info("shuffle sample", `${N} shuffles in ${((Date.now() - t0) / 1000).toFixed(1)} s; per-position chi2 (df=51) worst ${worst.toFixed(1)}, min p ${minP.toExponential(2)}; per-card min p ${minPc.toExponential(2)}; first-two-cards pair chi2 p=${pPair.toFixed(3)}; fixed points ${fixed} (expected ${expectedFixed} +- ${sdFixed.toFixed(0)})`);
  ok("every deck is a permutation of the 52 canonical cards", perm, "");
  ok("card-per-position: no position is non-uniform (min p > 0.0005, Bonferroni over 52 positions ~ 0.026)", minP > 0.0005, `min p=${minP}`);
  ok("position-per-card: uniform as well", minPc > 0.0005, `min p=${minPc}`);
  ok("joint distribution of the first two cards is uniform (p > 0.001)", pPair > 0.001, `p=${pPair}`);
  ok("fixed-point count is binomial (rules out Sattolo / off-by-one swaps)", Math.abs(fixed - expectedFixed) < 5 * sdFixed, `${fixed}`);
}

section("rejection sampling");
{
  // scripted entropy: returns the given 32-bit big-endian words, then throws
  const script = (words) => { const q = [...words]; let calls = 0; const f = (n) => { calls++; const w = q.shift(); if (w === undefined) throw new Error("entropy exhausted"); const b = Buffer.alloc(n); b.writeUInt32BE(w, 0); return new Uint8Array(b); }; f.calls = () => calls; return f; };
  for (const n of [2, 3, 7, 10, 26, 51, 52, 1000]) {
    const limit = Math.floor(2 ** 32 / n) * n;
    const e1 = script([limit - 1]); const v = eng.uniformInt(e1, n);
    ok(`n=${n}: u=limit-1 accepted (u % n = ${(limit - 1) % n})`, v === (limit - 1) % n && e1.calls() === 1, `got ${v}`);
    if (limit < 2 ** 32) { const e2 = script([limit, 2 ** 32 - 1, 5]); const w = eng.uniformInt(e2, n); ok(`n=${n}: u=limit and u=2^32-1 are rejected and redrawn`, w === 5 % n && e2.calls() === 3, `got ${w} after ${e2.calls()} draws`); }
  }
  ok("n=1 consumes no entropy; n<1, n>2^32, 1.5 and NaN throw", eng.uniformInt(script([]), 1) === 0 && [0, -1, 2 ** 32 + 1, 1.5, NaN].every((n) => { try { eng.uniformInt(script([1]), n); return false; } catch { return true; } }), "");
  // exhaustive: for n=52 every residue has exactly limit/n preimages below the limit
  const limit = Math.floor(2 ** 32 / 52) * 52; ok("n=52: 4294967296 - limit = 48 rejected values, accepted range divisible by 52", 2 ** 32 - limit === 48 && limit % 52 === 0, `limit=${limit}`);
  // entropy shorter than requested is refused
  ok("short entropy is refused (never silently padded)", (() => { try { eng.uniformInt(() => new Uint8Array(2), 52); return false; } catch { return true; } })() && (() => { try { eng.newSalt(() => new Uint8Array(8)); return false; } catch { return true; } })(), "");
  const salts = new Set(Array.from({ length: 2000 }, () => eng.newSalt(cryptoEntropy))); ok("2000 master salts are distinct 64-hex strings", salts.size === 2000 && [...salts].every((s) => /^[0-9a-f]{64}$/.test(s)), "");
}

section("Merkle commitment: honest records verify, every tamper is caught");
// build an honest hand (heads-up) with the ENGINE's code, then rebuild FairnessRecord objects the way the server serves them
const gameId = "ptlTESTTESTTESTTESTTEST1", handId = "abcdefghijkl";
const deck = eng.shuffle(cryptoEntropy), masterSalt = eng.newSalt(cryptoEntropy);
const prev = "0".repeat(64);
const mkUsage = () => [
  { kind: "hole", run: 1, street: 0, playerId: "AAAAAAAAAA", indices: [0] }, { kind: "hole", run: 1, street: 0, playerId: "BBBBBBBBBB", indices: [1] },
  { kind: "hole", run: 1, street: 0, playerId: "AAAAAAAAAA", indices: [2] }, { kind: "hole", run: 1, street: 0, playerId: "BBBBBBBBBB", indices: [3] },
  { kind: "burn", run: 1, street: 1, indices: [4] }, { kind: "board", run: 1, street: 1, indices: [5, 6, 7] }, { kind: "burn", run: 1, street: 2, indices: [8] }, { kind: "board", run: 1, street: 2, indices: [9] },
  { kind: "burn", run: 1, street: 3, indices: [10] }, { kind: "board", run: 1, street: 3, indices: [11] }
];
const exposed = [0, 2, 1, 3, 5, 6, 7, 9, 11];
function honest(d = deck, o = {}) {
  const base = { gameId, handNumber: 1, handId, prevCommitment: prev, deck: d, masterSalt, exposed, dealOrder: ["AAAAAAAAAA", "BBBBBBBBBB"], usage: mkUsage(), at: 2000, ...o };
  const rev = fair.buildReveal(base);
  return { gameId, handNumber: 1, handId, commitment: rev.commitment, prevCommitment: prev, root: rev.root, committedAtMs: 1000, reveal: rev };
}
const glyph = (c) => (c[0] === "T" ? "10" : c[0]) + { s: "♠", h: "♥", d: "♦", c: "♣" }[c[1]];
const logFor = (rec, d = deck) => [
  `-- starting hand #1 (id: ${handId})  No Limit Texas Hold'em (dealer: "A @ AAAAAAAAAA") --`, `Hand commitment (SHA-256): ${rec.commitment}`, `Your hand is ${glyph(d[0])}, ${glyph(d[2])}`,
  `"A @ AAAAAAAAAA" posts a small blind of 10`, `Flop:  [${[5, 6, 7].map((i) => glyph(d[i])).join(", ")}]`, `Turn: ${[5, 6, 7].map((i) => glyph(d[i])).join(", ")} [${glyph(d[9])}]`, `River: ${[5, 6, 7, 9].map((i) => glyph(d[i])).join(", ")} [${glyph(d[11])}]`,
  `"A @ AAAAAAAAAA" shows a ${glyph(d[0])}, ${glyph(d[2])}.`, `"B @ BBBBBBBBBB" shows a ${glyph(d[1])}, ${glyph(d[3])}.`
];
const cli = async (rec) => (await sh.verifyReveal(rec.reveal, { commitment: rec.commitment, prevCommitment: rec.prevCommitment })).every((c) => c.ok);
const page = (rec, extra = {}) => web.verifyHand({ gameId, handNumber: 1, record: rec, prevRecord: null, firstHand: true, logLines: logFor(extra.logRec ?? rec, extra.deck ?? deck), ...extra });
const clone = (x) => JSON.parse(JSON.stringify(x));
const flip = (hex) => (hex[0] === "0" ? "1" : "0") + hex.slice(1);
const swapCard = (c) => (c === "2s" ? "3s" : "2s");
const base = honest();
ok("honest hand: shared.verifyReveal (CLI) passes", await cli(base), "");
const hv = page(base); ok("honest hand: /verify logic passes", hv.overall === "PASS", hv.checks.filter((c) => c.status !== "pass").map((c) => c.id + ":" + c.detail).join("; "));
ok("reveal publishes only exposed positions and no deck / masterSalt", base.reveal.cards.map((c) => c.index).sort((a, b) => a - b).join() === [...exposed].sort((a, b) => a - b).join() && !JSON.stringify(base).includes(masterSalt) && !("deck" in base.reveal) && !("masterSalt" in base.reveal), "");
ok("per-card salts of UNEXPOSED positions are not derivable from the record", ![4, 8, 10, 12, 20, 51].some((i) => JSON.stringify(base).includes(sh.cardSalt(masterSalt, i))), "");
ok("sync engine hash == shared pure hash == WebCrypto hash", (await sh.computeCommitment({ gameId, handNumber: 1, handId, prevCommitment: prev, root: base.root })) === base.commitment && sh.computeCommitmentSync({ gameId, handNumber: 1, handId, prevCommitment: prev, root: base.root }) === base.commitment, "");

const tampers = [
  ["card value", (r) => { r.reveal.cards[0].card = swapCard(r.reveal.cards[0].card === "2s" ? "3s" : r.reveal.cards[0].card); }],
  ["salt", (r) => { r.reveal.cards[1].salt = flip(r.reveal.cards[1].salt); }],
  ["proof sibling", (r) => { r.reveal.cards[2].proof[3] = flip(r.reveal.cards[2].proof[3]); }],
  ["proof truncated", (r) => { r.reveal.cards[2].proof.pop(); }],
  ["merkle root (record + reveal)", (r) => { r.root = flip(r.root); r.reveal.root = r.root; }],
  ["prevCommitment (record + reveal)", (r) => { r.prevCommitment = flip(r.prevCommitment); r.reveal.prevCommitment = r.prevCommitment; }],
  ["commitment (record only)", (r) => { r.commitment = flip(r.commitment); }],
  ["commitment (record + reveal)", (r) => { r.commitment = flip(r.commitment); r.reveal.commitment = r.commitment; }],
  ["card index moved", (r) => { r.reveal.cards[4].index = 40; }],
  ["index out of range (52)", (r) => { r.reveal.cards[4].index = 52; }],
  ["same index twice, different cards", (r) => { r.reveal.cards.push({ ...r.reveal.cards[0], card: swapCard(r.reveal.cards[0].card) }); }],
  ["hand number", (r) => { r.reveal.handNumber = 2; }],
  ["game id", (r) => { r.reveal.gameId = "ptlOTHERTABLEOTHERTABL1"; }],
  ["handId", (r) => { r.reveal.handId = "zzzzzzzzzzzz"; }],
  ["usage: card dealt twice", (r) => { r.reveal.usage[5].indices = [0, 6, 7]; }]
];
const missedCli = [], missedPage = [];
for (const [name, fn] of tampers) {
  const r = clone(base); fn(r);
  const c = await cli(r).catch(() => false); const p = page(r).overall === "PASS";
  if (c) missedCli.push(name); if (p) missedPage.push(name);
  ok(`tamper '${name}': /verify page says FAIL`, !p, ""); ok(`tamper '${name}': CLI/shared verifyReveal says FAIL`, !c, "");
}
// a dishonest server that commits to a deck with a DUPLICATE card and deals it twice (valid proofs, valid commitment)
{
  const bad = [...deck]; const x = bad[5]; bad[6] = x; // same card at flop positions 5 and 6
  const rec = honest(bad);
  const c = await cli(rec); const p = page(rec, { deck: bad });
  ok("duplicate card at two deck positions: /verify page FAILs", p.overall === "FAIL", p.checks.find((k) => k.id === "cards")?.detail ?? "");
  defect("c-verify-duplicates.cli-duplicate-card", "c-verify-duplicates", !c, "scripts/verify-hand.ts (shared verifyReveal) PASSES a record where the same card is revealed at two deck positions: a rigged, non-permutation deck is not detected by the CLI");
}
// a dishonest server that rewrites history after publishing: the log line printed BEFORE the hand differs from what is served later
{
  const rec = honest(deck, { at: 5000 }); const forged = clone(rec); forged.commitment = flip(forged.commitment);
  const v = web.verifyHand({ gameId, handNumber: 1, record: forged, prevRecord: null, firstHand: true, logLines: logFor(rec) });
  ok("commitment in the pre-hand log != commitment served later -> /verify FAIL", v.overall === "FAIL" && v.checks.some((k) => k.id === "log-commit" && k.status === "fail"), "");
  const lines = logFor(rec).map((l) => l.replace(/Flop: .*/, "Flop:  [2♠, 3♠, 4♠]"));
  const v2 = web.verifyHand({ gameId, handNumber: 1, record: rec, prevRecord: null, firstHand: true, logLines: lines });
  ok("board in the log differs from the revealed board -> /verify FAIL", v2.overall === "FAIL" && v2.checks.some((k) => k.id === "log-board" && k.status === "fail"), "");
  const lines3 = logFor(rec).filter((l) => !/commitment/.test(l)); ok("log without a commitment line -> FAIL", web.verifyHand({ gameId, handNumber: 1, record: rec, prevRecord: null, firstHand: true, logLines: lines3 }).overall === "FAIL", "");
  const lines4 = logFor(rec); const ci = lines4.findIndex((l) => /commitment/.test(l)); const [cl] = lines4.splice(ci, 1); lines4.push(cl);
  ok("commitment logged AFTER the hand started -> FAIL", web.verifyHand({ gameId, handNumber: 1, record: rec, prevRecord: null, firstHand: true, logLines: lines4 }).overall === "FAIL", "");
  const hn = { ...rec, reveal: null }; ok("not yet revealed -> PENDING (not PASS)", web.verifyHand({ gameId, handNumber: 1, record: hn, prevRecord: null, firstHand: true, logLines: null }).overall === "PENDING", "");
}
section("chain");
{
  const r1 = honest(deck, {}), d2 = eng.shuffle(cryptoEntropy);
  const r2 = (() => { const rev = fair.buildReveal({ gameId, handNumber: 2, handId: "bbbbbbbbbbbb", prevCommitment: r1.commitment, deck: d2, masterSalt, exposed, dealOrder: [], usage: [], at: 1 }); return { gameId, handNumber: 2, handId: "bbbbbbbbbbbb", commitment: rev.commitment, prevCommitment: r1.commitment, root: rev.root, committedAtMs: 1, reveal: rev }; })();
  ok("chain of 2 honest hands passes", web.checkChain([r1, r2]).ok, "");
  const bad = clone(r1); bad.commitment = flip(bad.commitment);
  ok("altering an earlier commitment breaks the chain at the next hand", !web.checkChain([bad, r2]).ok && web.checkChain([bad, r2]).brokenAt === 2, "");
  ok("first hand must chain to 64 zeros", !web.checkChain([{ ...r1, prevCommitment: "1".repeat(64) }]).ok, "");
  const other = (() => { const rev = fair.buildReveal({ gameId: "ptlOTHER", handNumber: 1, handId, prevCommitment: prev, deck, masterSalt, exposed, dealOrder: [], usage: [], at: 1 }); return rev.commitment; })();
  ok("the same deck+salt on another table gives a different commitment (no cross-table replay)", other !== r1.commitment, "");
}
section("scripts/verify-hand.ts end to end");
{
  const dir = mkTmp("vh-");
  const run = (rec) => { const f = join(dir, "r.json"); writeFileSync(f, JSON.stringify(rec)); const r = spawnSync(process.execPath, ["--import", "tsx", join(REPO, "scripts/verify-hand.ts"), f], { cwd: REPO, encoding: "utf8" }); return r; };
  const good = run(base); ok("CLI: honest record exits 0", good.status === 0, good.stdout + good.stderr);
  const t = clone(base); t.reveal.cards[0].card = swapCard(t.reveal.cards[0].card === "2s" ? "3s" : t.reveal.cards[0].card);
  const badr = run(t); ok("CLI: tampered card exits non-zero with a FAIL line", badr.status === 1 && /FAIL/.test(badr.stdout), badr.stdout.slice(0, 200));
  const t2 = clone(base); t2.commitment = flip(t2.commitment); const r2 = run(t2); ok("CLI: tampered published commitment exits non-zero", r2.status === 1, "");
  info("CLI trust anchor", "the CLI checks the reveal against the commitment the SAME server serves; to detect rewritten history pass the commitment you saw in the hand log (proposal in c-verify-duplicates.md: --commitment/--prev flags).");
}
finish("s07-fairness");
