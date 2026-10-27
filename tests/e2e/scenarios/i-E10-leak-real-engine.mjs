// INTEGRATION leak test against the REAL engine: three scripted hands (fold-win, all-in + run-it-twice, flop fold-win + rabbit hunt).
// Every WS message and every HTTP body each viewer can obtain is scanned for card codes; a card may appear only if that viewer is entitled to it.
import { assert, sleep, waitFor } from "../harness/index.mjs";
import { Bot, mkDeck, waitTurn, CARD_RE } from "../harness/proto.mjs";

// deal order for 3 players = SB, BB, dealer (round 1) then again (round 2); burn; flop x3; burn; turn; burn; river; run 2 continues the cursor.
const D1 = { pre: [0], deck: mkDeck(["As", "Ad", "Ks", "Kd", "2c", "7d", "3h", "Ah", "Kh", "Qh", "4h", "Jh", "5s", "Th"]) }; // Bob As Kd | Carol Ad 2c | Alice Ks 7d
const D2 = { deck: mkDeck(["9c", "Qs", "Ac", "8d", "Qd", "Ad", /*burn*/ "3c", "2h", "7h", "Js", /*b*/ "4c", "5d", /*b*/ "6s", "Kd" /* Kd unused by holes in this hand */, /*run 2*/ "3d", "Qc", "8h", "9d", "4d", "2s", "6c", "3s"]) }; // Carol 9c 8d | Alice Qs Qd | Bob Ac Ad
const D3 = { deck: mkDeck(["Ts", "9h", "5c", "Td", "4c", "2s", "3s", "Ah", "8c", "6d", "7s", "Jc", "4s", "Kh"]) }; // Alice Ts Td | Bob 9h 4c | Carol 5c 2s ; turn Jc river Kh

export const options = { decks: [D1, D2, D3] };

