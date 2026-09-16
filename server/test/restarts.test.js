import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameState } from '../core/gameState.js';
import { createPlayerManager } from '../gameplay/playerManager.js';
import { createActions } from '../gameplay/actions.js';
import { buildWorld, createBallPhysics } from '../gameplay/ballPhysics.js';
import { createMatchManager } from '../gameplay/matchManager.js';
import { createSimulation } from '../gameplay/simulation.js';
import { createServer } from '../core/server.js';
import { BALL_R, HALF_W, HALF_L } from '../../shared/field.js';
import { CLIENT, SERVER } from '../../src/network/protocol.js';
import { OUT_OF_PLAY_SECONDS, GOAL_KICK_DISTANCE, RESTART_OPPONENT_DISTANCE, PITCH_MAX_X, PITCH_MAX_Z } from '../core/config.js';

// Blue defends +Z, red defends -Z. extraRed adds a second red outfield player.
function fixture(t, { extraRed = false } = {}) {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(Math, 'random', () => .5);
  const state = createGameState(), messages = [];
  const broadcast = (message) => messages.push(structuredClone(message));
  const broadcastLobby = () => broadcast({ type: 'lobby', phase: state.phase, score: state.score });
  const players = createPlayerManager({ state });
  const actions = createActions({ state, broadcast });
  const physics = createBallPhysics({ state });
  const match = createMatchManager({ state, broadcast, broadcastLobby, buildWorld, ...players });
  const simulation = createSimulation({ state, broadcast, broadcastLobby, players, physics, actions, match });
  for (const team of ['blue', 'red']) state.clients.set(team, { id: team, team, name: team, slot: 4, position: 'FRV', ready: true });
  if (extraRed) state.clients.set('red2', { id: 'red2', team: 'red', name: 'red2', slot: 3, position: 'SGK', ready: true });
  match.startMatch();
  const advance = (ms = 17) => { now += ms; simulation.tick(); };
  const playOut = (maxTicks = 120) => { for (let i = 0; i < maxTicks && state.phase === 'playing'; i++) advance(); };
  // A real pass from `player` at `pos` in `facing`, so the server records the touch.
  function passFrom(player, pos, facing) {
    player.pos = { ...pos };
    player.facing = facing;
    player.vel = { x: 0, z: 0 };
    player.cooldowns.A = 0;
    state.ballOwnerId = player.id;
    state.ballBody.position.set(pos.x + facing.x * .86, BALL_R, pos.z + facing.z * .86);
    state.ballBody.velocity.set(0, 0, 0);
    state.ballPrevPosition = null;
    actions.performAction(player, 'A');
    assert.equal(messages.at(-1).action, 'pass');
  }
  return { state, messages, advance, playOut, passFrom };
}

