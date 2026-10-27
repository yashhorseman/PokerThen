// E15 persistence: restart (graceful and SIGKILL) between actions; seats, owner, hand, commitment and logs survive; no duplicate log lines.
import { assert, sleep, waitFor } from "../harness/index.mjs";

export default async function (h) {
  const owner = await h.player("Owner");
  const gid = await owner.createTable("Owner");
  const bob = await h.player("Bob");
  await bob.joinAndSit(gid, 2);
  await owner.approveAll([bob]);
  const started = await owner.startGame();
  assert(started.status === 200, "start-game 200 (" + started.status + " " + started.text + ")");
  const sock = await owner.socket();
  const reg = await sock.until((m) => m.find((x) => x.t === "registered"));
  const commit1 = reg.frame.hand.commitment;
  const logBefore = (await owner.api("GET", `/api/games/${gid}/log_v3?hand_number=1`)).json;
  sock.close();
  for (const crash of [false, true]) {
    await h.restartServer({ crash });
    const s2 = await owner.socket();
    const r2 = await s2.until((m) => m.find((x) => x.t === "registered"));
    assert(r2.frame.table.ownerId === owner.playerID, "owner unchanged after restart");
    assert(Object.keys(r2.frame.players).length === 2, "both players still seated");
    assert(r2.frame.hand.commitment === commit1 || r2.frame.table.handNumber > 1, "same commitment (or later hand) after restart");
    const pub = await owner.api("GET", `/api/games/${gid}/fairness/1`);
    assert(pub.json.commitment === commit1, "fairness commitment survives restart");
    const logAfter = (await owner.api("GET", `/api/games/${gid}/log_v3?hand_number=1`)).json;
    const msgs = logAfter.map((e) => e.msg);
    assert(new Set(logAfter.map((e) => e.createdAt)).size === logAfter.length, "no duplicate log entries");
    assert(logBefore.every((e) => msgs.includes(e.msg)), "previous log lines retained");
    s2.close();
    await sleep(100);
  }
}
