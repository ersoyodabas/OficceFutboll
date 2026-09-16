import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../core/gameState.js';
import { createPlayerManager } from '../gameplay/playerManager.js';
import { createActions } from '../gameplay/actions.js';
import { buildWorld, createBallPhysics } from '../gameplay/ballPhysics.js';
import { createMatchManager } from '../gameplay/matchManager.js';
import { createSimulation } from '../gameplay/simulation.js';
import { BALL_R, HALF_L } from '../../shared/field.js';
import { PLAYER_SPEED, MATCH_DURATION_SECONDS, MATCH_END_PAUSE_SECONDS } from '../core/config.js';

function fixture(t) {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const state = createGameState(), messages = [];
  const broadcast = (message) => messages.push(structuredClone(message));
  const broadcastLobby = () => broadcast({ type: 'lobby', phase: state.phase, score: state.score });
  const players = createPlayerManager({ state });
  const actions = createActions({ state, broadcast });
  const physics = createBallPhysics({ state });
  const match = createMatchManager({ state, broadcast, broadcastLobby, buildWorld, ...players });
  const simulation = createSimulation({ state, broadcast, broadcastLobby, players, physics, actions, match });
  for (const team of ['blue', 'red']) state.clients.set(team, { id: team, team, name: team, slot: 4, position: 'FRV', ready: true });
  match.startMatch();
  function advance(ms = 17) { now += ms; simulation.tick(); }
  return { state, messages, players, actions, match, advance };
}

test('movement remains normalized and action power/cooldowns are server-owned', (t) => {
  const { state, players, actions, messages } = fixture(t);
  const player = state.clients.get('blue');
  const initial = { ...player.pos };
  player.input = { x: 1, z: 1, sprint: false };
  players.applyPlayerControl(player, .1);
  assert.ok(Math.abs(Math.hypot(player.pos.x - initial.x, player.pos.z - initial.z) - PLAYER_SPEED * .1) < 1e-8);
  for (const [key, action, horizontal, vertical] of [['A', 'pass', 16, .35], ['S', 'shot', 22, 2.8], ['D', 'cross', 16, 7.2]]) {
    state.ballBody.position.set(player.pos.x, BALL_R, player.pos.z);
    state.ballBody.velocity.set(0, 0, 0);
    state.ballOwnerId = player.id;
    actions.performAction(player, key);
    assert.equal(messages.at(-1).action, action);
    assert.equal(messages.at(-1).success, true);
    assert.ok(Math.abs(Math.hypot(state.ballBody.velocity.x, state.ballBody.velocity.z) - horizontal) < 1e-8);
    assert.ok(Math.abs(state.ballBody.velocity.y - vertical) < 1e-8);
    assert.equal(state.ballOwnerId, null);
    const count = messages.length;
    actions.performAction(player, key);
    assert.equal(messages.length, count, 'server rejects repeat during cooldown');
  }
});

test('slide direction and ball capture survive module boundaries', (t) => {
  const { state, players, actions, advance, messages } = fixture(t);
  const player = state.clients.get('blue');
  player.input = { x: 1, z: 0, sprint: false };
  players.applyPlayerControl(player, .1);
  actions.performAction(player, 'D');
  assert.equal(messages.at(-1).action, 'slide_tackle');
  assert.deepEqual(player.slideDirection, { x: 1, z: 0 });
  player.input = { x: -1, z: 0, sprint: false };
  state.ballBody.position.set(player.pos.x + 1.05, BALL_R, player.pos.z);
  state.ballBody.velocity.set(0, 0, 0);
  advance();
  assert.ok(player.vel.x > 0, 'changing input does not bend an active slide');
  assert.equal(state.ballOwnerId, player.id);
  assert.ok(messages.some((m) => m.action === 'slide_tackle' && m.success));
});

test('physics, crossbar filtering, goals, winning score and lobby reset remain authoritative', (t) => {
  const { state, advance, messages } = fixture(t);
  state.ballBody.position.set(0, 4, 0);
  for (let i = 0; i < 10; i++) advance();
  assert.ok(state.ballBody.position.y < 4, 'cannon gravity advances');
  const moveKeepersAway = () => {
    for (const c of state.clients.values()) if (c.isAI) c.pos = { x: 10, z: 0 };
  };
  moveKeepersAway();
  state.ballBody.position.set(0, 4, -HALF_L - .5);
  state.ballBody.velocity.set(0, 0, 0);
  advance();
  assert.deepEqual(state.score, { blue: 0, red: 0 }, 'above-crossbar ball is not a goal');
  state.ballBody.position.set(0, BALL_R, -HALF_L - .5);
  state.ballBody.velocity.set(0, 0, 0);
  advance();
  assert.deepEqual(state.score, { blue: 1, red: 0 });
  assert.ok(state.goalPauseRemaining > 0);
  assert.equal(state.ballOwnerId, null);
  state.goalPauseRemaining = 0;
  state.score.blue = 4;
  moveKeepersAway();
  state.ballBody.position.set(0, BALL_R, -HALF_L - .5);
  advance();
  assert.equal(state.phase, 'ended');
  assert.deepEqual(messages.findLast((m) => m.type === 'match_end'), { type: 'match_end', score: { blue: 5, red: 0 }, winner: 'blue' });
  assert.equal(state.ballBody, null);
  for (let i = 0; i <= MATCH_END_PAUSE_SECONDS * 20; i++) advance(50);
  assert.equal(state.phase, 'lobby');
  assert.ok([...state.clients.values()].every((c) => !c.ready && !c.isAI));
  assert.deepEqual(state.score, { blue: 0, red: 0 });
});

test('match timestamps and timed end use server wall clock', (t) => {
  const { state, advance, messages } = fixture(t);
  const start = messages.find((m) => m.type === 'matchStart');
  assert.equal(start.endsAt - start.startedAt, MATCH_DURATION_SECONDS * 1000);
  advance(60);
  const snapshot = messages.find((m) => m.type === 'state');
  assert.equal(snapshot.startedAt, start.startedAt);
  assert.equal(snapshot.endsAt, start.endsAt);
  advance(MATCH_DURATION_SECONDS * 1000);
  assert.equal(state.phase, 'ended');
  assert.ok(messages.some((m) => m.type === 'match_end'));
});