test('TAÇ: the ball over a touchline goes to the nearest opposing outfield player for a throw-in', (t) => {
  const { state, messages, advance, playOut, passFrom } = fixture(t, { extraRed: true });
  const blue = state.clients.get('blue'), red = state.clients.get('red'), red2 = state.clients.get('red2');
  red.pos = { x: 15, z: 6 };
  red2.pos = { x: -12, z: -3 };
  passFrom(blue, { x: HALF_W - 3, z: 2 }, { x: 1, z: 0 });
  playOut();

  assert.equal(state.phase, 'outOfPlay');
  const out = messages.findLast((m) => m.type === SERVER.OUT_OF_PLAY);
  assert.equal(out.outEvent.boundary, 'touchline');
  assert.equal(out.outEvent.notice, 'TAÇ');
  assert.equal(out.outEvent.restart, 'throwIn');
  assert.equal(out.outEvent.lastTouchTeam, 'blue', 'the last touch is the passer');
  assert.equal(out.outEvent.receivingTeam, 'red', 'the other team gets the ball');
  assert.equal(out.outEvent.restartPlayerId, 'red', 'the nearest red outfield player takes it');
  assert.equal(out.outEvent.endsAt - out.outEvent.startedAt, OUT_OF_PLAY_SECONDS * 1000, 'same ~2 s notice as AUT');
  assert.ok(Math.abs(out.outEvent.position.x - HALF_W) < 1e-9);
  assert.deepEqual([out.ball.vx, out.ball.vy, out.ball.vz], [0, 0, 0], 'play is stopped');
  assert.equal(state.ballOwnerId, null);

  // No second exit while the restart is pending, however the ball is moved.
  const outsBefore = messages.filter((m) => m.type === SERVER.OUT_OF_PLAY).length;
  state.ballBody.position.set(HALF_W + 6, BALL_R, 10);
  for (let i = 0; i < 20; i++) advance();
  assert.equal(messages.filter((m) => m.type === SERVER.OUT_OF_PLAY).length, outsBefore);
  assert.equal(state.outSequence, 1);

  blue.pos = { x: HALF_W - 1, z: out.outEvent.position.z }; // standing on the throw-in spot
  advance(OUT_OF_PLAY_SECONDS * 1000);
  assert.equal(state.phase, 'playing');
  const restart = messages.findLast((m) => m.type === SERVER.RESTART);
  assert.ok(restart, 'every client gets the authoritative restart');
  assert.equal(state.ballOwnerId, 'red');
  assert.equal(red.pos.x, PITCH_MAX_X, 'thrower placed on the touchline');
  assert.ok(Math.abs(red.pos.z - out.outEvent.position.z) < 1e-9, 'where the ball went out');
  assert.deepEqual(red.facing, { x: -1, z: 0 }, 'facing into the pitch');
  assert.ok(state.ballBody.position.x < HALF_W, 'ball is back inside the pitch');
  const ballToBlue = Math.hypot(blue.pos.x - state.ballBody.position.x, blue.pos.z - state.ballBody.position.z);
  assert.ok(ballToBlue >= RESTART_OPPONENT_DISTANCE - 1e-6, 'opponents are moved away from the restart');
  assert.deepEqual(restart.players.find((p) => p.id === 'red').hasBall, true);
});

test('TAÇ with no opposing outfield player: the goalkeeper restarts instead', (t) => {
  const { state, messages, advance, playOut, passFrom } = fixture(t);
  state.clients.delete('red'); // red has only its AI keeper left
  const blue = state.clients.get('blue');
  passFrom(blue, { x: -(HALF_W - 3), z: -5 }, { x: -1, z: 0 });
  playOut();
  assert.equal(state.phase, 'outOfPlay');
  assert.equal(state.outEvent.notice, 'TAÇ');
  assert.equal(state.outEvent.receivingTeam, 'red');
  assert.equal(state.outEvent.restart, 'keeperRestart');
  assert.equal(state.outEvent.restartPlayerId, 'ai_keeper_red');
  advance(OUT_OF_PLAY_SECONDS * 1000);
  assert.equal(state.phase, 'playing');
  assert.equal(state.ballOwnerId, 'ai_keeper_red');
  assert.ok(Math.abs(state.ballBody.position.z - (-(HALF_L - GOAL_KICK_DISTANCE))) < .01, 'restart from the keeper in the red penalty area');
  assert.ok(messages.some((m) => m.type === SERVER.RESTART));
});

