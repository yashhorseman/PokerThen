/* PokerThen game engine — pure logic, no DOM, no network.
 * Runs inside the host's browser (and under Node for tests).
 * Randomness: crypto.getRandomValues with rejection sampling (unbiased Fisher-Yates).
 * Fairness: each hand's deck is committed to with SHA-256(deck|salt) before any card
 * is dealt, and the deck + salt are revealed when the hand ends so anyone can verify.
 */
(function (root) {
  'use strict';

  const RANKS = '23456789TJQKA';
  const SUITS = 'shdc';
  const HAND_NAMES = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

  const cryptoObj = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : require('crypto').webcrypto;

  function randInt(n) {
    const range = 0x100000000;
    const max = Math.floor(range / n) * n;
    const buf = new Uint32Array(1);
    let x;
    do { cryptoObj.getRandomValues(buf); x = buf[0]; } while (x >= max);
    return x % n;
  }
  function newDeck() {
    const d = [];
    for (const r of RANKS) for (const s of SUITS) d.push(r + s);
    return d;
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function randHex(bytes) {
    const b = new Uint8Array(bytes);
    cryptoObj.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- SHA-256 (sync, ASCII input) ---------- */
  const SHA_K = [], SHA_H = [];
  (function () {
    let n = 0; const comp = {};
    for (let c = 2; n < 64; c++) {
      if (!comp[c]) {
        for (let i = c * c; i < 400; i += c) comp[i] = 1;
        if (n < 8) SHA_H[n] = (Math.pow(c, 0.5) * 4294967296) | 0;
        SHA_K[n++] = (Math.pow(c, 1 / 3) * 4294967296) | 0;
      }
    }
  })();
  function sha256(s) {
    const ror = (v, n) => (v >>> n) | (v << (32 - n));
    const bytes = [];
    for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) & 255);
    const bl = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push(0, 0, 0, 0, (bl >>> 24) & 255, (bl >>> 16) & 255, (bl >>> 8) & 255, bl & 255);
    const H = SHA_H.slice();
    for (let o = 0; o < bytes.length; o += 64) {
      const w = new Array(64);
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + SHA_K[i] + w[i]) | 0;
        const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function commitFor(deck, salt) { return sha256(deck.join(',') + '|' + salt); }

  /* ---------- Hand evaluation ---------- */
  const rankVal = c => RANKS.indexOf(c[0]) + 2;
  function eval5(cs) {
    const r = cs.map(rankVal).sort((a, b) => b - a);
    const flush = cs.every(c => c[1] === cs[0][1]);
    let straight = false, high = r[0];
    if (new Set(r).size === 5) {
      if (r[0] - r[4] === 4) straight = true;
      else if (r[0] === 14 && r[1] === 5 && r[4] === 2) { straight = true; high = 5; }
    }
    const counts = {};
    r.forEach(x => counts[x] = (counts[x] || 0) + 1);
    const g = Object.entries(counts).map(([k, v]) => [+k, v]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    let cat, tb;
    if (straight && flush) { cat = 8; tb = [high]; }
    else if (g[0][1] === 4) { cat = 7; tb = g.map(x => x[0]); }
    else if (g[0][1] === 3 && g[1][1] === 2) { cat = 6; tb = g.map(x => x[0]); }
    else if (flush) { cat = 5; tb = r; }
    else if (straight) { cat = 4; tb = [high]; }
    else if (g[0][1] === 3) { cat = 3; tb = g.map(x => x[0]); }
    else if (g[0][1] === 2 && g[1][1] === 2) { cat = 2; tb = g.map(x => x[0]); }
    else if (g[0][1] === 2) { cat = 1; tb = g.map(x => x[0]); }
    else { cat = 0; tb = r; }
    let s = cat;
    for (let i = 0; i < 5; i++) s = s * 15 + (tb[i] || 0);
    return s;
  }
  function bestHand(cards) {
    let best = -1;
    const n = cards.length;
    for (let a = 0; a < n - 4; a++) for (let b = a + 1; b < n - 3; b++) for (let c = b + 1; c < n - 2; c++)
      for (let d = c + 1; d < n - 1; d++) for (let e = d + 1; e < n; e++) {
        const s = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
        if (s > best) best = s;
      }
    return best;
  }
  function handName(score) {
    const cat = Math.floor(score / Math.pow(15, 5));
    if (cat === 8 && score % Math.pow(15, 5) === 14 * Math.pow(15, 4)) return 'Royal Flush';
    return HAND_NAMES[cat];
  }

  /* ---------- Game ---------- */
  const DEFAULTS = {
    sb: 10, bb: 20, ante: 0, buyMin: 400, buyMax: 4000, timer: 30, delay: 6,
    rit: true, rabbit: true, maxSeats: 10
  };

  class Game {
    constructor(st, hostPid) {
      this.st = st || {
        v: 1, hostPid, phase: 'lobby', settings: Object.assign({}, DEFAULTS), players: {},
        handNum: 0, dealerSeat: -1, h: null, log: [], logId: 0, nextHandAt: 0
      };
      this.onChange = () => {};
      this.now = () => Date.now();
    }

    /* --- helpers --- */
    log(m, k) {
      const s = this.st;
      s.log.push({ id: ++s.logId, k: k || 'sys', m });
      if (s.log.length > 250) s.log.splice(0, s.log.length - 250);
    }
    seated() { return Object.values(this.st.players).filter(p => p.seat !== null).sort((a, b) => a.seat - b.seat); }
    atSeat(n) { return Object.values(this.st.players).find(p => p.seat === n) || null; }
    nextSeat(seat, pred) {
      const max = this.st.settings.maxSeats;
      for (let k = 1; k <= max; k++) {
        const p = this.atSeat((seat + k + max * 2) % max);
        if (p && pred(p)) return p;
      }
      return null;
    }
    live() { return Object.values(this.st.players).filter(p => p.inHand && !p.folded); }
    pot() { return Object.values(this.st.players).reduce((a, p) => a + (p.inHand ? p.total : 0), 0); }
    eligibleCount() { return this.seated().filter(p => p.stack > 0 && !p.sitOut).length; }
    handActive() { const h = this.st.h; return !!(h && !h.over); }
    changed() { this.onChange(); }
    fmt(n) { return String(n); }

    /* --- players --- */
    join(pid, name) {
      const s = this.st;
      name = String(name || 'Player').trim().slice(0, 16) || 'Player';
      let p = s.players[pid];
      if (!p) {
        p = s.players[pid] = {
          pid, name, seat: null, stack: 0, bet: 0, total: 0, folded: false, allin: false, acted: false,
          noRaise: false, sitOut: false, cards: [], shown: [false, false], inHand: false, pendingStand: false,
          pendingAdd: 0, connected: true, vote: null, hn: null
        };
        this.log(name + ' joined the room.');
      } else {
        p.connected = true;
        if (p.name !== name) { this.log(p.name + ' is now ' + name + '.'); p.name = name; }
      }
      this.changed();
      return p;
    }
    setConnected(pid, v) {
      const p = this.st.players[pid];
      if (p && p.connected !== v) { p.connected = v; this.changed(); }
    }
    sit(pid, seat, buyin) {
      const s = this.st, p = s.players[pid];
      if (!p) return 'Unknown player';
      if (p.seat !== null) return 'You already have a seat';
      seat = +seat;
      if (!(seat >= 0 && seat < s.settings.maxSeats)) return 'Bad seat';
      if (this.atSeat(seat)) return 'Seat taken';
      if (p.stack <= 0) {
        buyin = Math.floor(+buyin);
        if (!(buyin > 0)) return 'Enter a buy-in';
        if (buyin < s.settings.buyMin || buyin > s.settings.buyMax) return 'Buy-in must be between ' + s.settings.buyMin + ' and ' + s.settings.buyMax;
        p.stack = buyin;
      }
      p.seat = seat; p.sitOut = false; p.pendingStand = false;
      this.log(p.name + ' sat down with ' + p.stack + '.');
      this.maybeSchedule();
      this.changed();
      return null;
    }
    stand(pid) {
      const p = this.st.players[pid];
      if (!p || p.seat === null) return;
      if (p.inHand && this.handActive()) {
        if (!p.folded) this.forceFold(p);
        p.pendingStand = true;
        this.log(p.name + ' will stand up after this hand.');
      } else {
        p.seat = null;
        this.log(p.name + ' stood up with ' + p.stack + '.');
      }
      this.changed();
    }
    rebuy(pid, amt) {
      const s = this.st, p = s.players[pid];
      if (!p || p.seat === null) return 'Take a seat first';
      amt = Math.floor(+amt);
      if (!(amt > 0)) return 'Enter an amount';
      const room = s.settings.buyMax - p.stack - p.pendingAdd;
      if (amt > room) return 'Max stack is ' + s.settings.buyMax + ' (you can add up to ' + Math.max(0, room) + ')';
      if (p.inHand && this.handActive()) { p.pendingAdd += amt; this.log(p.name + ' will add ' + amt + ' next hand.'); }
      else { p.stack += amt; this.log(p.name + ' added ' + amt + '.'); }
      this.maybeSchedule();
      this.changed();
      return null;
    }
    setSitOut(pid, v) {
      const p = this.st.players[pid];
      if (!p || p.seat === null) return;
      p.sitOut = !!v;
      this.log(p.name + (v ? ' is sitting out.' : ' is back.'));
      if (v && p.inHand && this.handActive() && !p.folded) this.forceFold(p);
      this.maybeSchedule();
      this.changed();
    }
    chat(pid, text) {
      const p = this.st.players[pid];
      text = String(text || '').trim().slice(0, 200);
      if (!p || !text) return;
      this.log(p.name + ': ' + text, 'chat');
      this.changed();
    }
    show(pid, idx) {
      const h = this.st.h, p = this.st.players[pid];
      if (!h || !h.over || !p || !p.inHand || p.cards.length < 2) return;
      const ids = idx === 'both' ? [0, 1] : [+idx];
      const newly = ids.filter(i => (i === 0 || i === 1) && !p.shown[i]);
      newly.forEach(i => p.shown[i] = true);
      if (newly.length) this.log(p.name + ' shows ' + newly.map(i => p.cards[i]).join(' ') + '.', 'hand');
      this.changed();
    }
    rabbit(pid) {
      const s = this.st, h = s.h, p = s.players[pid];
      if (!h || !h.over || !p || !s.settings.rabbit || h.board.length >= 5 || h.rabbit || h.runs === 2) return;
      if (p.seat === null) return;
      h.rabbit = h.deck.slice(h.dp, h.dp + 5 - h.board.length);
      this.log(p.name + ' rabbit hunts: ' + h.rabbit.join(' ') + '.', 'hand');
      this.changed();
    }
    vote(pid, yes) {
      const h = this.st.h, p = this.st.players[pid];
      if (!h || h.mode !== 'ritprompt' || !p || !p.inHand || p.folded) return;
      p.vote = !!yes;
      this.log(p.name + (yes ? ' agrees to run it twice.' : ' declines to run it twice.'));
      this.resolveVote(false);
      this.changed();
    }

    /* --- admin --- */
    updateSettings(o) {
      const s = this.st.settings, n = {};
      const num = (k, lo, hi) => { if (o[k] !== undefined) { const v = Math.floor(+o[k]); if (v >= lo && v <= hi) n[k] = v; } };
      num('sb', 1, 1e9); num('bb', 1, 1e9); num('ante', 0, 1e9); num('buyMin', 1, 1e9); num('buyMax', 1, 1e9);
      num('timer', 0, 600); num('delay', 2, 60);
      ['rit', 'rabbit'].forEach(k => { if (o[k] !== undefined) n[k] = !!o[k]; });
      Object.assign(s, n);
      if (s.bb < s.sb) s.bb = s.sb;
      if (s.buyMax < s.buyMin) s.buyMax = s.buyMin;
      this.log('Host updated settings (blinds ' + s.sb + '/' + s.bb + (s.ante ? ', ante ' + s.ante : '') + '). Applies next hand.');
      this.changed();
    }
    start() {
      const s = this.st;
      if (this.eligibleCount() < 2) return 'Need at least 2 seated players with chips';
      s.phase = 'playing';
      this.log('Host started the game.');
      if (!this.handActive()) s.nextHandAt = this.now() + 500;
      this.changed();
      return null;
    }
    pause(v) {
      const s = this.st;
      if (s.phase === 'lobby') return;
      s.phase = v ? 'paused' : 'playing';
      this.log(v ? 'Game paused after this hand.' : 'Game resumed.');
      if (v) s.nextHandAt = 0; else this.maybeSchedule();
      this.changed();
    }
    setStack(pid, n) {
      const p = this.st.players[pid];
      n = Math.floor(+n);
      if (!p || !(n >= 0)) return;
      if (p.inHand && this.handActive()) { p.pendingAdd += n - p.stack - p.pendingAdd; if (p.stack + p.pendingAdd < 0) p.pendingAdd = -p.stack; }
      else p.stack = n;
      this.log('Host set ' + p.name + "'s stack to " + n + (p.inHand && this.handActive() ? ' (next hand).' : '.'));
      this.maybeSchedule();
      this.changed();
    }
    kick(pid) {
      const s = this.st, p = s.players[pid];
      if (!p || pid === s.hostPid) return;
      if (p.inHand && this.handActive() && !p.folded) this.forceFold(p);
      if (p.inHand && this.handActive()) { p.seat = null; p.kicked = true; } // keep record until hand ends
      else delete s.players[pid];
      this.log(p.name + ' was removed by the host.');
      this.changed();
    }

    maybeSchedule() {
      const s = this.st;
      if (s.phase === 'playing' && !this.handActive() && !s.nextHandAt && this.eligibleCount() >= 2) s.nextHandAt = this.now() + 2000;
    }

    /* --- hand lifecycle --- */
    startHand() {
      const s = this.st, set = s.settings, now = this.now();
      s.nextHandAt = 0;
      for (const id of Object.keys(s.players)) {
        const p = s.players[id];
        if (p.kicked) { delete s.players[id]; continue; }
        if (p.pendingAdd) { p.stack = Math.max(0, p.stack + p.pendingAdd); p.pendingAdd = 0; }
        Object.assign(p, { inHand: false, bet: 0, total: 0, folded: false, allin: false, acted: false, noRaise: false, cards: [], shown: [false, false], vote: null, hn: null });
      }
      const elig = this.seated().filter(p => p.stack > 0 && !p.sitOut);
      if (elig.length < 2) { s.h = null; return; }
      elig.forEach(p => p.inHand = true);

      const dealer = this.nextSeat(s.dealerSeat, p => p.inHand);
      s.dealerSeat = dealer.seat;
      const hu = elig.length === 2;
      const sb = hu ? dealer : this.nextSeat(dealer.seat, p => p.inHand);
      const bb = this.nextSeat(sb.seat, p => p.inHand);

      const deck = shuffle(newDeck());
      const salt = randHex(16);
      s.handNum++;
      const h = s.h = {
        num: s.handNum, dealerPid: dealer.pid, sbPid: sb.pid, bbPid: bb.pid, board: [], board2: null, deck, dp: 0, salt,
        commit: commitFor(deck, salt), currentBet: set.bb, minRaise: set.bb, toAct: null, deadline: 0, ptr: bb.seat,
        mode: 'bet', over: false, results: null, reveal: null, runs: 1, split: 0, rabbit: null, stepAt: 0, ritDeadline: 0
      };
      this.log('— Hand #' + h.num + ' — dealer: ' + dealer.name + '. Deck commitment (SHA-256): ' + h.commit, 'hand');

      if (set.ante) for (const p of elig) {
        const a = Math.min(set.ante, p.stack);
        p.stack -= a; p.total += a; if (p.stack === 0) p.allin = true;
      }
      const post = (p, amt, label) => { const a = this.commit(p, amt); this.log(p.name + ' posts ' + label + ' ' + a + (p.allin ? ' (all-in)' : '') + '.'); };
      post(sb, set.sb, 'small blind');
      post(bb, set.bb, 'big blind');

      // deal two rounds starting left of the dealer
      const dealOrder = [];
      let cur = dealer;
      for (let i = 0; i < elig.length; i++) { cur = this.nextSeat(cur.seat, p => p.inHand); dealOrder.push(cur); }
      for (let r = 0; r < 2; r++) for (const p of dealOrder) p.cards.push(deck[h.dp++]);

      this.afterAction();
      this.changed();
    }
    commit(p, amt) {
      const a = Math.max(0, Math.min(amt, p.stack));
      p.stack -= a; p.bet += a; p.total += a;
      if (p.stack === 0) p.allin = true;
      return a;
    }

    forceFold(p) {
      const h = this.st.h;
      if (!h || h.over || !p.inHand || p.folded) return;
      p.folded = true;
      this.log(p.name + ' folds.');
      if (h.mode !== 'bet') { this.afterRunoutFold(); return; }
      const wasTurn = h.toAct === p.pid;
      if (wasTurn) { h.ptr = p.seat; h.toAct = null; }
      this.afterAction();
    }
    afterRunoutFold() {
      const h = this.st.h;
      const ps = this.live();
      if (ps.length === 1) this.awardUncontested(ps[0]);
      else if (h.mode === 'ritprompt') this.resolveVote(false);
    }

    act(pid, action, amount) {
      const s = this.st, h = s.h, set = s.settings, p = s.players[pid];
      if (!h || h.over || h.mode !== 'bet') return 'No action possible right now';
      if (!p || h.toAct !== pid) return "It's not your turn";
      const toCall = h.currentBet - p.bet;
      if (action === 'fold') {
        p.folded = true;
        this.log(p.name + ' folds.');
      } else if (action === 'check') {
        if (toCall > 0) return 'You cannot check — call or fold';
        p.acted = true;
        this.log(p.name + ' checks.');
      } else if (action === 'call') {
        if (toCall <= 0) { p.acted = true; this.log(p.name + ' checks.'); }
        else {
          const a = this.commit(p, toCall);
          p.acted = true;
          this.log(p.name + ' calls ' + a + (p.allin ? ' (all-in)' : '') + '.');
        }
      } else if (action === 'raise') {
        amount = Math.floor(+amount);
        const max = p.bet + p.stack;
        if (!(amount > 0)) return 'Enter an amount';
        amount = Math.min(amount, max);
        if (amount <= h.currentBet) {
          if (amount < max) return 'Raise must be above the current bet of ' + h.currentBet;
          const a = this.commit(p, toCall); // all-in for less than / equal to a call
          p.acted = true;
          this.log(p.name + ' calls ' + a + ' (all-in).');
        } else {
          if (p.noRaise) return 'The betting was not reopened — you can only call or fold';
          const minTo = h.currentBet + h.minRaise;
          if (amount < minTo && amount < max) return 'Minimum raise is to ' + minTo;
          const verb = h.currentBet === 0 ? 'bets' : 'raises to';
          this.commit(p, amount - p.bet);
          const by = amount - h.currentBet;
          if (by >= h.minRaise) {
            h.minRaise = by;
            for (const o of this.live()) if (o !== p) { o.acted = false; o.noRaise = false; }
          } else {
            for (const o of this.live()) if (o !== p && o.acted) o.noRaise = true;
          }
          h.currentBet = amount;
          p.acted = true;
          this.log(p.name + ' ' + verb + ' ' + amount + (p.allin ? ' (all-in)' : '') + '.');
        }
      } else return 'Unknown action';
      h.ptr = p.seat; h.toAct = null; h.deadline = 0;
      this.afterAction();
      this.changed();
      return null;
    }

    afterAction() {
      const s = this.st, h = s.h, now = this.now();
      const ps = this.live();
      if (ps.length === 1) return this.awardUncontested(ps[0]);
      const active = ps.filter(p => !p.allin);
      const need = active.filter(p => !p.acted || p.bet < h.currentBet);
      const done = active.length === 0 || (active.length === 1 && active[0].bet >= h.currentBet) || need.length === 0;
      if (done) return this.endStreet();
      const nxt = this.nextSeat(h.ptr, p => need.includes(p));
      if (h.toAct !== nxt.pid) {
        h.toAct = nxt.pid;
        h.deadline = s.settings.timer ? now + s.settings.timer * 1000 : 0;
      }
    }

    endStreet() {
      const s = this.st, h = s.h;
      for (const p of Object.values(s.players)) { p.bet = 0; p.acted = false; p.noRaise = false; }
      h.currentBet = 0; h.minRaise = s.settings.bb; h.toAct = null; h.deadline = 0;
      if (h.board.length === 5) return this.showdown();
      const active = this.live().filter(p => !p.allin);
      if (active.length <= 1) return this.startRunout();
      this.dealTo(h.board);
      this.log('— ' + this.streetName(h.board.length) + ': ' + h.board.join(' '), 'hand');
      h.ptr = s.dealerSeat;
      this.afterAction();
    }
    streetName(n) { return n === 0 ? 'Preflop' : n === 3 ? 'Flop' : n === 4 ? 'Turn' : 'River'; }
    dealTo(arr) {
      const h = this.st.h;
      const n = arr.length === 0 ? 3 : 1;
      for (let i = 0; i < n; i++) arr.push(h.deck[h.dp++]);
    }

    startRunout() {
      const s = this.st, h = s.h, now = this.now();
      const ps = this.live();
      ps.forEach(p => p.shown = [true, true]);
      this.log('All-in: ' + ps.map(p => p.name + ' [' + p.cards.join(' ') + ']').join(', '), 'hand');
      h.toAct = null; h.deadline = 0; h.split = h.board.length;
      if (s.settings.rit && h.board.length < 5 && ps.length >= 2) {
        h.mode = 'ritprompt';
        h.ritDeadline = now + 15000;
        ps.forEach(p => p.vote = null);
        this.log('Run it twice? All players still in the hand must agree.');
      } else {
        h.mode = 'runout'; h.stepAt = now + 1500;
      }
    }
    resolveVote(timedOut) {
      const h = this.st.h, ps = this.live();
      if (h.mode !== 'ritprompt') return;
      const anyNo = ps.some(p => p.vote === false);
      const allYes = ps.every(p => p.vote === true);
      if (!anyNo && !allYes && !timedOut) return;
      h.runs = allYes ? 2 : 1;
      h.mode = 'runout';
      h.stepAt = this.now() + 1000;
      this.log(allYes ? 'Running it twice.' : 'Running it once.');
    }

    buildPots() {
      const ps = Object.values(this.st.players).filter(p => p.inHand);
      const levels = [...new Set(ps.filter(p => !p.folded && p.total > 0).map(p => p.total))].sort((a, b) => a - b);
      const pots = [];
      let prev = 0;
      for (const lv of levels) {
        let amount = 0;
        for (const p of ps) amount += Math.max(0, Math.min(p.total, lv) - prev);
        pots.push({ amount, elig: ps.filter(p => !p.folded && p.total >= lv).map(p => p.pid) });
        prev = lv;
      }
      if (pots.length) {
        const left = ps.reduce((a, p) => a + Math.max(0, p.total - prev), 0);
        pots[pots.length - 1].amount += left;
      }
      return pots;
    }

    awardUncontested(p) {
      const h = this.st.h;
      const amt = this.pot();
      p.stack += amt;
      h.results = [{ pot: 0, board: 0, amount: amt, winners: [{ pid: p.pid, name: p.name, amt, hand: null }] }];
      this.log(p.name + ' wins ' + amt + ' (everyone else folded).', 'hand');
      h.runs = 1;
      this.finishHand(false);
    }

    showdown() {
      const s = this.st, h = s.h;
      const live = this.live();
      live.forEach(p => p.shown = [true, true]);
      const boards = h.board2 ? [h.board, h.board2] : [h.board];
      const pots = this.buildPots();
      const results = [];
      const order = this.seated().map(p => p.pid); // used for odd-chip order
      const dealerSeat = s.dealerSeat;
      const seatDist = pid => { const p = s.players[pid]; return (p.seat - dealerSeat + s.settings.maxSeats) % s.settings.maxSeats; };
      live.forEach(p => p.hn = []);
      pots.forEach((pot, pi) => {
        boards.forEach((board, bi) => {
          const amt = boards.length === 2 ? (bi === 0 ? Math.ceil(pot.amount / 2) : Math.floor(pot.amount / 2)) : pot.amount;
          if (amt <= 0) return;
          const scores = pot.elig.map(pid => ({ pid, sc: bestHand(s.players[pid].cards.concat(board)) }));
          const top = Math.max(...scores.map(x => x.sc));
          const winners = scores.filter(x => x.sc === top).map(x => x.pid).sort((a, b) => seatDist(a) - seatDist(b));
          const each = Math.floor(amt / winners.length);
          let rem = amt - each * winners.length;
          const ws = winners.map(pid => {
            const win = each + (rem-- > 0 ? 1 : 0);
            s.players[pid].stack += win;
            return { pid, name: s.players[pid].name, amt: win, hand: handName(top) };
          });
          results.push({ pot: pi, board: bi, amount: amt, winners: ws });
        });
      });
      for (const p of live) {
        boards.forEach(b => p.hn.push(handName(bestHand(p.cards.concat(b)))));
      }
      h.results = results;
      const label = pots.length > 1 ? r => (r.pot === 0 ? 'main pot' : 'side pot ' + r.pot) : () => 'pot';
      for (const r of results) {
        const where = (boards.length === 2 ? 'Run ' + (r.board + 1) + ' ' : '') + label(r);
        for (const w of r.winners) this.log(w.name + ' wins ' + w.amt + ' from the ' + where + ' with ' + w.hand + '.', 'hand');
      }
      this.finishHand(true);
    }

    finishHand(showdown) {
      const s = this.st, h = s.h, now = this.now();
      h.over = true; h.mode = 'over'; h.toAct = null; h.deadline = 0;
      h.reveal = { deck: h.deck, salt: h.salt };
      for (const p of Object.values(s.players)) {
        p.bet = 0;
        if (p.pendingStand) { p.seat = null; p.pendingStand = false; }
      }
      if (s.phase === 'playing') s.nextHandAt = now + (s.settings.delay + (showdown ? 2 : 0)) * 1000;
    }

    /* --- clock --- */
    tick() {
      const s = this.st, h = s.h, now = this.now();
      let dirty = false;
      if (h && !h.over) {
        if (h.mode === 'bet' && h.toAct && h.deadline && now > h.deadline) {
          const p = s.players[h.toAct];
          if (p) {
            const free = p.bet >= h.currentBet;
            this.log(p.name + ' timed out and ' + (free ? 'checks' : 'folds') + '.');
            p.sitOut = true;
            this.act(p.pid, free ? 'check' : 'fold');
            dirty = true;
          }
        } else if (h.mode === 'ritprompt' && now > h.ritDeadline) {
          this.resolveVote(true); dirty = true;
        } else if (h.mode === 'runout' && now >= h.stepAt) {
          this.runoutStep(); dirty = true;
        }
      } else if (s.phase === 'playing' && s.nextHandAt && now >= s.nextHandAt) {
        this.startHand(); dirty = true;
      }
      if (dirty) this.changed();
    }
    runoutStep() {
      const h = this.st.h, now = this.now();
      const step = () => { h.stepAt = now + 1800; };
      if (h.board.length < 5) {
        this.dealTo(h.board);
        this.log((h.runs === 2 ? 'Run 1 — ' : '') + this.streetName(h.board.length) + ': ' + h.board.join(' '), 'hand');
        step();
      } else if (h.runs === 2) {
        if (!h.board2) { h.board2 = h.board.slice(0, h.split); step(); }
        else if (h.board2.length < 5) {
          this.dealTo(h.board2);
          this.log('Run 2 — ' + this.streetName(h.board2.length) + ': ' + h.board2.join(' '), 'hand');
          step();
        } else this.showdown();
      } else this.showdown();
    }

    /* --- per-viewer snapshot --- */
    view(viewerPid) {
      const s = this.st, h = s.h, now = this.now();
      const me = s.players[viewerPid];
      const players = this.seated().map(p => {
        let cards = null;
        if (p.inHand && p.cards.length === 2) {
          if (p.pid === viewerPid) cards = p.cards;
          else if (!p.folded || p.shown[0] || p.shown[1]) cards = p.cards.map((c, i) => p.shown[i] ? c : '??');
        }
        return {
          pid: p.pid, name: p.name, seat: p.seat, stack: p.stack, bet: p.bet, folded: p.folded, allin: p.allin,
          sitOut: p.sitOut, connected: p.connected, inHand: p.inHand, cards, shown: p.shown, hn: (p.shown[0] || p.shown[1]) ? p.hn : null,
          vote: p.vote, pendingStand: p.pendingStand, pendingAdd: p.pendingAdd
        };
      });
      const spectators = Object.values(s.players).filter(p => p.seat === null && p.connected).map(p => p.name);
      let hv = null;
      if (h) {
        hv = {
          num: h.num, dealer: h.dealerPid, sb: h.sbPid, bb: h.bbPid, board: h.board, board2: h.board2, pot: this.pot(),
          currentBet: h.currentBet, minRaise: h.minRaise, toAct: h.toAct, timeLeft: h.deadline ? Math.max(0, h.deadline - now) : null,
          mode: h.mode, over: h.over, results: h.results, commit: h.commit, reveal: h.over ? h.reveal : null, runs: h.runs,
          rabbit: h.rabbit, ritLeft: h.mode === 'ritprompt' ? Math.max(0, h.ritDeadline - now) : null,
          canRabbit: !!(h.over && s.settings.rabbit && h.board.length < 5 && !h.rabbit && h.runs !== 2)
        };
      }
      return {
        you: viewerPid, isHost: viewerPid === s.hostPid, hostPid: s.hostPid, phase: s.phase, settings: s.settings, players, spectators,
        me: me ? { seat: me.seat, stack: me.stack, name: me.name, noRaise: me.noRaise, sitOut: me.sitOut, pendingAdd: me.pendingAdd } : null,
        h: hv, nextIn: s.nextHandAt ? Math.max(0, s.nextHandAt - now) : null, log: s.log.slice(-120), dealerSeat: s.dealerSeat
      };
    }
  }

  const api = { Game, sha256, commitFor, newDeck, shuffle, randInt, bestHand, handName, eval5, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PT = api;
})(typeof window !== 'undefined' ? window : globalThis);
