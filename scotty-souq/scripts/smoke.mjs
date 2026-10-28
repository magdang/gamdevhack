import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../.smoke/', import.meta.url);
await mkdir(output, { recursive: true });
const source = await readFile(new URL('../src/enemies/index.ts', import.meta.url), 'utf8');
const fake = process.argv.includes('--fake') || (!process.argv.includes('--real') && source.includes('// STUB'));
const reports = [];
const errors = [];
let preview;
let browser;
let serverLog = '';

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const snapshot = (page) => page.evaluate(() => {
  const g = window.__game;
  return { state: g.state, paused: g.paused, wave: g.wave, hp: g.player.hp,
    position: { x: g.player.position.x, z: g.player.position.z }, enemies: g.enemies,
    boss: g.boss ? { ...g.boss } : null, score: g.score, combo: g.combo, time: g.time,
    counters: { ...g.counters }, states: [...g.states], renderer: { ...g.renderer } };
});

try {
  await run('npm', ['run', 'build']);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  preview.stdout.on('data', (data) => { serverLog += data; });
  preview.stderr.on('data', (data) => { serverLog += data; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Preview did not start: ${serverLog}`)), 15000);
    preview.once('error', (error) => { clearTimeout(timeout); reject(error); });
    preview.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Preview exited ${code}: ${serverLog}`)); });
    preview.stdout.on('data', () => { if (serverLog.includes('http://')) { clearTimeout(timeout); resolve(); } });
  });
  browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  console.log(`[smoke] ${fake ? 'fake contract harness' : 'production enemies kit'}`);

  async function pageFor(params, mobile = false) {
    const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
    const query = new URLSearchParams({ intro: '0', seed: '7', mute: '1', ...params });
    if (fake) query.set('fake', '1');
    await page.goto(`${base}/?${query}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__game?.state !== undefined);
    return { page, context };
  }

  // Title, intent wiring, keyboard movement, pause and repeated restart without owned-resource growth.
  {
    const { page, context } = await pageFor({ god: '1' });
    assert.equal((await snapshot(page)).state, 'title');
    await page.screenshot({ path: fileURLToPath(new URL('01-title.png', output)) });
    await page.evaluate(() => window.__game.events.emit('ui:start', {}));
    await page.waitForFunction(() => window.__game.state === 'playing');
    const before = await snapshot(page);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
    const moved = await snapshot(page);
    assert.ok(Math.hypot(moved.position.x - before.position.x, moved.position.z - before.position.z) > 0.5, 'W moves Scotty');
    await page.keyboard.press('KeyP');
    const paused = await snapshot(page);
    assert.equal(paused.paused, true);
    await page.waitForTimeout(300);
    assert.equal((await snapshot(page)).time, paused.time, 'pause freezes simulation');
    await page.keyboard.press('Escape');
    assert.equal((await snapshot(page)).paused, false);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__game.counters.dashes > 0);
    await page.waitForTimeout(400);
    const memory = (await snapshot(page)).renderer;
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.__game.events.emit('ui:restart', {}));
      await page.waitForFunction(() => window.__game.state === 'playing' && window.__game.player.hp === 5);
      await page.waitForTimeout(100);
    }
    const result = await snapshot(page);
    assert.equal(result.counters.restarts, 3);
    assert.equal(await page.locator('[data-core-joystick]').count(), 1);
    if (fake) assert.ok(result.renderer.geometries <= memory.geometries + 2, 'restarts reuse geometry');
    reports.push({ scenario: 'title, controls, pause, restart', ...result });
    console.log('[smoke] title, controls, pause and restart passed');
    await context.close();
  }

  // Twenty real seconds of real combat, with a bot issuing human movement and dash intents.
  {
    const { page, context } = await pageFor({ autoplay: '1', god: '1' });
    await page.waitForFunction(() => window.__game.state === 'playing');
    await page.waitForTimeout(20000);
    const result = await snapshot(page);
    assert.equal(result.hp, 5, 'god mode preserves HP');
    assert.ok(result.score > 0 && result.counters.hits > 0 && result.counters.dashes > 0, 'autoplay makes combat progress');
    assert.ok(result.counters.kills > 0 || result.wave > 1, 'autoplay kills enemies');
    await page.screenshot({ path: fileURLToPath(new URL('02-autoplay.png', output)) });
    reports.push({ scenario: '20 second autoplay', ...result });
    console.log(`[smoke] autoplay: wave ${result.wave}, score ${result.score}, kills ${result.counters.kills}`);
    await context.close();
  }

  // Boss-start debug path and a complete Final Cut using the same bot as ordinary combat.
  {
    const { page, context } = await pageFor({ wave: '6', god: '1', autoplay: '1' });
    await page.waitForFunction(() => window.__game.state === 'bossFight' && window.__game.boss?.hp > 0, null, { timeout: 20000 });
    const initial = (await snapshot(page)).boss.hp;
    await page.waitForFunction((hp) => window.__game.boss?.hp < hp, initial, { timeout: 20000 });
    const damaged = await snapshot(page);
    await page.screenshot({ path: fileURLToPath(new URL('03-boss.png', output)) });
    console.log(`[smoke] boss damage: ${initial} -> ${damaged.boss.hp}; waiting for Final Cut`);
    await page.waitForFunction(() => window.__game.state === 'finalCut', null, { timeout: 120000 });
    await page.waitForTimeout(850);
    await page.screenshot({ path: fileURLToPath(new URL('04-final-cut.png', output)) });
    await page.waitForFunction(() => window.__game.state === 'victory', null, { timeout: 20000 });
    const result = await snapshot(page);
    assert.equal(result.boss.hp, 0);
    assert.equal(result.counters.finalCuts, 1);
    assert.ok(result.states.includes('bossIntro') && result.states.includes('bossFight') && result.states.includes('finalCut'));
    await page.screenshot({ path: fileURLToPath(new URL('05-victory.png', output)) });
    reports.push({ scenario: 'boss damage and Final Cut victory', initialBossHp: initial, ...result });
    console.log('[smoke] Final Cut and victory passed');
    await context.close();
  }

  // Portrait touch: a second finger cannot replace the captured first pointer.
  {
    const { page, context } = await pageFor({ god: '1' }, true);
    await page.evaluate(() => window.__game.events.emit('ui:start', {}));
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const p = (id, x, y) => ({ id, x, y, radiusX: 2, radiusY: 2, force: 1 });
    await touch('touchStart', [p(1, 80, 620)]);
    await touch('touchStart', [p(1, 80, 620), p(2, 300, 600)]);
    await touch('touchMove', [p(1, 150, 620), p(2, 240, 500)]);
    await page.waitForTimeout(400);
    assert.equal((await snapshot(page)).counters.dashes, 0, 'held drag is not a swipe');
    const joystick = page.locator('[data-core-joystick]');
    assert.equal(await joystick.evaluate((el) => el.style.left), '10px', 'first finger keeps joystick origin');
    await touch('touchEnd', []);
    const before = await snapshot(page);
    await touch('touchStart', [p(1, 80, 620)]);
    await touch('touchMove', [p(1, 160, 540)]);
    await touch('touchEnd', []);
    await page.waitForFunction(() => window.__game.counters.dashes > 0);
    await page.waitForTimeout(300);
    const result = await snapshot(page);
    assert.ok(Math.hypot(result.position.x - before.position.x, result.position.z - before.position.z) > 1);
    await page.screenshot({ path: fileURLToPath(new URL('06-portrait-touch.png', output)) });
    reports.push({ scenario: 'portrait and multi-touch', ...result });
    console.log('[smoke] portrait and multi-touch passed');
    await context.close();
  }
  assert.deepEqual(errors, [], 'no browser console errors or uncaught exceptions');
  console.log('[smoke] all scenarios passed with no console errors');
} catch (error) {
  console.error(error);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify({ fake, reports, errors }, null, 2));
  await browser?.close();
  if (preview && preview.exitCode === null) {
    const stopped = new Promise((resolve) => preview.once('exit', resolve));
    preview.kill('SIGTERM'); await stopped;
  }
}
