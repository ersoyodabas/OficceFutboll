import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from '../server/core/server.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'office-futboll-smoke-'));
const output = path.join(root, 'test-results');
await fs.mkdir(output, { recursive: true });
const server = createServer();
const { port } = await server.listen(0, '127.0.0.1');
const http = `http://127.0.0.1:${port}`, ws = `ws://127.0.0.1:${port}`;
let context;
const errors = [], warnings = [];
async function until(predicate, description, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${description}. Browser errors: ${errors.join('; ')}`);
}
function observe(page) {
  const messages = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('requestfailed', (r) => errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => messages.push(JSON.parse(String(payload)))));
  return messages;
}
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_TEST_EXECUTABLE || chromium.executablePath(),
    headless: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`,
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--enable-unsafe-swiftshader'],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const a = await context.newPage(), b = await context.newPage();
  const ma = observe(a), mb = observe(b);
  await a.goto(`chrome-extension://${extensionId}/game.html`);
  await a.locator('#serverInput').fill(ws);
  await a.locator('#nameInput').fill('Extension A');
  await a.locator('#connectBtn').click();
  await a.locator('#lobbyOverlay').waitFor({ state: 'visible' });
  await until(() => a.locator('#pitchSlots button').count().then((n) => n === 10), 'extension lobby slots');
  await a.locator('#lobbySettingsBtn').click();
  await a.locator('#settingsOverlay').waitFor({ state: 'visible' });
  assert.equal(await a.locator('#masterVolume').inputValue(), '0.5');
  await a.locator('#masterVolume').evaluate((element) => { element.value = '0.37'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await a.locator('#lobbyMusicVolume').evaluate((element) => { element.value = '0.63'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await a.locator('[data-binding="moveUp"]').click();
  await a.keyboard.press('i');
  assert.equal(await a.locator('[data-binding="moveUp"]').textContent(), 'I');
  await a.screenshot({ path: path.join(output, 'settings-extension.png') });
  await a.locator('#settingsCloseBtn').click();

  // A real invitation form joins the same server, via native ES modules over HTTP.
  await b.goto(`${http}/join?server=${encodeURIComponent(ws)}&from=Extension%20A`);
  await b.locator('#playerName').fill('Invite B');
  await b.locator('#joinBtn').click();
  await b.locator('#lobbyOverlay').waitFor({ state: 'visible' });
  await until(() => mb.some((m) => m.type === 'welcome'), 'invitation auto-join');
  await a.locator('[data-team="blue"][data-slot="4"]').click();
  await b.locator('[data-team="red"][data-slot="4"]').click();
  await until(() => ma.some((m) => m.type === 'lobby' && m.players.filter((p) => Number.isInteger(p.slot)).length === 2), 'shared team selection');
  await a.screenshot({ path: path.join(output, 'lobby-extension.png') });
  await b.screenshot({ path: path.join(output, 'lobby-invite.png') });
  await a.locator('#readyBtn').click();
  await b.locator('#readyBtn').click();
  await until(() => ma.some((m) => m.type === 'countdownStart') && mb.some((m) => m.type === 'countdownStart'), 'shared countdown');
  assert.deepEqual(ma.find((m) => m.type === 'countdownStart'), mb.find((m) => m.type === 'countdownStart'));
  await a.locator('#hud').waitFor({ state: 'visible' });
  await b.locator('#hud').waitFor({ state: 'visible' });
  await until(() => ma.some((m) => m.type === 'state') && mb.some((m) => m.type === 'state'), 'match snapshots');
  assert.deepEqual(ma.find((m) => m.type === 'matchStart'), mb.find((m) => m.type === 'matchStart'));
  const id = ma.find((m) => m.type === 'welcome').id;
  const latest = () => ma.findLast((m) => m.type === 'state');
  const before = latest().players.find((p) => p.id === id);
  await a.bringToFront();
  await a.locator('#app > canvas').focus();
  await a.keyboard.down('i');
  await until(() => latest().players.find((p) => p.id === id).x < before.x - .5, 'keyboard movement');
  await a.keyboard.up('i');
  await a.keyboard.press('s');
  await until(() => ma.some((m) => m.type === 'actionResult'), 'action request');
  await until(() => a.locator('#matchClock').textContent().then((t) => t !== '0:00'), 'server-driven clock');
  await a.screenshot({ path: path.join(output, 'match-extension.png') });
  await b.screenshot({ path: path.join(output, 'match-invite.png') });
  assert.equal(await a.locator('#scoreBlue').textContent(), await b.locator('#scoreBlue').textContent());
  assert.equal(await a.locator('#scoreRed').textContent(), await b.locator('#scoreRed').textContent());
  const snapshotsB = new Set(mb.filter((m) => m.type === 'state').map((m) => JSON.stringify(m)));
  assert.ok(ma.some((m) => m.type === 'state' && snapshotsB.has(JSON.stringify(m))), 'same authoritative ball/player/score snapshot reaches both clients');

  await a.keyboard.press('Escape');
  await a.locator('#matchMenu').waitFor({ state: 'visible' });
  await a.locator('#leaveMatchBtn').click();
  await a.locator('#lobbyOverlay').waitFor({ state: 'visible' });
  assert.equal(await b.locator('#hud').isVisible(), true);
  await b.bringToFront();
  await b.locator('#menuBtn').click();
  await b.locator('#leaveMatchBtn').click();
  await b.locator('#lobbyOverlay').waitFor({ state: 'visible' });
  // Reload the extension page and rejoin; local module/asset paths remain valid.
  await a.reload();
  await a.locator('#connectOverlay').waitFor({ state: 'visible' });
  await a.locator('#connectBtn').click();
  await a.locator('#lobbyOverlay').waitFor({ state: 'visible' });
  await a.locator('#lobbySettingsBtn').click();
  assert.equal(await a.locator('#masterVolume').inputValue(), '0.37');
  assert.equal(await a.locator('#lobbyMusicVolume').inputValue(), '0.63');
  assert.equal(await a.locator('[data-binding="moveUp"]').textContent(), 'I');
  await a.locator('#settingsCloseBtn').click();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, extensionId, screenshots: output, warnings: [...new Set(warnings)] }, null, 2));
} finally {
  await context?.close();
  await server.close();
  // Only remove the absolute isolated directory created by mkdtemp above.
  assert.ok(path.resolve(profile).startsWith(path.resolve(os.tmpdir()) + path.sep));
  await fs.rm(profile, { recursive: true, force: true });
}
