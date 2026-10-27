// (3) owner-only endpoints called by non-owners (seated player, pending guest, watcher, never-connected token, anonymous, owner of ANOTHER table,
//     former owner after a transfer) and IDOR across tables. Every refused call must leave the table state untouched.
import { Peer, WsConn, rawHttp, startServer, makeTable, newToken, sleep } from "./lib/harness.mjs";
import { ok, defect, info, section, finish, waitFor } from "./lib/t.mjs";

const S = await startServer();
const T = await makeTable(S, ["Alice", "Bob"]);
const gid = T.gameId;
const alice = T.owner, bob = T.players[1];
const carol = new Peer(S, "carol"); const carolWs = carol.ws(gid); await carolWs.registered();
await carol.ingress(gid, 4, "Carol");                       // pending request
const dave = new Peer(S, "dave"); const daveWs = dave.ws(gid); await daveWs.registered(); // plain watcher
const nobody = new Peer(S, "nobody");                        // valid token, never connected, no record on this table
const mal = new Peer(S, "mallory"); const malGame = await mal.newGame("Mallory"); const malWs = mal.ws(malGame); await malWs.registered(); // owner of ANOTHER table
const fcfg = (await alice.get(`/games/${gid}/current_or_next_configs`)).json; delete fcfg.queued;