test('goal line: attackers last → AUT goal kick; defenders last → KORNER for the attackers', (t) => {
  const { state, advance, playOut, passFrom } = fixture(t);
  const blue = state.clients.get('blue'), red = state.clients.get('red');
  // Red defends -Z and plays it back over its own goal line, wide of the goal.
  blue.pos = { x: 10, z: -HALF_L + 12 };
  passFrom(red, { x: 6, z: -HALF_L + 3 }, { x: 0, z: -1 });
  playOut();
  assert.equal(state.phase, 'outOfPlay');
  assert.equal(state.outEvent.boundary, 'goalLine');
  assert.equal(state.outEvent.lastTouchTeam, 'red');
  assert.equal(state.outEvent.notice, 'KORNER');
  assert.equal(state.outEvent.restart, 'corner');
  assert.equal(state.outEvent.receivingTeam, 'blue');
  assert.equal(state.outEvent.restartPlayerId, 'blue');
  advance(OUT_OF_PLAY_SECONDS * 1000);
  assert.equal(state.ballOwnerId, 'blue');
  assert.deepEqual(blue.pos, { x: PITCH_MAX_X, z: -PITCH_MAX_Z }, 'corner taken from the corner on that side');
  assert.ok(blue.facing.x < 0 && blue.facing.z > 0, 'facing into the penalty area');
});

test('goal line: an attacker over the opponent goal line is AUT with a goal kick for the defending keeper', (t) => {
  const { state, advance, playOut, passFrom } = fixture(t);
  const blue = state.clients.get('blue');
  passFrom(blue, { x: 7, z: -HALF_L + 4 }, { x: 0, z: -1 });
  playOut();
  assert.equal(state.outEvent.notice, 'AUT');
  assert.equal(state.outEvent.lastTouchTeam, 'blue');
  assert.equal(state.outEvent.restart, 'goalKick');
  assert.equal(state.outEvent.restartPlayerId, 'ai_keeper_red');
  advance(OUT_OF_PLAY_SECONDS * 1000);
  assert.equal(state.ballOwnerId, 'ai_keeper_red');
});

test('TAÇ and its throw-in reach every client identically', { timeout: 20000 }, async (t) => {
  const state = createGameState();
  const server = createServer({ state });
  t.after(() => server.close());
  const { port } = await server.listen(0, '127.0.0.1');
  async function connect(name, team) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`), messages = [];
    socket.on('message', (raw) => messages.push(JSON.parse(raw)));
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const send = (m) => socket.send(JSON.stringify(m));
    async function wait(predicate, from = 0) {
      const end = Date.now() + 8000;
      while (Date.now() < end) {
        const found = messages.slice(from).find(predicate);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`Message timeout: ${predicate}`);
    }
    send({ type: CLIENT.JOIN, name });
    const welcome = await wait((m) => m.type === SERVER.WELCOME);
    send({ type: CLIENT.SELECT_SLOT, team, slot: 4 });
    return { socket, messages, send, wait, id: welcome.id };
  }
  const a = await connect('A', 'blue');
  const b = await connect('B', 'red');
  await b.wait((m) => m.type === SERVER.LOBBY && m.players.filter((p) => Number.isInteger(p.slot)).length === 2);
  a.send({ type: CLIENT.READY, ready: true });
  b.send({ type: CLIENT.READY, ready: true });
  await a.wait((m) => m.type === SERVER.MATCH_START);
  await b.wait((m) => m.type === SERVER.MATCH_START);

  // Blue touched it last; it is now past the +X touchline.
  state.ballOwnerId = null;
  state.looseBallUntil = 0;
  state.lastTouches = { blue: { id: a.id, name: 'A', at: Date.now() }, red: null };
  state.ballBody.position.set(HALF_W + 1, BALL_R, 4);
  state.ballBody.velocity.set(0, 0, 0);
  const outA = await a.wait((m) => m.type === SERVER.OUT_OF_PLAY);
  const outB = await b.wait((m) => m.type === SERVER.OUT_OF_PLAY);
  assert.deepEqual(outA, outB);
  assert.equal(outA.outEvent.notice, 'TAÇ');
  assert.equal(outA.outEvent.restartPlayerId, b.id);
  const restartA = await a.wait((m) => m.type === SERVER.RESTART);
  const restartB = await b.wait((m) => m.type === SERVER.RESTART);
  assert.deepEqual(restartA, restartB);
  assert.ok(restartA.players.find((p) => p.id === b.id).hasBall);
  for (const client of [a, b]) client.socket.close();
});