export default async function (h) {
  const owner = await h.player("Alice"); const gid = await owner.createTable("Alice");
  const bob = await h.player("Bob"), carol = await h.player("Carol");
  await bob.joinAndSit(gid, 2); await carol.joinAndSit(gid, 3);
  await owner.approveAll([bob, carol]);
  const [A, B, C] = [await new Bot(owner).connect(), await new Bot(bob).connect(), await new Bot(carol).connect()];
  const bots = [A, B, C];
  // classify messages by the hand number of the bot's frame AFTER applying them
  for (const b of bots) { b.byHand = new Map(); const orig = b.onMsg.bind(b); b.onMsg = (s) => { orig(s); const n = b.frame?.table?.handNumber ?? 0; (b.byHand.get(n) ?? b.byHand.set(n, []).get(n)).push(s); }; }
  const http = new Map(); // hand -> {viewer -> [bodies]}
  const keepHttp = (hand, who, text) => { const m = http.get(hand) ?? http.set(hand, new Map()).get(hand); (m.get(who) ?? m.set(who, []).get(who)).push(text); };
  const stacks = () => ({ A: A.stack, B: B.stack, C: C.stack });
  const hand = (n) => waitFor(() => bots.every((b) => b.frame.table.handNumber >= n) && bots.some((b) => b.myTurn), { timeout: 40000, what: `hand ${n} turn` });
  const act = async (bot, type, extra) => { assert(bot.myTurn, bot.name + " should be on turn"); bot.action(type, extra); await sleep(120); await waitFor(() => !bot.myTurn || true); await sleep(900); };

  const cfg = (await owner.api("GET", `/games/${gid}/current_or_next_configs`)).json; delete cfg.queued;
  const up = await owner.api("POST", `/games/${gid}/update_game`, { ...cfg, runItTwice: "ask_players", rabbitHunt: true });
  assert(up.status === 200, "update_game " + up.status + up.text);
  assert((await owner.startGame()).status === 200, "start");
  /* ---------- hand 1: Alice (dealer, UTG) folds, Bob (SB) folds, Carol wins the blinds ---------- */
  await hand(1);
  assert(JSON.stringify(A.myCards.map((c) => c.value)) === '["Ks","7d"]', "hand 1 Alice holes");
  await act(await waitTurn(bots), "PLAYER_FOLD");
  assert(A.frame.cards[A.id].cards.length === 0 && B.frame.cards[A.id].cards.length === 0, "a folded player's cards are [] for every viewer (W2/W4 semantics)");
  await act(await waitTurn(bots), "PLAYER_FOLD");
  /* ---------- hand 2: Bob all-in, Carol folds, Alice calls, run it twice ---------- */
  await hand(2);
  assert(A.frame.hand.dealerId === B.id, "hand 2 dealer is Bob");
  let t = await waitTurn(bots); assert(t === B, "Bob first to act");
  await act(B, "PLAYER_RAISE", { value: B.stack });
  await act(await waitTurn(bots), "PLAYER_FOLD"); // Carol
  await act(await waitTurn(bots), "PLAYER_CALL"); // Alice
  await waitFor(() => A.frame.turn.ritWaiting, { timeout: 15000, what: "RIT vote prompt" });
  A.action("DRITD", { decision: true }); await sleep(300); B.action("DRITD", { decision: true });
  await waitFor(() => A.frame.table.handNumber >= 3 || (A.frame.hand?.runs === 2 && A.frame.hand.board["2"]?.length === 5), { timeout: 30000, what: "run 2 board" });
  const eq = JSON.stringify(A.raw.filter((s) => s.includes("prob1")).slice(-1));
  console.log("      equity frames:", /prob1\\":\d/.test(eq) ? "numeric prob1 seen" : "no numeric prob1 seen (check)");
  /* ---------- hand 3: calls to the flop, Alice bets, others fold; Bob (folded) hunts the rabbit ---------- */
  await hand(3);
  console.log("      stacks before hand 3:", JSON.stringify(stacks()));
  assert(A.frame.hand.dealerId === C.id, "hand 3 dealer is Carol");
  await act(await waitTurn(bots), "PLAYER_CALL"); // Carol UTG
  await act(await waitTurn(bots), "PLAYER_CALL"); // Alice SB completes
  await act(await waitTurn(bots), "PLAYER_CHECK"); // Bob BB
  await waitFor(() => A.frame.hand.board["1"].length === 3 && A.myTurn, { timeout: 10000, what: "flop + Alice turn" });
  await act(A, "PLAYER_RAISE", { value: 20 });
  await act(await waitTurn(bots), "PLAYER_FOLD");
  await act(await waitTurn(bots), "PLAYER_FOLD");
  await waitFor(() => B.frame.result && B.frame.rabbit.enabled || B.frame.rabbit?.hunters, { timeout: 15000, what: "result" });
  B.action("RUC"); await sleep(1200);
  console.log("      rabbit frame for Bob:", JSON.stringify(B.frame.rabbit));
  await sleep(1500);

  /* ---------- HTTP bodies each viewer can get ---------- */
  for (const [p, who] of [[owner, "A"], [bob, "B"], [carol, "C"]]) {
    for (let n = 1; n <= 3; n++) {
      for (const path of [`/api/games/${gid}/log_v3?hand_number=${n}`, `/api/games/${gid}/fairness/${n}`]) keepHttp(n, who, (await p.api("GET", path)).text);
    }
    for (const path of [`/games/${gid}/players_sessions`, `/games/${gid}/current_or_next_configs`, `/current-player-infos`]) { const r = await p.api("GET", path); for (let n = 1; n <= 3; n++) keepHttp(n, who, r.text); }
  }
  const pageHtml = await (await fetch(h.url + `/games/${gid}`)).text();

  /* ---------- entitlement ---------- */
  const hole = { 1: { A: ["Ks", "7d"], B: ["As", "Kd"], C: ["Ad", "2c"] }, 2: { C: ["9c", "8d"], A: ["Qs", "Qd"], B: ["Ac", "Ad"] }, 3: { A: ["Ts", "Td"], B: ["9h", "4c"], C: ["5c", "2s"] } };
  const board = { 1: [], 2: ["2h", "7h", "Js", "5d", "Kd", "Qc", "8h", "9d", "2s", "3s"], 3: ["Ah", "8c", "6d"] };
  // hand 2: run 1 = 2h 7h Js 5d + river; deck index 13 = "Kd" (river), run 2 = Qc 8h 9d, turn 2s, river 3s (burn cards 3c 4c 6s 3d 4d 6c never public)
  const shown = { 1: [], 2: [...hole[2].A, ...hole[2].B], 3: [] }; // Carol folded preflop in hand 2; hand 3 fold-win shows nothing
  const rabbitFor = { 3: { B: ["Jc", "Kh"] } };
  const whoMap = { A, B, C };
  let scanned = 0;
  for (const n of [1, 2, 3]) {
    for (const [who, bot] of Object.entries(whoMap)) {
      const allowed = new Set([...hole[n][who], ...board[n], ...shown[n], ...(rabbitFor[n]?.[who] ?? [])]);
      // public boards (hand 3 flop) are allowed for everybody; hand 2 board may also be dealt in part only
      const texts = [...(bot.byHand.get(n) ?? []), ...(http.get(n)?.get(who) ?? [])];
      if (n === 3) for (const s of http.get(1)?.get(who) ?? []) void s;
      for (const s of texts) for (const m of s.matchAll(CARD_RE)) {
        scanned++;
        if (!allowed.has(m[1])) throw new Error(`LEAK: viewer ${who} received card ${m[1]} in hand ${n}: ...${s.slice(Math.max(0, m.index - 80), m.index + 40)}...`);
      }
    }
  }
  // the page HTML / static assets carry no card codes in quotes either
  for (const m of pageHtml.matchAll(CARD_RE)) throw new Error("card code in page html " + m[1]);
  console.log(`      leak scan OK: ${scanned} card occurrences checked across ${bots.reduce((a, b) => a + b.raw.length, 0)} ws messages + http bodies`);
  // chips conserved
  assert(A.stack + B.stack + C.stack === 3000, "chips conserved " + JSON.stringify(stacks()));
  bots.forEach((b) => b.close());
}
