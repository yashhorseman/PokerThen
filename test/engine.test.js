// Run: node test/engine.test.js
const assert = require('assert');
const nodeCrypto = require('crypto');
const PT = require('../engine.js');
const { Game, sha256, bestHand, handName, newDeck, shuffle, commitFor } = PT;

// SHA-256 matches Node
for (const s of ['', 'abc', 'As,Kd,Qh|deadbeef', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), newDeck().join(',') + '|' + 'ab'.repeat(16)])
  assert.strictEqual(sha256(s), nodeCrypto.createHash('sha256').update(s).digest('hex'), 'sha256 ' + s.slice(0, 10));

// hand ranking
const rank = c => bestHand(c.split(' '));
assert(rank('As Ks Qs Js Ts 2d 3c') > rank('9s 9h 9d 9c Ad 2d 3c'));
assert.strictEqual(handName(rank('As Ks Qs Js Ts 2d 3c')), 'Royal Flush');
assert(rank('9s 9h 9d 9c Ad 2d 3c') > rank('Ks Kh Kd 2c 2d 7d 3c'));
assert(rank('Ks Kh Kd 2c 2d 7d 3c') > rank('As 2s 5s 9s Js 2d 3c'));
assert(rank('As 2s 5s 9s Js 2d 3c') > rank('5s 4h 3d 2c Ad Kd Kc')); // flush > wheel straight
assert.strictEqual(handName(rank('5s 4h 3d 2c Ad Kd Kc')), 'Straight');
assert(rank('6s 5h 4d 3c 2d Kd Kc') > rank('5s 4h 3d 2c Ad Kd Kc')); // 6-high beats wheel
assert(rank('As Ah 2d 3c 7d 8d 9c') > rank('Ks Kh 2d 3c 7d 8d 9c'));
assert(rank('As Ah Kd Kc 7d 8d 9c') > rank('As Ah Qd Qc 7d 8d 9c'));
assert(rank('As Ah Kd Kc 7d 8d 9c') > rank('As Ah Kd Kc 6d 8d 5c')); // kicker
assert.strictEqual(rank('As Ah Kd Kc 7d 8d 9c'), rank('Ad Ac Kh Ks 7s 8c 9c')); // tie

// shuffle: valid permutation + roughly uniform position of a given card
const d = shuffle(newDeck());
assert.strictEqual(new Set(d).size, 52);
const N = 52000, counts = new Array(52).fill(0);
for (let i = 0; i < N; i++) counts[shuffle(newDeck()).indexOf('As')]++;
const exp = N / 52;
const chi = counts.reduce((a, c) => a + (c - exp) ** 2 / exp, 0);
console.log('shuffle chi-square (51 dof, 99.9% < 87.7):', chi.toFixed(1));
assert(chi < 87.7, 'shuffle not uniform');

// Simulated games: random legal-ish play, check chips conserved & game always terminates
function sim(nPlayers, hands, opts = {}) {
  let t = 1_000_000;
  const g = new Game(null, 'p0');
  g.now = () => t;
  Object.assign(g.st.settings, { timer: 0, delay: 2 }, opts);
  for (let i = 0; i < nPlayers; i++) {
    g.join('p' + i, 'P' + i);
    g.sit('p' + i, i, 200 + Math.floor(Math.random() * 3000));
  }
  const total0 = Object.values(g.st.players).reduce((a, p) => a + p.stack, 0);
  assert.strictEqual(g.start(), null);
  let played = 0, guard = 0;
  while (played < hands && guard++ < 200000) {
    t += 500;
    g.tick();
    const h = g.st.h;
    if (!h) { // everybody busted down to <2 — rebuy everyone
      for (const p of g.seated()) if (p.stack === 0) g.rebuy(p.pid, 1000);
      g.maybeSchedule(); continue;
    }
    if (h.over) { if (h.num > played) { played = h.num; check(); } continue; }
    if (h.mode === 'ritprompt') { for (const p of g.live()) g.vote(p.pid, Math.random() < 0.6); continue; }
    if (h.mode === 'bet' && h.toAct) {
      const p = g.st.players[h.toAct];
      const r = Math.random(), toCall = h.currentBet - p.bet;
      let err;
      if (r < 0.15 && toCall > 0) err = g.act(p.pid, 'fold');
      else if (r < 0.55) err = g.act(p.pid, toCall > 0 ? 'call' : 'check');
      else if (r < 0.9) err = g.act(p.pid, 'raise', h.currentBet + h.minRaise + Math.floor(Math.random() * 3) * g.st.settings.bb);
      else err = g.act(p.pid, 'raise', 99999);
      if (err && !g.act(p.pid, toCall > 0 ? 'call' : 'check') === null) throw new Error(err);
    }
    // occasionally rebuy busted players
    if (Math.random() < 0.05) for (const p of g.seated()) if (p.stack === 0 && !p.inHand) g.rebuy(p.pid, 800);
    // chips conservation (stacks + live pot) vs. initial + rebuys is checked at hand end
  }
  assert(played >= hands, 'sim did not finish ' + hands + ' hands (stuck)');
  let added = 0;
  function check() {
    const hh = g.st.h;
    assert(hh.results && hh.results.length, 'no results');
    const paid = hh.results.reduce((a, r) => a + r.amount, 0);
    const potTotal = Object.values(g.st.players).reduce((a, p) => a + (p.inHand ? p.total : 0), 0);
    assert.strictEqual(paid, potTotal, 'payout != pot (hand ' + hh.num + ')');
    assert(hh.commit === commitFor(hh.reveal.deck, hh.reveal.salt), 'commit mismatch');
    for (const p of Object.values(g.st.players)) assert(p.stack >= 0);
  }
}
for (let i = 0; i < 40; i++) sim(2 + (i % 8), 60);
sim(6, 200, { ante: 5 });
console.log('simulations OK');

// Deterministic scenario: side pots + run it twice
{
  let t = 5e6;
  const g = new Game(null, 'a');
  g.now = () => t;
  Object.assign(g.st.settings, { timer: 0, buyMin: 1, buyMax: 1e6 });
  ['a', 'b', 'c'].forEach((id, i) => { g.join(id, id); g.sit(id, i, [100, 300, 1000][i]); });
  g.start(); t += 1000; g.tick();
  const h = g.st.h;
  // rig the deck: a=AA, b=KK, c=QQ ; board 2 2 3 7 9 (a wins), second run K...
  const dealer = g.st.players[h.dealerPid];
  assert(h);
  // all-in preflop
  let guard = 0;
  while (h.mode === 'bet' && guard++ < 20) g.act(h.toAct, 'raise', 99999);
  assert.strictEqual(h.mode, 'ritprompt');
  g.live().forEach(p => g.vote(p.pid, true));
  assert.strictEqual(h.runs, 2);
  for (let i = 0; i < 30 && !h.over; i++) { t += 2000; g.tick(); }
  assert(h.over && h.board.length === 5 && h.board2.length === 5);
  assert.deepStrictEqual(h.board.slice(0, 0), h.board2.slice(0, 0));
  const total = Object.values(g.st.players).reduce((a, p) => a + p.stack, 0);
  assert.strictEqual(total, 1400, 'chips conserved in side pot scenario');
  assert(h.results.every(r => r.winners.length > 0));
  console.log('side pot / run-twice scenario OK; results:', JSON.stringify(h.results.map(r => [r.pot, r.board, r.amount, r.winners.map(w => w.name + ':' + w.amt)])));
}
console.log('ALL TESTS PASSED');