const A = T.conns[0];
const snap = () => JSON.stringify({ t: { ...A.frame.table, spectatorCount: 0 }, seats: A.frame.seats, players: A.frame.players, hand: A.frame.hand?.handNumber ?? null });
const callers = [
  ["anonymous (no cookie)", (m, p, b) => rawHttp(S, { method: m, path: p, headers: { origin: S.origin, "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }), 403],
  ["fresh token, never connected", (m, p, b) => nobody.http(m, p, b), 403],
  ["watcher (connected, unseated)", (m, p, b) => dave.http(m, p, b), 403],
  ["pending guest (requested a seat)", (m, p, b) => carol.http(m, p, b), 403],
  ["seated non-owner (Bob)", (m, p, b) => bob.http(m, p, b), 403],
  ["owner of another table (Mallory)", (m, p, b) => mal.http(m, p, b), 403]
];
const ownerPosts = [
  ["approve_player", { playerID: carol.id }],
  ["reject_player", { playerID: carol.id }],
  ["remove_player", { playerID: bob.id }],
  ["transfer_ownership", { playerID: bob.id }],
  ["put_in_away_mode", { playerID: bob.id }],
  ["toggle_god_mode", { playerID: dave.id, allow: true }],
  ["update_player", { playerID: bob.id, stackChange: 500, stackChangeMode: "ADD" }],
  ["update_game", { ...fcfg, guestChat: false, blindLevels: [{ sb: 50, bb: 100, ante: null, durationMin: null }] }],
  ["start-game", {}],
  ["resolve_rebuy", { playerID: bob.id, approve: true, stack: 1000 }]
];

section("owner-only POST endpoints x non-owner callers");
let bad = 0, total = 0;
for (const [who, call, expected] of callers) {
  const before = snap();
  const statuses = [];
  for (const [ep, body] of ownerPosts) {
    const r = await call("POST", `/games/${gid}/${ep}`, body);
    total++;
    statuses.push(r.status);
    if (r.status !== expected) { bad++; ok(`${who}: POST ${ep} -> ${expected}`, false, `got ${r.status} ${r.text.slice(0, 80)}`); }
  }
  await sleep(80);
  ok(`${who}: all ${ownerPosts.length} owner POSTs refused (${[...new Set(statuses)].join(",")}) and table state unchanged`, statuses.every((s) => s === expected) && snap() === before, "");
}
ok(`summary: ${total - bad}/${total} refusals`, bad === 0, "");
const owned = [["GET players/:pid", `/games/${gid}/players/${bob.id}`]];
for (const [who, call] of callers) for (const [ep, path] of owned) { const r = await call("GET", path); ok(`${who}: ${ep} -> 403`, r.status === 403, `${r.status}`); }

section("owner-only WebSocket actions from non-owners (no ack: state must simply not change)");
{
  const st = await alice.post(`/games/${gid}/start-game`, {});
  ok("positive control: owner starts the hand", st.status === 200, `${st.status} ${st.text.slice(0, 60)}`);
}
// Alice + Bob are seated; start-game should have worked above (2 eligible). Re-check and wait for the hand.
await waitFor(() => A.frame.hand && A.frame.table.status === "inProgress", { timeout: 4000, what: "hand running" }).catch(() => {});
{
  const before = JSON.stringify({ p: A.frame.table.pausedAt, s: A.frame.table.stopQueued, st: A.frame.table.status, hn: A.frame.table.handNumber });
  for (const [who, ws] of [["Bob (seated)", T.conns[1]], ["Carol (pending)", carolWs], ["Dave (watcher)", daveWs]]) {
    for (const a of [["UP"], ["UR"], ["TSG", { decision: true }], ["NH"], ["RS"]]) ws.action(a[0], a[1] ?? {});
  }
  await sleep(600);
  const after = JSON.stringify({ p: A.frame.table.pausedAt, s: A.frame.table.stopQueued, st: A.frame.table.status, hn: A.frame.table.handNumber });
  ok("UP / UR / TSG / NH / RS from Bob, Carol, Dave are ignored (pause, stop, next-hand, shuffle unchanged)", before === after && A.chainBreaks === 0, `${before} vs ${after}`);
  // acting out of turn / as a watcher
  const handBefore = JSON.stringify(A.frame.hand);
  daveWs.action("PLAYER_FOLD"); daveWs.action("PLAYER_RAISE", { value: 100 }); carolWs.action("PLAYER_CALL"); carolWs.action("SHOW_HAND", { cardToShow: "all" }); daveWs.action("DRITD", { decision: true });
  await sleep(400);
  ok("betting actions by watchers/pending players do nothing", JSON.stringify(A.frame.hand) === handBefore, "");
  // positive control: the owner can pause and resume
  A.action("UP"); await waitFor(() => A.frame.table.pausedAt, { timeout: 2000, what: "pause" }).catch(() => {});
  ok("positive control: owner UP pauses", !!A.frame.table.pausedAt, "");
  A.action("UR"); await waitFor(() => !A.frame.table.pausedAt, { timeout: 2000, what: "resume" }).catch(() => {});
  ok("positive control: owner UR resumes", !A.frame.table.pausedAt, "");
}

section("IDOR across tables");
{
  const other = new Peer(S, "other-owner"); const og = await other.newGame("Zed"); const ow = other.ws(og); await ow.registered();
  const before = JSON.stringify(ow.frame.table);
  // Alice (owner of table 1) uses her cookie against table 2's id; Mallory uses hers against table 1 (already covered); and path-confusion variants
  for (const ep of ["approve_player", "remove_player", "transfer_ownership", "toggle_god_mode", "update_player", "update_game", "start-game"]) {
    const r = await alice.post(`/games/${og}/${ep}`, { playerID: other.id, allow: true, stackChange: 1, stackChangeMode: "ADD", ...fcfg });
    ok(`Alice (owner of table 1) cannot ${ep} on table 2`, r.status === 403, `${r.status}`);
  }
  await sleep(100);
  ok("table 2 untouched", JSON.stringify(ow.frame.table) === before, "");
  // an id that belongs to table 1 sent to table 2 as playerID
  const r = await other.post(`/games/${og}/transfer_ownership`, { playerID: alice.id });
  ok("owner of table 2 cannot hand it to a player id that exists only on table 1 (no record)", r.status === 400 || r.status === 403, `${r.status}`);
  // reading another table with a valid-but-foreign token
  const probes = [`/games/${gid}/players_sessions`, `/games/${gid}/players_sessions/${bob.id}`, `/games/${gid}/current_or_next_configs`, `/api/games/${gid}/log_v3?hand_number=1`, `/games/${gid}/ledger_${gid}.csv`, `/games/${gid}/pokerthen_log_${gid}.csv`];
  const results = {};
  for (const p of probes) results[p.replace(gid, ":id").replace(bob.id, ":pid")] = (await nobody.get(p)).status;
  defect("c-authz-membership.read-without-membership", "c-authz-membership", Object.values(results).every((s) => s === 403),
    `a valid token that never joined this table can read: ${Object.entries(results).filter(([, s]) => s === 200).map(([k]) => k).join(", ")} (ARCH 5.1 says 'any in game'; knowing the 126-bit game id is the only barrier)`);
  // game-id formats / traversal attempts on the :id parameter
  for (const id of ["../" + gid, gid + "/../" + gid, "%2e%2e%2f" + gid, gid.toUpperCase(), gid.slice(0, -1), gid + "x", "ptl" + "A".repeat(21), "__proto__", "constructor"]) {
    const r = await alice.post(`/games/${encodeURIComponent(id)}/start-game`, {});
    ok(`bad game id '${id.slice(0, 30)}' -> 404/403, never another table`, [404, 403, 400].includes(r.status), `${r.status}`);
  }
}

section("ownership transfer changes who may act");
{
  const r = await alice.post(`/games/${gid}/transfer_ownership`, { playerID: bob.id });
  ok("owner transfers to Bob", r.status === 200, `${r.status}`);
  await waitFor(() => A.frame.table.ownerId === bob.id, { timeout: 2000, what: "owner change" }).catch(() => {});
  const old = await alice.post(`/games/${gid}/update_game`, { ...fcfg, guestChat: false });
  ok("former owner is refused", old.status === 403, `${old.status}`);
  const nu = await bob.post(`/games/${gid}/update_game`, { ...fcfg, guestChat: false });
  ok("new owner is accepted", nu.status === 200, `${nu.status} ${nu.text.slice(0, 60)}`);
  A.action("UP"); await sleep(300);
  ok("former owner's UP is ignored over the socket", !A.frame.table.pausedAt, "");
  const back = await bob.post(`/games/${gid}/transfer_ownership`, { playerID: alice.id });
  ok("new owner can hand it back", back.status === 200, `${back.status}`);
}
await S.stop();
const pol = S.pollution();
ok("no prototype pollution reported by the in-process probe", pol === "", pol.trim());
finish("s03-authz");
