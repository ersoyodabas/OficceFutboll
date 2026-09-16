import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const WebSocket = require('ws');

test('leaving a match preserves the lobby connection and remaining players', { timeout: 30000 }, async (t) => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: '0' }, windowsHide: true,
  });
  t.after(() => server.kill());
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
    server.on('error', reject);
    server.on('exit', (code) => reject(new Error(`Server exited: ${code}`)));
    server.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/ws:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });

  async function connect(name, team) {
    const socket = new WebSocket(`ws://localhost:${port}`);
    const messages = [];
    socket.on('message', (raw) => messages.push(JSON.parse(raw)));
    t.after(() => socket.terminate());
    const wait = async (predicate, from = 0) => {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const message = messages.slice(from).find(predicate);
        if (message) return message;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`Timed out waiting for ${predicate}`);
    };
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const send = (message) => socket.send(JSON.stringify(message));
    send({ type: 'join', name, team, position: 'OOS' });
    const welcome = await wait((m) => m.type === 'welcome');
    send({ type: 'select_slot', team, slot: 1 });
    await wait((m) => m.type === 'lobby' && m.players.some((p) => p.id === welcome.id && p.team === team && p.slot === 1));
    return { socket, messages, wait, send, id: welcome.id };
  }

  const first = await connect('Birinci', 'blue');
  const second = await connect('İkinci', 'red');
  first.send({ type: 'ready', ready: true });
  second.send({ type: 'ready', ready: true });
  await first.wait((m) => m.type === 'matchStart');
  const initial = await second.wait((m) => m.type === 'state');
  assert.ok(initial.players.some((p) => p.id === first.id));
  assert.ok(initial.players.some((p) => p.id === second.id));

  first.send({ type: 'input', x: 1, z: 0, sprint: true });
  const afterLeave = first.messages.length;
  first.send({ type: 'leave_match' });
  await first.wait((m) => m.type === 'lobby_returned', afterLeave);
  const lobby = await first.wait((m) => m.type === 'lobby', afterLeave);
  assert.equal(lobby.phase, 'playing');
  const returned = lobby.players.find((p) => p.id === first.id);
  assert.equal(returned.inMatch, false);
  assert.equal(returned.ready, false);
  assert.equal(returned.name, 'Birinci');
  assert.equal(returned.isHost, true);
  assert.equal(first.socket.readyState, WebSocket.OPEN);

  const nextState = await second.wait((m) => m.type === 'state', second.messages.length);
  assert.ok(!nextState.players.some((p) => p.id === first.id));
  assert.ok(nextState.players.some((p) => p.id === second.id));
  first.send({ type: 'input', x: 1, z: 1, sprint: true });
  first.send({ type: 'action', key: 'S' });
  first.send({ type: 'ready', ready: true });
  first.send({ type: 'select_slot', team: 'red', slot: 2 });
  const updated = await first.wait((m) => m.type === 'lobby' && m.players.some((p) => p.id === first.id && p.team === 'red'), first.messages.length);
  assert.equal(updated.players.find((p) => p.id === first.id).ready, false);

  const resetFrom = first.messages.length;
  second.send({ type: 'leave_match' });
  const reset = await first.wait((m) => m.type === 'lobby' && m.phase === 'lobby', resetFrom);
  assert.equal(reset.players.length, 2);
  assert.ok(reset.players.every((p) => !p.isAI && !p.inMatch && !p.ready));
  assert.deepEqual(reset.score, { blue: 0, red: 0 });

  // A new match must start normally after everyone returned, including solo play.
  const soloFrom = first.messages.length;
  second.socket.close();
  await first.wait((m) => m.type === 'lobby' && m.players.length === 1, soloFrom);
  first.send({ type: 'ready', ready: true });
  await first.wait((m) => m.type === 'matchStart', soloFrom);
  const soloLeaveFrom = first.messages.length;
  first.send({ type: 'leave_match' });
  const soloLobby = await first.wait((m) => m.type === 'lobby' && m.phase === 'lobby', soloLeaveFrom);
  assert.equal(soloLobby.players.length, 1);
  assert.equal(soloLobby.players[0].ready, false);

  // Closing the last human connection must not leave AI keepers or an AI host.
  const disconnectFrom = first.messages.length;
  first.send({ type: 'ready', ready: true });
  await first.wait((m) => m.type === 'matchStart', disconnectFrom);
  first.socket.close();
  await new Promise((resolve) => first.socket.once('close', resolve));
  const replacement = await connect('Yeni yönetici', 'blue');
  const newLobby = await replacement.wait((m) => m.type === 'lobby' && m.players.some((p) => p.id === replacement.id));
  assert.equal(newLobby.phase, 'lobby');
  assert.equal(newLobby.players.length, 1);
  assert.equal(newLobby.hostId, replacement.id);
});
