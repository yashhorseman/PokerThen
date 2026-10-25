// Browser smoke test: four real browser contexts play against a running server.
//   npm run build && npm start        (in one terminal)
//   BASE=http://localhost:8787 npm run e2e
// Set CHROME_PATH if Chrome is not in the default macOS location.
const puppeteer = require('puppeteer-core');
const os = require('node:os');
const S = os.tmpdir() + '/pokerthen-e2e-';
const BASE = process.env.BASE || 'http://localhost:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = (p, text, scope = 'button') => p.evaluate((t, sc) => { const b = [...document.querySelectorAll(sc)].find((x) => x.textContent.trim().startsWith(t)); if (b) b.click(); return !!b; }, text, scope);
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!ok) process.exitCode = 1; };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
  const mk = async (name) => { const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1440, height: 900 }); p.on('pageerror', (e) => { console.log(name, 'PAGEERROR', e.message); process.exitCode = 1; }); return p; };
  const H = await mk('host'), A = await mk('ann'), B = await mk('bob');
  await H.goto(BASE + '/'); await H.type('#nick', 'Yash'); await H.click('button.btn.primary.big');
  await H.waitForFunction(() => location.pathname.startsWith('/t/')); const url = H.url(); await sleep(600);
  await H.click('[aria-label^="Empty seat 1"]'); await sleep(200); await H.click('.modal .btn.primary'); await sleep(500);
  for (const [p, nm, seat] of [[A, 'Ann', 3], [B, 'Bob', 6]]) {
    await p.goto(url); await sleep(700);
    await p.click(`[aria-label^="Empty seat ${seat}"]`); await sleep(150);
    await p.$eval('#sf-nick', (e) => (e.value = '')); await p.type('#sf-nick', nm); await p.click('.modal .btn.primary'); await sleep(350);
  }
  await clickText(H, '⚙'); await sleep(300);
  for (let i = 0; i < 2; i++) { await clickText(H, 'Approve', '.modal button'); await sleep(400); }
  // enable rabbit hunting + fast showdown
  await clickText(H, 'Game', '.tabs button'); await sleep(200);
  await H.evaluate(() => { const f = [...document.querySelectorAll('.field')].find((x) => x.textContent.includes('Rabbit hunting')); f.querySelector('.seg-btns button').click(); });
  await clickText(H, 'Fast 3s', '.seg-btns button'); await clickText(H, 'Save changes'); await sleep(400);
  await H.keyboard.press('Escape'); await sleep(200);
  await clickText(H, 'Start game'); await sleep(4000);

  // --- reload mid-hand keeps seat and cards (identity cookie) ---
  const cardsOf = (p) => p.$$eval('.seat.me .hole .card.face', (els) => els.map((e) => e.getAttribute('aria-label')));
  const before = await cardsOf(A);
  await A.reload(); await sleep(1500);
  const after = await cardsOf(A);
  check('reload keeps seat and hole cards', before.length === 2 && JSON.stringify(before) === JSON.stringify(after), before.join(', '));

  // --- chat ---
  await clickText(A, '💬'); await sleep(300);
  await A.type('#chat-input', 'hello table'); await A.keyboard.press('Enter'); await sleep(500);
  const chatSeen = await H.evaluate(() => document.body.innerText.includes('hello table'));
  await clickText(H, '💬'); await sleep(400);
  check('chat delivered to host', await H.evaluate(() => document.body.innerText.includes('hello table')) || chatSeen);

  // --- play: everyone folds to a raise → rabbit hunting available ---
  const players = [H, A, B];
  const turn = async () => { for (const p of players) if (await p.$('.abtn.fold')) return p; return null; };
  for (let i = 0; i < 10; i++) { const p = await turn(); if (!p) { await sleep(300); continue; } if (await p.$('.abtn.raise')) { await p.evaluate(() => document.querySelectorAll('.presets button')[2].click()); await sleep(100); await p.click('.abtn.raise'); break; } await p.click('.abtn.call'); await sleep(300); }
  await sleep(500);
  for (let i = 0; i < 4; i++) { const p = await turn(); if (!p) break; await p.click('.abtn.fold'); await sleep(500); }
  await sleep(600);
  let rabbitPage = null;
  for (const p of players) if (await p.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Reveal remaining board')))) { rabbitPage = p; break; }
  check('rabbit hunt offered after a fold-win', !!rabbitPage);
  if (rabbitPage) {
    await clickText(rabbitPage, '🐇'); await sleep(800);
    const rabbitCards = await rabbitPage.$$eval('.board.rabbit .card.face', (els) => els.length);
    check('rabbit cards appear only for the requester', rabbitCards === 5);
    const others = players.filter((p) => p !== rabbitPage);
    let leaked = 0; for (const p of others) leaked += await p.$$eval('.board.rabbit .card.face', (els) => els.length);
    check('rabbit cards are NOT shown to others', leaked === 0);
    await rabbitPage.screenshot({ path: S + '30-rabbit.png' });
  }
  // --- show cards after the hand ---
  const showBtn = await H.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.startsWith('Show')));
  console.log('show button on host:', showBtn);

  // --- add chips request flow ---
  await clickText(B, '+ Add chips'); await sleep(300); await clickText(B, 'Request', '.modal button'); await sleep(500);
  await clickText(H, '⚙'); await sleep(300);
  check('host sees the top-up request', await H.evaluate(() => document.body.innerText.includes('Wants to add chips')));
  await clickText(H, 'Approve', '.modal button'); await sleep(500);
  await H.keyboard.press('Escape');

  // --- leave seat ---
  await sleep(4000);
  A.on('dialog', (d) => d.accept());
  await clickText(A, 'Leave seat'); await sleep(2500);
  const aState = await A.evaluate(() => document.body.innerText);
  check('leaving seat returns the viewer to spectator mode', aState.includes('Click an empty seat') || aState.includes('Leaving'));
  await clickText(A, '📜'); await sleep(300); await clickText(A, 'Ledger', '.tabs button'); await sleep(300);
  const led = await A.evaluate(() => document.querySelector('.ledger')?.innerText ?? '');
  check('ledger reconciles', led.includes('Reconciled'), led.split('\n').slice(0, 3).join(' | '));
  await A.screenshot({ path: S + '31-ledger-after.png' });
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
