import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createServer } from '../core/server.js';
import { CLIENT, SERVER } from '../../src/network/protocol.js';

test('two clients share selection, ready, cancellation, match and snapshots', { timeout: 20000 }, async (t) => {
  const server = createServer();
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
  a.send({ type: CLIENT.READY, ready: true });
  b.send({ type: CLIENT.READY, ready: true });
  const startA = await a.wait((m) => m.type === SERVER.MATCH_START);
  const startB = await b.wait((m) => m.type === SERVER.MATCH_START);
  assert.deepEqual(startA, startB);
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
});

test('HTTP invitation serves every native module and asset without exposing server files', async (t) => {
  const server = createServer();
  t.after(() => server.close());
  const { port } = await server.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const html = await (await fetch(`${base}/join?from=%3Cscript%3E`)).text();
  assert.ok(html.includes('&lt;script&gt;'));
  assert.match(html, /action="\/game.html"/);
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
