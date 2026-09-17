import { createGameState } from '../server/core/gameState.js';
import { HALF_L, BALL_R } from '../shared/field.js';
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
const serverState = createGameState();
const server = createServer({ state: serverState });
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
  // The server address is hidden in the UI, so the test server is passed like an invite link.
  await a.goto(`chrome-extension://${extensionId}/game.html?server=${encodeURIComponent(ws)}`);
  assert.equal(await a.locator('#serverInput').isVisible(), false);
  await a.locator('#nameInput').fill('Extension A');
  await a.locator('#connectBtn').click();
  await a.locator('#lobbyOverlay').waitFor({ state: 'visible' });
  await until(() => a.locator('#lobbySlots button').count().then((n) => n === 10), 'extension lobby slots');
  assert.equal(await a.locator('#app > canvas').count(), 1, 'the lobby draws with the game renderer, not a second one');
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

  // The server root serves the same client over HTTP and connects back to its own host.
  await b.goto(`${http}/`);
  assert.equal(await b.locator('#serverInput').inputValue(), ws);
  await b.locator('#nameInput').fill('Invite B');
  await b.locator('#connectBtn').click();
  await b.locator('#lobbyOverlay').waitFor({ state: 'visible' });
  await until(() => mb.some((m) => m.type === 'welcome'), 'root page join');
  for (const page of [a, b]) {
    assert.equal(await page.locator('#lobbyOverlay').evaluate((el) => el.scrollHeight <= el.clientHeight), true, 'lobby never scrolls vertically');
  }
  await a.locator('[data-team="blue"][data-slot="4"]').click();
  await b.locator('[data-team="red"][data-slot="4"]').click();
  await until(() => ma.some((m) => m.type === 'lobby' && m.players.filter((p) => Number.isInteger(p.slot)).length === 2), 'shared team selection');
  const playerId = ma.find((m) => m.type === 'welcome').id;
  assert.equal(await a.locator('#readyRoster [data-status="not-ready"]').count(), 2);
  assert.equal(await b.locator('.slot-card.not-ready .slot-state').first().textContent(), 'HAZIR DEĞİL');
  // Cards hang under the footballer they belong to, so their box spans the model.
  const card = await b.locator('.slot-card.occupied').first().evaluate((el) => ({
    head: Number(el.style.getPropertyValue('--head')), feet: Number(el.style.getPropertyValue('--feet')),
    width: Number(el.style.getPropertyValue('--w')), rect: el.getBoundingClientRect().height,
  }));
  assert.ok(card.feet > card.head + 60 && card.width > 40 && card.rect > 100, JSON.stringify(card));
  await b.locator('#chatToggleBtn').click();
  await b.locator('#chatPanel').waitFor({ state: 'visible' });
  await b.locator('#chatToggleBtn').click();
  await a.locator('#profileBtn').click();
  await a.locator('#profileNameInput').fill('   ');
  await a.locator('#profileSaveBtn').click();
  assert.ok((await a.locator('#profileStatus').textContent()).includes('boş'));
  await a.locator('#profileNameInput').fill('  Ersoy Odabaş  ');
  await a.screenshot({ path: path.join(output, 'profile-edit.png') });
  await a.locator('#profileSaveBtn').click();
  await a.locator('#profileDialog').waitFor({ state: 'hidden' });
  await until(() => b.locator(`[data-player-id="${playerId}"] .ready-player-name`).textContent().then((s) => s === 'Ersoy Odabaş'), 'profile broadcast');
  assert.equal(await a.evaluate(() => localStorage.getItem('officeFootballPlayerName')), 'Ersoy Odabaş');
  await a.locator('#profileBtn').click(); await a.keyboard.press('Escape');
  assert.equal(await a.locator('#profileBtn').evaluate((el) => document.activeElement === el), true, 'native dialog restores focus');

  await a.locator('[data-side="blue"] .club-edit').click();
  assert.ok((await a.locator('#clubResults').textContent()).startsWith('21'));
  await a.locator('#clubCountry').selectOption('Türkiye');
  await a.locator('#clubSearch').fill('Galatasaray');
  await a.locator('#clubConfirmBtn').click();
  await a.locator('#clubDialog').waitFor({ state: 'hidden' });
  await until(() => b.locator('[data-side="blue"] h2').textContent().then((s) => s === 'Galatasaray'), 'club synchronized');
  await b.locator('[data-side="red"] .club-edit').click();
  await b.locator('#clubSearch').fill('Galatasaray');
  assert.equal(await b.locator('#clubConfirmBtn').isDisabled(), true);
  assert.equal(await b.locator('#clubSelectionStatus').textContent(), 'RAKİP TARAFINDAN SEÇİLDİ');
  await b.locator('#clubSearch').fill('Tottenham');
  await b.locator('#clubConfirmBtn').click();
  await b.locator('#clubDialog').waitFor({ state: 'hidden' });
  await a.locator('[data-side="blue"] .club-edit').click();
  await a.locator('#clubKitTabs [data-kit="away"]').click();
  assert.equal(await a.locator('#clubConfirmBtn').isDisabled(), true, 'white kit clashes with opponent');
  assert.ok((await a.locator('#clubSelectionStatus').textContent()).includes('çok benzer'));
  await a.locator('#clubKitTabs [data-kit="third"]').click();
  await a.screenshot({ path: path.join(output, 'club-selector.png') });
  await a.locator('#clubConfirmBtn').click();
  await a.locator('#clubDialog').waitFor({ state: 'hidden' });
  await until(() => b.locator('[data-side="blue"] .club-kit-label').textContent().then((s) => s === 'Alternatif'), 'kit synchronized');
  await a.setViewportSize({ width: 390, height: 844 });
  assert.equal(await a.locator('#lobbyOverlay').evaluate((el) => el.scrollHeight <= el.clientHeight), true, 'mobile lobby never scrolls vertically');
  assert.equal(await a.locator('#profileBtn').isVisible(), true);
  await a.locator('#profileBtn').click();
  await a.screenshot({ path: path.join(output, 'profile-mobile.png') });
  await a.locator('#profileCancelBtn').click();
  await a.screenshot({ path: path.join(output, 'clubs-mobile.png') });
  await a.setViewportSize({ width: 1280, height: 900 });
  await a.screenshot({ path: path.join(output, 'lobby-extension.png') });
  await b.screenshot({ path: path.join(output, 'lobby-invite.png') });
  await a.locator('#readyBtn').click();
  await until(() => b.locator('#readyRoster [data-status="ready"]').count().then((n) => n === 1), 'ready badge synchronized');
  assert.equal(await b.locator('#readyRoster [data-status="not-ready"]').count(), 1);
  await a.screenshot({ path: path.join(output, 'lobby-ready-states.png') });
  await b.locator('#readyBtn').click();
  await until(() => ma.some((m) => m.type === 'countdownStart') && mb.some((m) => m.type === 'countdownStart'), 'shared countdown');
  assert.deepEqual(ma.find((m) => m.type === 'countdownStart'), mb.find((m) => m.type === 'countdownStart'));
  await a.locator('#profileBtn').click();
  await a.locator('#profileDialog').waitFor({ state: 'visible' });
  await a.locator('#hud').waitFor({ state: 'visible' });
  assert.equal(await a.locator('#profileDialog').isVisible(), false, 'match transition closes the profile dialog');
  await b.locator('#hud').waitFor({ state: 'visible' });
  await until(() => ma.some((m) => m.type === 'state') && mb.some((m) => m.type === 'state'), 'match snapshots');
  assert.deepEqual(ma.find((m) => m.type === 'matchStart'), mb.find((m) => m.type === 'matchStart'));
  assert.equal(ma.find((m) => m.type === 'matchStart').teams.blue.clubId, 'galatasaray');
  assert.equal(await a.locator('#scoreNameBlue').textContent(), 'GS');
  assert.equal(await b.locator('#scoreNameRed').textContent(), 'TOT');
  assert.equal(await a.locator('[data-side="blue"] .club-edit').isDisabled(), true);
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
  await until(() => a.locator('#matchClock').textContent().then((t) => /^04:[0-5]\d$/.test(t)), 'server-driven countdown clock');
  await a.screenshot({ path: path.join(output, 'match-extension.png') });
  await b.screenshot({ path: path.join(output, 'match-invite.png') });
  assert.equal(await a.locator('#scoreBlue').textContent(), await b.locator('#scoreBlue').textContent());
  assert.equal(await a.locator('#scoreRed').textContent(), await b.locator('#scoreRed').textContent());
  const snapshotsB = new Set(mb.filter((m) => m.type === 'state').map((m) => JSON.stringify(m)));
  assert.ok(ma.some((m) => m.type === 'state' && snapshotsB.has(JSON.stringify(m))), 'same authoritative ball/player/score snapshot reaches both clients');

  async function scoreGoal(team) {
    for (const player of serverState.clients.values()) { player.pos = { x: 12, z: 0 }; player.input = { x: 0, z: 0, sprint: false }; }
    serverState.ballOwnerId = null;
    serverState.ballBody.position.set(0, BALL_R, team === 'blue' ? -HALF_L - .5 : HALF_L + .5);
    serverState.ballBody.velocity.set(0, 0, 0);
  }
  // An actual server-side shot records the scorer before the fixture moves the
  // loose ball across the goal line to make the browser test deterministic.
  const attacker = serverState.clients.get(id);
  serverState.ballBody.position.set(attacker.pos.x, BALL_R, attacker.pos.z);
  serverState.ballBody.velocity.set(0, 0, 0);
  serverState.ballOwnerId = id; attacker.cooldowns.S = 0;
  await a.keyboard.press('s');
  await until(() => ma.some((m) => m.type === 'actionResult' && m.action === 'shot'), 'authoritative shot');
  await scoreGoal('blue');
  await a.locator('#goalPresentation').waitFor({ state: 'visible' });
  await b.locator('#goalPresentation').waitFor({ state: 'visible' });
  assert.deepEqual(ma.find((m) => m.type === 'goal'), mb.find((m) => m.type === 'goal'));
  assert.equal(await a.locator('.goal-scorer').textContent(), 'Ersoy Odabaş');
  assert.equal(await a.locator('.goal-team').textContent(), 'Galatasaray');
  assert.equal(await a.locator('.goal-initials').textContent(), 'GS');
  assert.equal(await a.locator('.goal-home').textContent(), '1');
  await until(() => a.locator('.goal-title').evaluate((el) => Number(getComputedStyle(el).opacity) === 1), 'goal entrance');
  await a.screenshot({ path: path.join(output, 'goal-extension.png') });
  await b.screenshot({ path: path.join(output, 'goal-invite.png') });
  await until(() => ma.some((m) => m.type === 'kickoffReset'), 'authoritative kickoff');
  assert.equal(await a.locator('#goalPresentation').isHidden(), true);
  await until(() => serverState.phase === 'playing', 'resumed match');
  serverState.lastTouches = { blue: null, red: null };
  await scoreGoal('red');
  await until(() => ma.filter((m) => m.type === 'goal').length === 2, 'second goal');
  await a.setViewportSize({ width: 390, height: 844 });
  await until(() => a.locator('.goal-title').evaluate((el) => Number(getComputedStyle(el).opacity) === 1), 'second entrance');
  assert.equal(await a.locator('.goal-scorer').isHidden(), true, 'unknown scorer is omitted');
  assert.equal(await a.locator('#goalPresentation').count(), 1);
  await a.screenshot({ path: path.join(output, 'goal-mobile.png') });
  await until(() => serverState.phase === 'playing', 'second kickoff complete');
  await a.setViewportSize({ width: 1280, height: 900 });

  // Exercise missing image, null scorer and repeated reuse in the real DOM.
  const fallback = await a.evaluate(async () => {
    const { createGoalPresentation } = await import('./src/ui/goalPresentation.js');
    const parent = document.createElement('div'); document.body.append(parent);
    const presentation = createGoalPresentation({ parent });
    const goal = { teamId: 'blue', teamName: 'Fallback FC', teamLogo: null, scorerName: null,
      score: { blue: 2, red: 1 }, startedAt: 1000, endsAt: 5000 };
    const initialCount = parent.querySelectorAll('*').length;
    for (let i = 0; i < 20; i++) { presentation.show(goal, 2000); presentation.hide(); }
    presentation.show({ ...goal, teamLogo: 'teams/team-blue.svg' }, 2000);
    const img = parent.querySelector('img');
    await new Promise((resolve) => { img.addEventListener('error', resolve, { once: true }); img.src = 'data:image/png;base64,AAAA'; });
    const result = { stable: initialCount === parent.querySelectorAll('*').length,
      fallback: parent.querySelector('.goal-initials').textContent, imageHidden: img.hidden,
      scorerHidden: parent.querySelector('.goal-scorer').hidden };
    presentation.dispose(); parent.remove(); return result;
  });
  assert.deepEqual(fallback, { stable: true, fallback: 'MFC', imageHidden: true, scorerHidden: true });
  const kitChecks = await a.evaluate(async () => {
    const { createPlayerFactory } = await import('./src/gameplay/player.js');
    const { getKit, getClub } = await import('./shared/clubs.js');
    const { createClubBadge } = await import('./src/ui/clubBadge.js');
    const factory = createPlayerFactory({ scene: new THREE.Scene() });
    const first = factory.createFootballer('blue', 10, 'ERSOY', false);
    const other = factory.createFootballer('red', 7, 'AHMED', false);
    first.applyKit(getKit('galatasaray', 'third')); other.applyKit(getKit('tottenham', 'home'));
    const materials = new Set(); first.root.traverse((node) => {
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) if (material) materials.add(material);
    });
    const colors = [...materials].filter((m) => m.color).map((m) => '#' + m.color.getHexString());
    const otherMaterials = new Set(); other.root.traverse((node) => { if (node.material && !Array.isArray(node.material)) otherMaterials.add(node.material); });
    const otherColors = [...otherMaterials].map((m) => '#' + m.color.getHexString());
    const maps = [...materials].map((m) => m.map).filter(Boolean);
    for (let i = 0; i < 20; i++) first.applyKit(getKit('galatasaray', i % 2 ? 'third' : 'home'));
    const stableTextures = maps.every((map) => [...materials].some((m) => m.map === map));
    const holder = document.createElement('div'); document.body.append(holder);
    const setBadge = createClubBadge(holder); setBadge(getClub('galatasaray'));
    const img = holder.querySelector('img');
    await new Promise((resolve) => { img.addEventListener('error', resolve, { once: true }); img.src = 'data:image/png;base64,AAAA'; });
    const badgeFallback = img.hidden && holder.querySelector('span').textContent === 'GS'; holder.remove();
    // Dispose only isolated fixtures; production renderers and models are untouched.
    for (const f of [first, other]) f.root.traverse((node) => node.geometry?.dispose());
    for (const material of new Set([...materials, ...otherMaterials])) { material.map?.dispose(); material.dispose(); }
    return { colors, otherColors, stableTextures, badgeFallback };
  });
  assert.ok(kitChecks.colors.includes('#242d41'), 'selected shorts material reaches reusable model');
  assert.ok(kitChecks.colors.includes('#efb940'), 'selected socks/sleeves reach reusable model');
  assert.ok(kitChecks.otherColors.includes('#273752'), 'opponent material is independent');
  assert.equal(kitChecks.stableTextures, true);
  assert.equal(kitChecks.badgeFallback, true);

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
  assert.equal(await a.locator('#nameInput').inputValue(), 'Ersoy Odabaş');
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
