import { createGameState } from '../core/gameState.js';
import { HALF_L, BALL_R } from '../../shared/field.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createServer } from '../core/server.js';
import { CLIENT, SERVER } from '../../src/network/protocol.js';

test('two clients share selection, ready, cancellation, match and snapshots', { timeout: 20000 }, async (t) => {
  const state = createGameState();
  const server = createServer({ state });
  t.after(() => server.close());
  const { port } = await server.listen(0, '127.0.0.1');
  async function connect(name) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`), messages = [];
    socket.on('message', (raw) => messages.push(JSON.parse(raw)));
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const send = (m) => socket.send(JSON.stringify(m));
    async function wait(predicate, from = 0) {
      const end = Date.now() + 6000;
      while (Date.now() < end) {
        const result = messages.slice(from).find(predicate);
        if (result) return result;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`Message timeout: ${predicate}`);
    }
    send({ type: CLIENT.JOIN, name });
    const welcome = await wait((m) => m.type === SERVER.WELCOME);
    return { socket, messages, send, wait, id: welcome.id };
  }
  const a = await connect('A');
  a.send({ type: CLIENT.READY, ready: true });
  await a.wait((m) => m.type === SERVER.SLOT_ERROR);
  a.send({ type: CLIENT.SELECT_SLOT, team: 'blue', slot: 4 });
  a.send({ type: CLIENT.READY, ready: true });
  await a.wait((m) => m.type === SERVER.COUNTDOWN_START);
  const b = await connect('B');
  await a.wait((m) => m.type === SERVER.COUNTDOWN_CANCELLED);
  const reset = await a.wait((m) => m.type === SERVER.LOBBY && m.players.length === 2);
  assert.ok(reset.players.every((p) => !p.ready));
  b.send({ type: CLIENT.SELECT_SLOT, team: 'blue', slot: 4 });
  await b.wait((m) => m.type === SERVER.SLOT_ERROR);
  b.send({ type: CLIENT.SELECT_SLOT, team: 'red', slot: 3 });
  const selected = await b.wait((m) => m.type === SERVER.LOBBY && m.players.some((p) => p.id === b.id && p.slot === 3));
  assert.equal(selected.players.find((p) => p.id === b.id).position, 'SGK');
  a.send({ type: CLIENT.UPDATE_PROFILE, name: '  Ersoy  Odabaş  ', id: b.id, team: 'red', ready: true });
  const renamedA = await a.wait((m) => m.type === SERVER.LOBBY && m.players.some((p) => p.id === a.id && p.name === 'Ersoy Odabaş'));
  const renamedB = await b.wait((m) => m.type === SERVER.LOBBY && m.players.some((p) => p.id === a.id && p.name === 'Ersoy Odabaş'));
  assert.deepEqual(renamedA, renamedB);
  assert.equal(renamedA.players.find((p) => p.id === b.id).name, 'B');
  assert.equal(renamedA.players.find((p) => p.id === a.id).team, 'blue');
  a.send({ type: CLIENT.UPDATE_PROFILE, name: '<script>' });
  await a.wait((m) => m.type === SERVER.PROFILE_ERROR);
  // Both captains race for a previously unselected club. One wins; the other
  // receives an authoritative conflict, irrespective of client UI state.
  a.send({ type: CLIENT.SELECT_CLUB_KIT, clubId: 'tottenham', kitId: 'home' });
  b.send({ type: CLIENT.SELECT_CLUB_KIT, clubId: 'tottenham', kitId: 'home' });
  const raceA = await a.wait((m) => m.type === SERVER.LOBBY && Object.values(m.teams || {}).some((side) => side.clubId === 'tottenham'));
  const raceB = await b.wait((m) => m.type === SERVER.LOBBY && Object.values(m.teams || {}).some((side) => side.clubId === 'tottenham'));
  assert.deepEqual(raceA, raceB);
  assert.notEqual(raceA.teams.blue.clubId, raceA.teams.red.clubId);
  await (raceA.teams.blue.clubId === 'tottenham' ? b : a).wait((m) => m.type === SERVER.CLUB_ERROR);
  // Restore a known contrasting pair for the remaining gameplay checks.
  a.send({ type: CLIENT.SELECT_CLUB_KIT, clubId: 'arsenal', kitId: 'home' });
  b.send({ type: CLIENT.SELECT_CLUB_KIT, clubId: 'man-city', kitId: 'home' });
  await b.wait((m) => m.type === SERVER.LOBBY && m.teams?.blue.clubId === 'arsenal' && m.teams?.red.clubId === 'man-city', b.messages.length);
  a.send({ type: CLIENT.READY, ready: true });
  b.send({ type: CLIENT.READY, ready: true });
  const startA = await a.wait((m) => m.type === SERVER.MATCH_START);
  const startB = await b.wait((m) => m.type === SERVER.MATCH_START);
  assert.deepEqual(startA, startB);
  a.send({ type: CLIENT.SELECT_CLUB_KIT, clubId: 'galatasaray', kitId: 'home' });
  await a.wait((m) => m.type === SERVER.CLUB_ERROR);
  assert.equal(state.teams.blue.clubId, 'arsenal');
  const firstA = await a.wait((m) => m.type === SERVER.STATE);
  const firstB = await b.wait((m) => m.type === SERVER.STATE);
  assert.deepEqual(firstA, firstB);
  assert.equal(firstA.players.filter((p) => p.id === a.id || p.id === b.id).length, 2);
  a.send({ type: CLIENT.INPUT, x: 1, z: 0, sprint: true });
  const x = firstA.players.find((p) => p.id === a.id).x;
  const moved = await b.wait((m) => m.type === SERVER.STATE && m.players.find((p) => p.id === a.id)?.x > x + .4);
  assert.ok(moved.ball && moved.score);
  a.send({ type: CLIENT.ACTION, key: 'S' });
  const actionA = await a.wait((m) => m.type === SERVER.ACTION_RESULT);
  const actionB = await b.wait((m) => m.type === SERVER.ACTION_RESULT);
  assert.deepEqual(actionA, actionB);
  // Place a real authoritative ball into the goal; no client scoring shortcut.
  for (const player of state.clients.values()) { player.pos = { x: 12, z: 0 }; player.input = { x: 0, z: 0, sprint: false }; }
  state.ballOwnerId = null;
  state.ballBody.position.set(0, BALL_R, -HALF_L - .5);
  state.ballBody.velocity.set(0, 0, 0);
  const goalA = await a.wait((m) => m.type === SERVER.GOAL);
  const goalB = await b.wait((m) => m.type === SERVER.GOAL);
  assert.deepEqual(goalA, goalB);
  assert.deepEqual(goalA.score, { blue: 1, red: 0 });
  const late = await connect('Late arrival');
  const recovery = await late.wait((m) => m.type === SERVER.STATE);
  assert.equal(recovery.phase, 'goalCelebration');
  assert.deepEqual(recovery.goalEvent, goalA.goalEvent);
  const actionCount = a.messages.filter((m) => m.type === SERVER.ACTION_RESULT).length;
  a.send({ type: CLIENT.INPUT, x: 1, z: 1, sprint: true });
  for (const key of ['A', 'S', 'D']) a.send({ type: CLIENT.ACTION, key });
  const frozen = await a.wait((m) => m.type === SERVER.STATE && m.phase === 'goalCelebration', a.messages.length);
  assert.ok(frozen.players.every((p) => p.vx === 0 && p.vz === 0));
  assert.equal(a.messages.filter((m) => m.type === SERVER.ACTION_RESULT).length, actionCount);
  const kickoffA = await a.wait((m) => m.type === SERVER.KICKOFF_RESET);
  const kickoffB = await b.wait((m) => m.type === SERVER.KICKOFF_RESET);
  assert.deepEqual(kickoffA, kickoffB);
  assert.equal(kickoffA.kickoffTeam, 'red');
  assert.equal(kickoffA.players.find((p) => p.hasBall).id, b.id);
  assert.ok(kickoffA.serverTime >= goalA.goalEvent.endsAt);
  assert.deepEqual(kickoffA.ball, { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 });
  await a.wait((m) => m.type === SERVER.STATE && m.phase === 'playing', a.messages.length);
  assert.equal(a.messages.filter((m) => m.type === SERVER.GOAL).length, 1);

});

test('HTTP invitation serves every native module and asset without exposing server files', async (t) => {
  const server = createServer();
  t.after(() => server.close());
  const { port } = await server.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const html = await (await fetch(`${base}/join?from=%3Cscript%3E`)).text();
  assert.ok(html.includes('&lt;script&gt;'));
  assert.match(html, /action="\/game.html"/);
  const rootPage = await fetch(`${base}/`);
  assert.match(rootPage.headers.get('content-type'), /text\/html/);
  assert.equal(await rootPage.text(), await (await fetch(`${base}/game.html`)).text());
  const files = ['game.html', 'lib/three.min.js', 'assets/textures/pitch/grass_diffuse.png', 'assets/textures/pitch/grass_normal.png', 'assets/textures/pitch/grass.jpg'];
  for (const dir of ['src', 'shared']) {
    for (const file of await fs.readdir(new URL(`../../${dir}/`, import.meta.url), { recursive: true })) {
      if (/\.(js|css)$/.test(file)) files.push(`${dir}/${file.replaceAll('\\', '/')}`);
    }
  }
  for (const file of files) {
    const response = await fetch(`${base}/${file}`);
    assert.equal(response.status, 200, file);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 0, file);
    if (file.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
  }
  assert.equal((await fetch(`${base}/src/missing.js`)).status, 404);
  for (const file of ['server/server.js', '.env', 'server/core/config.js']) {
    assert.equal(await (await fetch(`${base}/${file}`)).text(), 'Ofis Futbolu 3D sunucusu calisiyor.\n');
  }
});
