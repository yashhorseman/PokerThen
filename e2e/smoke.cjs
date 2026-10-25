// Browser smoke test: real browser contexts play against a running server.
//   npm run build && PORT=8790 DATA_DIR=/tmp/pt-e2e npm start     (in one terminal)
//   BASE=http://localhost:8790 npm run e2e
// Set CHROME_PATH if Chrome is not in the default macOS location.
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://localhost:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = (p, text, scope = 'button') => p.evaluate((t, sc) => { const b = [...document.querySelectorAll(sc)].find((x) => (x.innerText || x.textContent || '').trim().toUpperCase().startsWith(t.toUpperCase())); if (b) { b.click(); return true; } return false; }, text, scope);
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!ok) process.exitCode = 1; };

async function sit(p, seat, nick, url) {
  if (url) { await p.goto(url); await sleep(1200); }
  for (let k = 0; k < 4 && !(await p.$('#sf-nick')); k++) { await p.click(`[aria-label^="Empty seat ${seat}"]`).catch(() => {}); await sleep(600); }
  if (nick) { await p.$eval('#sf-nick', (e) => (e.value = '')); await p.type('#sf-nick', nick); }
  await p.click('.modal .btn.primary'); await sleep(600);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  const mk = async (name) => { const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1440, height: 900 }); p.on('pageerror', (e) => { console.log(name, 'PAGEERROR', e.message); process.exitCode = 1; }); return p; };
  const H = await mk('host'), A = await mk('ann'), B = await mk('bob');
  await H.goto(BASE + '/'); await H.type('#nick', 'Yash'); await H.click('button.btn.primary.big');
  await H.waitForFunction(() => location.pathname.startsWith('/t/')); const url = H.url(); await sleep(1000);
  await sit(H, 1);
  await sit(A, 3, 'Ann', url); await sit(B, 6, 'Bob', url);
  check('host gets a join-request popup', await H.waitForSelector('.joinreq', { timeout: 5000 }).then(() => true, () => false));
  for (let i = 0; i < 2; i++) { await clickText(H, 'ACCEPT', '.joinreq button'); await sleep(700); }

  // enable rabbit hunting + fast showdown from Options → Game configurations
  await H.evaluate(() => document.querySelector('.rail-btn')?.click()); await sleep(300);
  await clickText(H, 'Game configurations', '.optmenu-item'); await sleep(500);
  await H.evaluate(() => { const f = [...document.querySelectorAll('.field')].find((x) => x.textContent.includes('Rabbit hunting')); f.querySelector('.seg-btns button').click(); });
  await clickText(H, 'Fast 3s', '.seg-btns button'); await clickText(H, 'Save changes'); await sleep(500);
  await H.keyboard.press('Escape'); await sleep(300);
  check('SHUFFLE SEATS and START GAME are offered to the host', await H.evaluate(() => [...document.querySelectorAll('button')].some((b) => /^SHUFFLE SEATS/.test(b.innerText)) && [...document.querySelectorAll('button')].some((b) => /^START GAME/.test(b.innerText))));
  await clickText(H, 'START GAME'); await sleep(4200);

  // reload mid-hand keeps seat and cards
  const myCards = (p) => p.$$eval('.seat.me .card.face', (els) => els.map((e) => e.getAttribute('aria-label')));
  const before = await myCards(A);
  await A.reload(); await sleep(1800);
  const after = await myCards(A);
  check('reload keeps seat and hole cards', before.length === 2 && JSON.stringify(before) === JSON.stringify(after), before.join(', '));

  // hand-strength badge appears once the flop is out
  const players = [H, A, B];
  const turn = async () => { for (const p of players) if (await p.$('.abtn-call:not([disabled])')) return p; return null; };
  for (let i = 0; i < 20; i++) { const board = await H.evaluate(() => document.querySelectorAll('.board .card.face').length); if (board >= 3) break; const p = await turn(); if (p) await p.click('.abtn-call'); await sleep(450); }
  await sleep(1200);
  check('hand-strength badge shows under my cards after the flop', await H.evaluate(() => !!document.querySelector('.seat.me .hand-badge')));

  // chat
  await A.keyboard.press('m'); await sleep(300);
  await A.type('#chat-input', 'hello table'); await A.keyboard.press('Enter'); await sleep(700);
  check('chat reaches the host', await H.evaluate(() => document.body.innerText.includes('hello table')));

  // finish this hand by folding everyone to a raise next hand → rabbit hunting
  for (let i = 0; i < 40; i++) { if (await H.evaluate(() => /Next hand in|wins/.test(document.body.innerText))) break; const p = await turn(); if (p) await p.click('.abtn-call'); await sleep(400); }
  await sleep(4500); // wait for the next hand to start
  for (let i = 0; i < 10; i++) { const p = await turn(); if (!p) { await sleep(300); continue; } if (await p.$('.abtn-raise:not([disabled])')) { await p.click('.abtn-raise'); await sleep(300); await clickText(p, 'RAISE TO', 'button'); break; } await p.click('.abtn-call'); await sleep(300); }
  await sleep(500);
  for (let i = 0; i < 4; i++) { const p = await turn(); if (!p) break; await p.click('.abtn-fold'); await sleep(500); }
  await sleep(800);
  let rabbitPage = null;
  for (const p of players) if (await p.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('REVEAL REMAINING BOARD')))) { rabbitPage = p; break; }
  check('rabbit hunting is offered after a fold-win', !!rabbitPage);
  if (rabbitPage) {
    await clickText(rabbitPage, '🐇'); await sleep(900);
    check('rabbit cards appear for the requester only', (await rabbitPage.$$eval('.board.rabbit .card.face', (e) => e.length)) > 0);
    let leaked = 0; for (const p of players.filter((x) => x !== rabbitPage)) leaked += await p.$$eval('.board.rabbit .card.face', (e) => e.length);
    check('rabbit cards are not shown to others', leaked === 0);
  }

  // add-chips request → host popup → approve
  await B.evaluate(() => document.querySelector('.rail-btn')?.click()); await sleep(300);
  await clickText(B, 'Add chips', '.optmenu-item'); await sleep(400); await clickText(B, 'Request', '.modal button'); await sleep(800);
  check('host sees the add-chips request popup', await H.evaluate(() => /add chips/i.test(document.querySelector('.joinreq')?.innerText ?? '')));
  await clickText(H, 'ACCEPT', '.joinreq button'); await sleep(600);

  // session log + ledger reconcile
  await H.keyboard.press('l'); await sleep(500); await clickText(H, 'Ledger', '.logmodal-tabs button'); await sleep(400);
  check('ledger reconciles', await H.evaluate(() => /Reconciled/.test(document.querySelector('.logmodal')?.innerText ?? '')));
  await H.keyboard.press('Escape');

  // leave seat
  A.on('dialog', (d) => d.accept());
  await sleep(3500);
  await clickText(A, 'Leave seat', '.rail-btn'); await sleep(2500);
  check('leaving a seat puts the viewer back in spectator mode', await A.evaluate(() => /watching|Leaving|Click an empty seat/i.test(document.body.innerText)));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
