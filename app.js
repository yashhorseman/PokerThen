/* PokerThen — UI + peer-to-peer networking.
 * The host's browser runs the authoritative game (engine.js); everyone else connects to it
 * over WebRTC (PeerJS) and receives a personalised view (they never receive other players' hole cards).
 */
(function () {
  'use strict';
  const PT = window.PT;
  const PREFIX = 'pokerthen-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  let pid = store.get('pt_pid');
  if (!pid) { pid = 'u' + PT.randInt(1e9).toString(36) + PT.randInt(1e9).toString(36); store.set('pt_pid', pid); }
  let myName = store.get('pt_name') || '';

  let room = null, isHost = false, game = null, peer = null, conn = null;
  let view = null, viewAt = 0, conns = {}, banned = new Set();
  let soundOn = store.get('pt_sound') !== '0';
  let preFold = false, raiseVal = null, actSig = '', lastTurnKey = '', lastLogId = 0;
  const hands = {}; // hand number -> {commit, order:[{pid,seat}], dealer, verified}
  let hostTimer = null, bcastT = null;

  /* ================= helpers ================= */
  function toast(m, ms) {
    const t = $('#toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms || 2500);
  }
  function beep() {
    if (!soundOn) return;
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      const o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = 0.08;
      o.start(); o.stop(a.currentTime + 0.15);
      setTimeout(() => a.close(), 400);
    } catch (e) {}
  }
  function newCode() { let c = ''; for (let i = 0; i < 6; i++) c += CODE_CHARS[PT.randInt(CODE_CHARS.length)]; return c; }
  function parseCode(s) {
    s = String(s || '').trim();
    const m = s.match(/#([A-Za-z0-9]{4,10})\s*$/) || s.match(/^([A-Za-z0-9]{4,10})$/);
    return m ? m[1].toUpperCase() : null;
  }
  function inviteLink() { return location.origin + location.pathname + '#' + room; }
  function modal(html, onMount) {
    const root = $('#modal-root');
    root.innerHTML = '<div class="modal-bg"><div class="modal">' + html + '</div></div>';
    root.querySelector('.modal-bg').addEventListener('mousedown', e => { if (e.target.classList.contains('modal-bg')) closeModal(); });
    if (onMount) onMount(root.querySelector('.modal'));
    return root.querySelector('.modal');
  }
  function closeModal() { $('#modal-root').innerHTML = ''; modalRefresh = null; }
  let modalRefresh = null;
  function cardHTML(c, cls) {
    if (!c) return '';
    if (c === '??') return '<div class="card back ' + (cls || '') + '"></div>';
    const r = c[0] === 'T' ? '10' : c[0];
    return '<div class="card s' + c[1] + ' ' + (cls || '') + '"><span class="r">' + r + '</span><span class="su">' + SYM[c[1]] + '</span></div>';
  }
  const cardTxt = c => (c[0] === 'T' ? '10' : c[0]) + SYM[c[1]];

  /* ================= landing ================= */
  function showLanding() {
    $('#game').hidden = true; $('#landing').hidden = false;
    $('#in-name').value = myName;
    const code = parseCode(location.hash);
    const saved = loadSavedHost();
    $('#create-box').hidden = !!code;
    $('#join-box').hidden = !code;
    if (code) $('#join-code').textContent = code;
    const rb = $('#btn-resume');
    if (!code && saved) { rb.hidden = false; rb.textContent = '↩ Resume your game ' + saved.code; }
    else rb.hidden = true;
  }
  function loadSavedHost() {
    try { const s = JSON.parse(store.get('pt_host')); if (s && s.code && s.state && s.state.hostPid === pid) return s; } catch (e) {}
    return null;
  }
  function needName() {
    const n = $('#in-name').value.trim();
    if (!n) { toast('Enter a nickname first'); $('#in-name').focus(); return null; }
    myName = n.slice(0, 16); store.set('pt_name', myName);
    return myName;
  }
  $('#btn-create').onclick = () => {
    if (!needName()) return;
    const sb = Math.max(1, +$('#in-sb').value || 10), bb = Math.max(sb, +$('#in-bb').value || 20), stack = Math.max(bb * 10, +$('#in-stack').value || 2000);
    const code = newCode();
    const g = new PT.Game(null, pid);
    g.st.settings.sb = sb; g.st.settings.bb = bb;
    g.st.settings.buyMin = Math.max(bb * 10, Math.floor(stack / 2)); g.st.settings.buyMax = stack * 2;
    g.st.defaultStack = stack;
    location.hash = code;
    enterHost(code, g);
  };
  $('#btn-resume').onclick = () => {
    if (!needName()) return;
    const s = loadSavedHost(); if (!s) return;
    location.hash = s.code;
    enterHost(s.code, new PT.Game(s.state));
  };
  $('#btn-join').onclick = () => {
    const c = parseCode($('#in-code').value);
    if (!c) return toast('That doesn’t look like a game link or code');
    location.hash = c;
  };
  $('#in-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-join').click(); });
  $('#btn-join-go').onclick = () => { if (!needName()) return; enterClient(parseCode(location.hash)); };
  $('#btn-back').onclick = e => { e.preventDefault(); history.replaceState(null, '', location.pathname); showLanding(); };
  window.addEventListener('hashchange', () => { if (!room) showLanding(); });

  /* ================= host ================= */
  function enterHost(code, g) {
    room = code; isHost = true; game = g;
    for (const p of Object.values(game.st.players)) if (p.pid !== pid) p.connected = false;
    game.onChange = scheduleBroadcast;
    game.join(pid, myName);
    openGameUI();
    startPeer();
    clearInterval(hostTimer);
    hostTimer = setInterval(() => game.tick(), 250);
    scheduleBroadcast();
  }
  let hostTries = 0;
  function startPeer() {
    if (peer) try { peer.destroy(); } catch (e) {}
    setBanner('Connecting to the signalling server…');
    peer = new Peer(PREFIX + room, { debug: 0 });
    peer.on('open', () => { hostTries = 0; setBanner(null); });
    peer.on('connection', c => {
      c.on('data', m => onHostMsg(c, m));
      c.on('close', () => dropConn(c));
      c.on('error', () => dropConn(c));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    peer.on('error', e => {
      if (e.type === 'unavailable-id') {
        // our old session may still be registered on the broker — keep trying for a while
        if (++hostTries < 15) { setBanner('Reclaiming your room… (' + hostTries + ')'); setTimeout(startPeer, 2000); }
        else setBanner('This room code is in use by another browser/tab. Close other tabs hosting it and reload.');
      } else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') {
        setBanner('Signalling server unreachable — retrying…'); setTimeout(startPeer, 3000);
      }
    });
  }
  function dropConn(c) {
    if (c.pid && conns[c.pid] === c) { delete conns[c.pid]; game.setConnected(c.pid, false); }
  }
  function onHostMsg(c, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (typeof m.pid !== 'string' || m.pid.length > 40 || banned.has(m.pid)) { try { c.close(); } catch (e) {} return; }
      if (conns[m.pid] && conns[m.pid] !== c) try { conns[m.pid].close(); } catch (e) {}
      c.pid = m.pid; conns[m.pid] = c;
      game.join(m.pid, m.name);
      return;
    }
    if (c.pid) handle(c.pid, m);
  }
  function handle(from, m) {
    const g = game; let err = null;
    switch (m.t) {
      case 'sit': err = g.sit(from, m.seat, m.buyin); break;
      case 'stand': g.stand(from); break;
      case 'act': err = g.act(from, m.a, m.amt); break;
      case 'sitout': g.setSitOut(from, m.v); break;
      case 'show': g.show(from, m.i); break;
      case 'rabbit': g.rabbit(from); break;
      case 'vote': g.vote(from, m.v); break;
      case 'chat': g.chat(from, m.text); break;
      case 'rebuy': err = g.rebuy(from, m.amt); break;
      case 'admin':
        if (from !== g.st.hostPid) break;
        if (m.op === 'settings') g.updateSettings(m.s || {});
        else if (m.op === 'start') err = g.start();
        else if (m.op === 'pause') g.pause(!!m.v);
        else if (m.op === 'stack') g.setStack(m.pid, m.n);
        else if (m.op === 'kick') {
          banned.add(m.pid); g.kick(m.pid);
          if (conns[m.pid]) { const c = conns[m.pid]; delete conns[m.pid]; setTimeout(() => { try { c.close(); } catch (e) {} }, 300); }
        }
        break;
    }
    if (err) sendTo(from, { t: 'err', m: err });
  }
  function sendTo(p, msg) {
    if (p === pid && isHost) { if (msg.t === 'err') toast(msg.m, 3500); return; }
    const c = conns[p];
    if (c && c.open) try { c.send(msg); } catch (e) {}
  }
  function scheduleBroadcast() {
    if (bcastT) return;
    bcastT = setTimeout(() => {
      bcastT = null;
      for (const p of Object.keys(conns)) sendTo(p, { t: 'state', v: game.view(p) });
      onView(game.view(pid));
      store.set('pt_host', JSON.stringify({ code: room, state: game.st }));
    }, 20);
  }

  /* ================= client ================= */
  function enterClient(code) {
    if (!code) return;
    room = code; isHost = false;
    openGameUI();
    setBanner('Connecting to host…');
    let retry = null, gotState = false;
    peer = new Peer(undefined, { debug: 0 });
    const connect = () => {
      clearTimeout(retry);
      if (!peer || peer.destroyed) return;
      if (peer.disconnected) try { peer.reconnect(); } catch (e) {}
      conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => conn.send({ t: 'hello', pid, name: myName }));
      conn.on('data', m => {
        if (m.t === 'state') { gotState = true; setBanner(null); onView(m.v); }
        else if (m.t === 'err') toast(m.m, 3500);
      });
      const lost = () => { setBanner(gotState ? 'Connection to host lost — reconnecting…' : 'Waiting for the host to come online…'); clearTimeout(retry); retry = setTimeout(connect, 2500); };
      conn.on('close', lost); conn.on('error', lost);
      // if the data channel never opens (host offline), try again
      retry = setTimeout(() => { if (!conn.open) { try { conn.close(); } catch (e) {} lost(); } }, 9000);
    };
    peer.on('open', connect);
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    peer.on('error', e => {
      if (e.type === 'peer-unavailable') { setBanner('Host not found — is the game still open? Retrying…'); clearTimeout(retry); retry = setTimeout(connect, 3000); }
      else if (e.type === 'network' || e.type === 'server-error') { setBanner('Signalling server unreachable — retrying…'); clearTimeout(retry); retry = setTimeout(connect, 3000); }
    });
  }
  function send(m) {
    if (isHost) handle(pid, m);
    else if (conn && conn.open) conn.send(m);
    else toast('Not connected to the host yet');
  }
  function setBanner(t) { const b = $('#conn-banner'); b.hidden = !t; if (t) b.textContent = t; }

  /* ================= game UI shell ================= */
  function openGameUI() {
    $('#landing').hidden = true; $('#game').hidden = false;
    $('#room-code').textContent = room;
    $('#btn-admin').hidden = !isHost;
    $('#btn-sound').textContent = soundOn ? '🔊' : '🔇';
    $('#log').innerHTML = ''; lastLogId = 0;
    startUITimer();
  }
  $('#btn-copy').onclick = async () => {
    const l = inviteLink();
    try { await navigator.clipboard.writeText(l); toast('Invite link copied — send it to your friends'); }
    catch (e) { prompt('Copy this invite link:', l); }
  };
  $('#btn-sound').onclick = () => { soundOn = !soundOn; store.set('pt_sound', soundOn ? '1' : '0'); $('#btn-sound').textContent = soundOn ? '🔊' : '🔇'; };
  $('#btn-leave').onclick = () => {
    if (!confirm(isHost ? 'Leave? The table closes for everyone while you are away (your game is saved; reopen your link to resume).' : 'Leave this table?')) return;
    if (isHost) clearInterval(hostTimer);
    try { peer && peer.destroy(); } catch (e) {}
    room = null; game = null; view = null; conn = null; conns = {};
    history.replaceState(null, '', location.pathname);
    location.reload();
  };
  $('#chatform').onsubmit = e => {
    e.preventDefault();
    const i = $('#chat'); if (!i.value.trim()) return;
    send({ t: 'chat', text: i.value }); i.value = '';
  };
  $('#btn-fair').onclick = openFairness;
  $('#btn-admin').onclick = openAdmin;

  /* ================= view handling ================= */
  function onView(v) {
    const prev = view;
    view = v; viewAt = performance.now();
    trackHands(v);
    // my turn notification / pre-action
    const h = v.h, myTurn = h && h.toAct === pid && h.mode === 'bet';
    const key = h ? h.num + ':' + h.toAct + ':' + h.currentBet + ':' + h.board.length : '';
    if (myTurn && key !== lastTurnKey) {
      lastTurnKey = key;
      const me = v.players.find(p => p.pid === pid);
      if (preFold && me) {
        preFold = false;
        send({ t: 'act', a: h.currentBet - me.bet <= 0 ? 'check' : 'fold' });
        return render();
      }
      beep();
    }
    if (!myTurn) lastTurnKey = '';
    if (!h || h.over || (prev && prev.h && prev.h.num !== h.num)) preFold = false;
    render();
    if (modalRefresh) modalRefresh();
  }

  /* ---- fairness tracking (client-side verification) ---- */
  function trackHands(v) {
    const h = v.h; if (!h) return;
    let rec = hands[h.num];
    if (!rec) {
      rec = hands[h.num] = { num: h.num, commit: h.commit, dealer: h.dealer, order: v.players.filter(p => p.inHand).map(p => ({ pid: p.pid, seat: p.seat })), result: null };
    }
    if (h.reveal && !rec.result) rec.result = verifyHand(rec, h, v);
    const keys = Object.keys(hands).map(Number).sort((a, b) => a - b);
    while (keys.length > 60) delete hands[keys.shift()];
  }
  function verifyHand(rec, h, v) {
    const r = { commitOk: false, deckOk: false, boardOk: false, holeOk: true, holeChecked: 0 };
    const { deck, salt } = h.reveal;
    r.commitOk = PT.commitFor(deck, salt) === rec.commit;
    r.deckOk = deck.length === 52 && new Set(deck).size === 52 && PT.newDeck().every(c => deck.includes(c));
    const n = rec.order.length;
    r.boardOk = h.board.every((c, i) => deck[2 * n + i] === c);
    // order: players sorted by seat, starting left of the dealer
    const dealerSeat = (rec.order.find(o => o.pid === rec.dealer) || {}).seat;
    const maxSeats = v.settings.maxSeats;
    const sorted = rec.order.slice().sort((a, b) => ((a.seat - dealerSeat - 1 + maxSeats * 2) % maxSeats) - ((b.seat - dealerSeat - 1 + maxSeats * 2) % maxSeats));
    sorted.forEach((o, k) => {
      const pl = v.players.find(p => p.pid === o.pid);
      if (!pl || !pl.cards) return;
      [deck[k], deck[n + k]].forEach((c, i) => {
        if (pl.cards[i] && pl.cards[i] !== '??') { r.holeChecked++; if (pl.cards[i] !== c) r.holeOk = false; }
      });
    });
    r.ok = r.commitOk && r.deckOk && r.boardOk && r.holeOk;
    return r;
  }
  function fairStats() {
    const done = Object.values(hands).filter(x => x.result);
    return { done, ok: done.filter(x => x.result.ok).length };
  }
  function openFairness() {
    const draw = () => {
      const st = fairStats(), cur = view && view.h;
      const rows = Object.values(hands).sort((a, b) => b.num - a.num).map(x => {
        const r = x.result;
        return '<div class="prow"><span>Hand #' + x.num + '</span><span class="nm mono">' + x.commit.slice(0, 20) + '…</span>' +
          (r ? (r.ok ? '<span class="ok">✓ verified</span>' : '<span class="bad">✗ MISMATCH</span>') : '<span class="hint">in progress</span>') + '</div>';
      }).join('') || '<p class="hint">No hands observed yet.</p>';
      modal('<h2>🔒 Fairness</h2>' +
        '<p>Before any card is dealt, the host’s browser shuffles a 52-card deck using the cryptographic RNG (<code>crypto.getRandomValues</code>, unbiased Fisher-Yates) and publishes a <b>SHA-256 commitment</b> of that deck. When the hand ends the deck and salt are revealed. <b>Your browser re-hashes them and checks</b> that (1) the hash matches what was published at the start, (2) the deck has 52 unique cards, (3) the board and your hole cards came off the top of that exact deck in the right order.</p>' +
        '<p>So the deck can’t be changed after seeing the betting — and there’s no hidden “rigging” logic, as the full source is open on GitHub.</p>' +
        (cur ? '<h3>Current hand #' + cur.num + '</h3><div class="mono">' + cur.commit + '</div>' : '') +
        '<h3>Your verification log — ' + st.ok + '/' + st.done.length + ' hands verified</h3>' + rows +
        '<div class="btns"><button class="btn" id="m-close">Close</button></div>', m => { m.querySelector('#m-close').onclick = closeModal; });
    };
    draw(); modalRefresh = draw;
  }
  function renderBadge() {
    const st = fairStats(), b = $('#fair-badge');
    const bad = st.done.length - st.ok;
    b.textContent = bad ? '⚠ ' + bad + ' mismatch!' : 'Fair ' + (st.done.length ? '✓ ' + st.ok + '/' + st.done.length : '');
    b.style.color = bad ? 'var(--red)' : '';
  }

  /* ================= rendering ================= */
  function render() {
    if (!view) return;
    renderBadge(); renderTable(); renderActions(); renderLog();
  }
  function seatPos(seat, mySeat, N) {
    const rel = (seat - mySeat + N) % N, th = (90 + rel * 360 / N) * Math.PI / 180;
    return { x: 50 + 45 * Math.cos(th), y: 50 + 43 * Math.sin(th) };
  }
  function renderTable() {
    const v = view, h = v.h, N = v.settings.maxSeats;
    const meP = v.players.find(p => p.pid === pid);
    const mySeat = meP ? meP.seat : 0;
    const winAmt = {};
    if (h && h.over && h.results) h.results.forEach(r => r.winners.forEach(w => winAmt[w.pid] = (winAmt[w.pid] || 0) + w.amt));
    const winCards = new Set();
    let html = '';
    const bySeat = {}; v.players.forEach(p => bySeat[p.seat] = p);
    for (let s = 0; s < N; s++) {
      const pos = seatPos(s, mySeat, N), p = bySeat[s];
      const st = 'left:' + pos.x + '%;top:' + pos.y + '%';
      if (!p) {
        const avail = !meP;
        html += '<div class="seat empty' + (avail ? ' avail' : '') + '" data-seat="' + s + '" style="' + st + '"><div class="plate">Seat ' + (s + 1) + '</div></div>';
        continue;
      }
      const me = p.pid === pid, turn = h && h.toAct === p.pid && h.mode === 'bet';
      const cls = ['seat'];
      if (me) cls.push('me'); if (turn) cls.push('turn'); if (p.folded) cls.push('folded');
      if (p.sitOut || (!p.inHand && p.stack === 0)) cls.push('out'); if (!p.connected) cls.push('off');
      const won = winAmt[p.pid];
      if (won) cls.push('winner');
      let tag = '';
      if (won) tag = '+' + won + (p.hn && p.hn.length ? ' · ' + p.hn[0] : '');
      else if (p.folded) tag = 'FOLD';
      else if (p.allin && p.inHand) tag = 'ALL IN';
      else if (p.hn && p.hn.length && h && (h.over || h.mode !== 'bet')) tag = p.hn.length > 1 && p.hn[0] !== p.hn[1] ? p.hn.join(' / ') : p.hn[0];
      else if (!p.connected) tag = 'disconnected';
      else if (p.sitOut) tag = 'sitting out';
      else if (!p.inHand && p.stack === 0) tag = 'busted';
      else if (!p.inHand && h && !h.over) tag = 'waiting';
      let hole = '';
      if (p.cards) {
        hole = '<div class="hole">' + p.cards.map((c, i) => cardHTML(c, (p.folded && me ? 'dim ' : '') + (won && c !== '??' ? 'win' : ''))).join('') + '</div>';
      }
      html += '<div class="' + cls.join(' ') + '" style="' + st + '">' + hole +
        '<div class="plate"><div class="nm">' + esc(p.name) + (v.hostPid === p.pid ? ' ★' : '') + '</div><div class="stk">' + p.stack + '</div>' +
        (turn && h.timeLeft !== null ? '<div class="tbar"><i data-tl="' + h.timeLeft + '" data-total="' + (v.settings.timer * 1000) + '"></i></div>' : '') + '</div>' +
        (tag ? '<div class="tagline' + (p.allin && !won ? ' allin' : '') + '">' + esc(tag) + '</div>' : '') + '</div>';
      if (p.bet > 0) {
        const bx = pos.x + (50 - pos.x) * 0.42, by = pos.y + (47 - pos.y) * 0.42;
        html += '<div class="bet" style="left:' + bx + '%;top:' + by + '%">' + p.bet + '</div>';
      }
      if (h && h.dealer === p.pid) {
        const dx = pos.x + (50 - pos.x) * 0.2 + (pos.x < 50 ? 7 : -7) * 0.0, dy = pos.y + (50 - pos.y) * 0.2;
        html += '<div class="dbtn" style="left:' + (pos.x + (50 - pos.x) * 0.2 + (pos.x < 50 ? 9 : -9)) + '%;top:' + dy + '%">D</div>';
      }
    }
    $('#seats').innerHTML = html;
    document.querySelectorAll('.seat.empty.avail').forEach(el => el.onclick = () => openSit(+el.dataset.seat));

    // center
    let msg = '';
    if (v.phase === 'lobby') {
      const n = v.players.length;
      msg = '<div class="big">Waiting for players</div><div>' + n + ' seated · share the invite link' + (v.isHost ? '' : ' · host will start the game') + '</div>';
      if (v.isHost) msg += '<button class="btn primary" id="btn-start" style="margin-top:8px"' + (n < 2 ? ' disabled' : '') + '>Start game</button>';
    } else if (v.phase === 'paused' && (!h || h.over)) {
      msg = '<div class="big">Game paused</div>' + (v.isHost ? '<button class="btn primary" id="btn-resume-game" style="margin-top:8px">Resume</button>' : '');
    } else if (!h || (h.over && v.nextIn === null)) {
      msg = '<div>Waiting for at least 2 players with chips…</div>';
    } else if (h.over && v.nextIn !== null) {
      msg = '<div>Next hand in <span class="countdown" data-next="' + v.nextIn + '">' + Math.ceil(v.nextIn / 1000) + '</span>s</div>';
    } else if (h.mode === 'ritprompt') {
      msg = '<div class="big">Run it twice?</div>';
    }
    $('#msg').innerHTML = msg;
    const sb = $('#btn-start'); if (sb) sb.onclick = () => send({ t: 'admin', op: 'start' });
    const rg = $('#btn-resume-game'); if (rg) rg.onclick = () => send({ t: 'admin', op: 'pause', v: false });

    $('#pot').innerHTML = h && h.pot > 0 ? '<span>Pot: ' + h.pot + '</span>' : '';
    // boards
    let b = '';
    if (h) {
      const slots = arr => { let s = ''; for (let i = 0; i < 5; i++) s += arr[i] ? cardHTML(arr[i]) : '<div class="slot"></div>'; return s; };
      const winnersCards = '';
      if (h.board2) {
        b += '<div class="board sm"><span class="lbl">Run 1</span>' + slots(h.board) + '</div>';
        b += '<div class="board sm"><span class="lbl">Run 2</span>' + slots(h.board2) + '</div>';
      } else b += '<div class="board">' + slots(h.board) + '</div>';
      if (h.rabbit) b += '<div class="board rabbit sm"><span class="lbl">🐇</span>' + h.rabbit.map(c => cardHTML(c)).join('') + '</div>';
    }
    $('#boards').innerHTML = b;
  }

  function renderActions() {
    const v = view, h = v.h, me = v.me, mp = v.players.find(p => p.pid === pid);
    const el = $('#actions');
    const util = [];
    let main = '';
    let sig;
    if (!mp) {
      const sig2 = 'spectator' + (me ? me.stack : 0) + v.phase;
      if (sig2 === actSig) return; actSig = sig2;
      el.innerHTML = '<div class="hint">' + (me && me.stack > 0 ? 'You have ' + me.stack + ' chips — ' : '') + 'click an empty seat to join the table. ' + (v.spectators.length ? '(' + v.spectators.length + ' watching)' : '') + '</div>';
      return;
    }
    const myBet = mp.bet, toCall = h ? Math.max(0, h.currentBet - myBet) : 0;
    const myTurn = !!(h && h.toAct === pid && h.mode === 'bet');
    const live = h && h.mode === 'bet' && !h.over && mp.inHand && !mp.folded;
    const maxTo = myBet + mp.stack;
    const canRaise = myTurn && !me.noRaise && mp.stack > toCall;
    const minTo = h ? Math.min(maxTo, h.currentBet + h.minRaise) : 0;
    const votable = h && h.mode === 'ritprompt' && mp.inHand && !mp.folded;
    const canShow = h && h.over && mp.inHand && mp.cards && mp.cards.length === 2 && !(mp.shown[0] && mp.shown[1]);

    sig = [myTurn, toCall, mp.stack, myBet, minTo, canRaise, h && h.pot, live, preFold, votable, mp.vote, canShow, mp.shown.join(), h && h.canRabbit, me.sitOut, mp.pendingAdd, mp.pendingStand, h && h.over, h && h.num, v.phase].join('|');
    if (sig === actSig) return; actSig = sig;
    if (myTurn) {
      const potNow = h.pot;
      if (raiseVal === null || raiseVal < minTo || raiseVal > maxTo) raiseVal = minTo;
      main += '<div class="agroup"><button class="btn abtn fold" data-a="fold">Fold</button>';
      main += toCall > 0 ? '<button class="btn abtn call" data-a="call">Call ' + Math.min(toCall, mp.stack) + (toCall >= mp.stack ? ' (all-in)' : '') + '</button>' : '<button class="btn abtn call" data-a="check">Check</button>';
      main += '</div>';
      if (canRaise) {
        main += '<div class="raisebox"><div class="presets">' +
          '<button data-p="min">Min</button><button data-p="0.5">½ pot</button><button data-p="0.75">¾ pot</button><button data-p="1">Pot</button><button data-p="max">All-in</button></div>' +
          '<div class="rrow"><input type="range" id="r-range" min="' + minTo + '" max="' + maxTo + '" value="' + raiseVal + '" step="1"><input type="number" id="r-num" min="' + minTo + '" max="' + maxTo + '" value="' + raiseVal + '"></div>' +
          '<button class="btn abtn raise" id="r-go"></button></div>';
      }
    } else if (votable) {
      main += '<div class="agroup"><b>Run it twice?</b>' +
        (mp.vote === null ? '<button class="btn abtn call" data-v="1">Yes</button><button class="btn abtn fold" data-v="0">No</button>' : '<span class="hint">You voted ' + (mp.vote ? 'yes' : 'no') + ' — waiting for others…</span>') +
        ' <span class="countdown" data-rit="' + h.ritLeft + '"></span></div>';
    } else if (live) {
      main += '<label class="chk"><input type="checkbox" id="pre-fold"' + (preFold ? ' checked' : '') + '> Check / Fold when it’s my turn</label>';
    } else {
      main += '<div class="hint">' + (h && !h.over && mp.folded ? 'You folded.' : h && !h.over && !mp.inHand ? 'You’ll be dealt in next hand.' : '') + '</div>';
    }
    // utilities
    if (canShow) {
      if (!mp.shown[0] && !mp.shown[1]) util.push('<button class="btn sm" data-show="0">Show ' + cardTxt(mp.cards[0]) + '</button><button class="btn sm" data-show="1">Show ' + cardTxt(mp.cards[1]) + '</button><button class="btn sm" data-show="both">Show both</button>');
      else util.push('<button class="btn sm" data-show="' + (mp.shown[0] ? 1 : 0) + '">Show ' + cardTxt(mp.cards[mp.shown[0] ? 1 : 0]) + '</button>');
    }
    if (h && h.canRabbit) util.push('<button class="btn sm" id="u-rabbit">🐇 Rabbit hunt</button>');
    util.push('<button class="btn sm" id="u-sitout">' + (me.sitOut ? 'I’m back' : 'Sit out') + '</button>');
    util.push('<button class="btn sm" id="u-rebuy">+ Add chips' + (mp.pendingAdd ? ' (' + mp.pendingAdd + ' queued)' : '') + '</button>');
    util.push('<button class="btn sm" id="u-stand">' + (mp.pendingStand ? 'Standing up…' : 'Stand up') + '</button>');
    el.innerHTML = main + '<div class="agroup">' + util.join('') + '</div>';

    // wire
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { preFold = false; send({ t: 'act', a: b.dataset.a }); });
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => send({ t: 'vote', v: b.dataset.v === '1' }));
    el.querySelectorAll('[data-show]').forEach(b => b.onclick = () => send({ t: 'show', i: b.dataset.show === 'both' ? 'both' : +b.dataset.show }));
    const pf = $('#pre-fold'); if (pf) pf.onchange = () => { preFold = pf.checked; actSig = ''; };
    if (canRaise) {
      const range = $('#r-range'), num = $('#r-num'), go = $('#r-go');
      const upd = () => { go.textContent = (raiseVal >= maxTo ? 'All-in ' : h.currentBet === 0 ? 'Bet ' : 'Raise to ') + raiseVal; };
      const setv = x => { x = Math.max(minTo, Math.min(maxTo, Math.round(+x) || minTo)); raiseVal = x; range.value = x; num.value = x; upd(); };
      range.oninput = () => setv(range.value);
      num.onchange = () => setv(num.value);
      num.oninput = () => { raiseVal = Math.max(minTo, Math.min(maxTo, Math.round(+num.value) || minTo)); range.value = raiseVal; upd(); };
      el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
        const p = b.dataset.p;
        if (p === 'min') setv(minTo); else if (p === 'max') setv(maxTo);
        else setv(h.currentBet + (+p) * (h.pot + toCall));
      });
      go.onclick = () => { send({ t: 'act', a: 'raise', amt: raiseVal }); preFold = false; };
      upd();
    }
    const ur = $('#u-rabbit'); if (ur) ur.onclick = () => send({ t: 'rabbit' });
    $('#u-sitout').onclick = () => send({ t: 'sitout', v: !me.sitOut });
    $('#u-stand').onclick = () => send({ t: 'stand' });
    $('#u-rebuy').onclick = () => openRebuy();
  }
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.id === 'r-num' && e.key === 'Enter') { const g = $('#r-go'); if (g) g.click(); }
  });

  function renderLog() {
    const box = $('#log'), v = view;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    let added = false;
    for (const e of v.log) {
      if (e.id <= lastLogId) continue;
      lastLogId = e.id; added = true;
      const d = document.createElement('div');
      d.className = e.k;
      if (e.k === 'chat') { const i = e.m.indexOf(': '); d.innerHTML = '<b>' + esc(e.m.slice(0, i)) + '</b>: ' + esc(e.m.slice(i + 2)); }
      else if (e.m.startsWith('— Hand')) {
        d.className += ' div'; d.textContent = e.m.length > 60 ? e.m.slice(0, e.m.indexOf('Deck commitment')) + '🔒 ' + e.m.slice(e.m.lastIndexOf(' ') + 1, e.m.lastIndexOf(' ') + 13) + '…' : e.m;
      } else d.textContent = e.m;
      box.appendChild(d);
    }
    if (added && near) box.scrollTop = box.scrollHeight;
  }

  /* ---- timers (client-side countdowns between state pushes) ---- */
  function startUITimer() {
    if (startUITimer.on) return; startUITimer.on = true;
    setInterval(() => {
      if (!view) return;
      const el = performance.now() - viewAt;
      document.querySelectorAll('[data-tl]').forEach(i => {
        const left = Math.max(0, +i.dataset.tl - el);
        i.style.width = (100 * left / (+i.dataset.total || 1)) + '%';
        if (left < 6000) i.style.background = 'var(--red)';
      });
      document.querySelectorAll('[data-next]').forEach(s => s.textContent = Math.max(0, Math.ceil((+s.dataset.next - el) / 1000)));
      document.querySelectorAll('[data-rit]').forEach(s => s.textContent = Math.max(0, Math.ceil((+s.dataset.rit - el) / 1000)) + 's');
    }, 200);
  }

  /* ================= modals ================= */
  function openSit(seat) {
    const s = view.settings, saved = view.me && view.me.stack > 0;
    modal('<h2>Take seat ' + (seat + 1) + '</h2>' +
      (saved ? '<p>You’ll sit with your existing stack of <b>' + view.me.stack + '</b>.</p>' :
        '<label>Buy-in (' + s.buyMin + ' – ' + s.buyMax + ')<input id="m-buy" type="number" min="' + s.buyMin + '" max="' + s.buyMax + '" value="' + Math.min(s.buyMax, Math.max(s.buyMin, (game && game.st.defaultStack) || s.buyMax / 2)) + '"></label>') +
      '<p class="hint">You’ll be dealt in at the next hand.</p>' +
      '<div class="btns"><button class="btn" id="m-cancel">Cancel</button><button class="btn primary" id="m-ok">Sit down</button></div>', m => {
        m.querySelector('#m-cancel').onclick = closeModal;
        const buy = m.querySelector('#m-buy'); if (buy) buy.focus();
        m.querySelector('#m-ok').onclick = () => { send({ t: 'sit', seat, buyin: buy ? +buy.value : 0 }); closeModal(); };
        if (buy) buy.onkeydown = e => { if (e.key === 'Enter') m.querySelector('#m-ok').click(); };
      });
  }
  function openRebuy() {
    const s = view.settings, me = view.me;
    const room = Math.max(0, s.buyMax - me.stack - (me.pendingAdd || 0));
    modal('<h2>Add chips</h2><p>Your stack: <b>' + me.stack + '</b>. You can add up to <b>' + room + '</b> (table max ' + s.buyMax + ').' + ' If you’re in a hand, chips arrive next hand.</p>' +
      '<label>Amount<input id="m-amt" type="number" min="1" max="' + room + '" value="' + Math.min(room, s.buyMin) + '"></label>' +
      '<div class="btns"><button class="btn" id="m-cancel">Cancel</button><button class="btn primary" id="m-ok">Add</button></div>', m => {
        m.querySelector('#m-cancel').onclick = closeModal;
        m.querySelector('#m-amt').focus();
        m.querySelector('#m-ok').onclick = () => { send({ t: 'rebuy', amt: +m.querySelector('#m-amt').value }); closeModal(); };
      });
  }
  function openAdmin() {
    if (!isHost || !view) return;
    const draw = () => {
      const s = view.settings;
      const f = (id, label, val) => '<label>' + label + '<input id="a-' + id + '" type="number" min="0" value="' + val + '"></label>';
      const rows = Object.values(game.st.players).filter(p => p.pid !== pid).map(p =>
        '<div class="prow"><span class="nm">' + esc(p.name) + (p.connected ? '' : ' <span class="hint">(offline)</span>') + (p.seat === null ? ' <span class="hint">spectator</span>' : '') + '</span>' +
        '<input type="number" data-stack="' + p.pid + '" value="' + p.stack + '"><button class="btn sm" data-setstack="' + p.pid + '">Set</button><button class="btn sm danger" data-kick="' + p.pid + '">Kick</button></div>').join('') || '<p class="hint">Nobody else has joined yet.</p>';
      const old = document.querySelector('.modal'); const keepScroll = old ? old.scrollTop : 0;
      const m = modal('<h2>⚙ Game settings</h2>' +
        '<div class="btns" style="justify-content:flex-start;margin:0 0 6px">' +
        (view.phase === 'lobby' ? '<button class="btn primary" id="a-start">Start game</button>' : view.phase === 'paused' ? '<button class="btn primary" id="a-resume">Resume game</button>' : '<button class="btn" id="a-pause">Pause after this hand</button>') + '</div>' +
        '<div class="grid2">' + f('sb', 'Small blind', s.sb) + f('bb', 'Big blind', s.bb) + f('ante', 'Ante', s.ante) + f('timer', 'Action timer (sec, 0 = off)', s.timer) +
        f('buyMin', 'Min buy-in', s.buyMin) + f('buyMax', 'Max stack', s.buyMax) + f('delay', 'Seconds between hands', s.delay) + '</div>' +
        '<div class="chkrow"><input type="checkbox" id="a-rit"' + (s.rit ? ' checked' : '') + '><label style="margin:0;color:inherit;font-size:14px" for="a-rit">Allow “run it twice” when players are all-in</label></div>' +
        '<div class="chkrow"><input type="checkbox" id="a-rabbit"' + (s.rabbit ? ' checked' : '') + '><label style="margin:0;color:inherit;font-size:14px" for="a-rabbit">Allow rabbit hunting</label></div>' +
        '<div class="btns" style="justify-content:flex-start"><button class="btn primary" id="a-save">Save settings (next hand)</button></div>' +
        '<h3>Players</h3>' + rows + '<div class="btns"><button class="btn" id="m-close">Close</button></div>', m => {
          m.scrollTop = keepScroll;
          m.querySelector('#m-close').onclick = closeModal;
          const bind = (id, fn) => { const b = m.querySelector(id); if (b) b.onclick = fn; };
          bind('#a-start', () => send({ t: 'admin', op: 'start' }));
          bind('#a-resume', () => send({ t: 'admin', op: 'pause', v: false }));
          bind('#a-pause', () => send({ t: 'admin', op: 'pause', v: true }));
          bind('#a-save', () => {
            const g = id => +m.querySelector('#a-' + id).value;
            send({ t: 'admin', op: 'settings', s: { sb: g('sb'), bb: g('bb'), ante: g('ante'), timer: g('timer'), buyMin: g('buyMin'), buyMax: g('buyMax'), delay: g('delay'), rit: m.querySelector('#a-rit').checked, rabbit: m.querySelector('#a-rabbit').checked } });
            toast('Settings saved');
          });
          m.querySelectorAll('[data-setstack]').forEach(b => b.onclick = () => { send({ t: 'admin', op: 'stack', pid: b.dataset.setstack, n: +m.querySelector('[data-stack="' + b.dataset.setstack + '"]').value }); toast('Stack updated'); });
          m.querySelectorAll('[data-kick]').forEach(b => b.onclick = () => { if (confirm('Remove this player from the table?')) send({ t: 'admin', op: 'kick', pid: b.dataset.kick }); });
        });
    };
    draw();
    // refresh only the player list/phase buttons when state changes without wiping edits: only redraw if player set changed
    let sigPl = Object.keys(game.st.players).join() + view.phase;
    modalRefresh = () => { const s2 = Object.keys(game.st.players).join() + view.phase; if (s2 !== sigPl) { sigPl = s2; draw(); } };
  }

  /* ================= boot ================= */
  const code = parseCode(location.hash);
  const saved = loadSavedHost();
  if (code && saved && saved.code === code && myName) {
    // host reopening their own link: resume automatically
    enterHost(code, new PT.Game(saved.state));
  } else showLanding();
  // expose for debugging
  window.__pt = { get view() { return view; }, get game() { return game; } };
})();
