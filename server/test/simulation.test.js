import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../core/gameState.js';
import { createPlayerManager } from '../gameplay/playerManager.js';
import { createActions } from '../gameplay/actions.js';
import { buildWorld, createBallPhysics } from '../gameplay/ballPhysics.js';
import { createMatchManager } from '../gameplay/matchManager.js';
import { createSimulation } from '../gameplay/simulation.js';
import { BALL_R, HALF_W, HALF_L, GOAL_HALF_W } from '../../shared/field.js';
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

test('slide capture cannot push the ball through corner or end-line walls', (t) => {
  const { state, actions, advance } = fixture(t);
  const player = state.clients.get('blue');
  const maxX = HALF_W - BALL_R;
  const maxZ = HALF_L - BALL_R;

  player.pos = { x: HALF_W - .48, z: HALF_L - .48 };
  player.facing = { x: 0, z: 1 };
  player.input = { x: 0, z: 1, sprint: false };
  player.vel = { x: 0, z: 12.5 };
  state.ballBody.position.set(player.pos.x, BALL_R, player.pos.z + .7);
  state.ballBody.velocity.set(0, 0, 8);

  actions.performAction(player, 'D');
  assert.ok(state.ballBody.position.z > maxZ, 'slide reproduces the post-physics end-line teleport');
  advance();

  assert.ok(state.ballBody.position.x <= maxX);
  assert.ok(state.ballBody.position.z <= maxZ);
  assert.ok(state.ballBody.velocity.z <= 0, 'outward velocity is reflected back into play');
  assert.deepEqual(state.score, { blue: 0, red: 0 }, 'corner containment is not counted as a goal');

  state.ballOwnerId = null;
  player.slideRemaining = 0;
  player.recoveryRemaining = 0;
  player.cooldowns.D = 0;
  player.pos = { x: GOAL_HALF_W + .25, z: HALF_L - .48 };
  state.ballBody.position.set(player.pos.x, BALL_R, player.pos.z + .7);
  state.ballBody.velocity.set(0, 0, 8);

  actions.performAction(player, 'D');
  advance();

  assert.ok(state.ballBody.position.z <= maxZ, 'the wall beside the goal contains slide capture');
  assert.deepEqual(state.score, { blue: 0, red: 0 }, 'the outside of the goal post is not a goal');
});

test('AI keeper secures saves inward and distributes to a teammate', (t) => {
  const { state, actions, advance, messages } = fixture(t);
  const keeper = state.clients.get('ai_keeper_blue');
  const teammate = state.clients.get('blue');
  teammate.pos = { x: 6, z: 18 };
  keeper.pos = { x: 0, z: HALF_L - .3 };
  keeper.facing = { x: 0, z: 1 };
  keeper.vel = { x: 0, z: 6 };
  state.ballBody.position.set(0, BALL_R, keeper.pos.z + 1.05);
  state.ballBody.velocity.set(0, 0, 8);

  actions.performAction(keeper, 'D');

  assert.equal(state.ballOwnerId, keeper.id);
  assert.equal(keeper.slideRemaining, 0, 'keeper stops sliding after securing the ball');
  assert.ok(state.ballBody.position.z < keeper.pos.z, 'saved ball is placed on the pitch side of the keeper');
  assert.deepEqual(keeper.facing, { x: 0, z: -1 });

  advance(17);
  advance(520);

  assert.equal(state.ballOwnerId, null, 'keeper releases the ball after the hold delay');
  assert.ok(state.ballBody.velocity.z < 0, 'blue keeper sends the ball away from the blue goal');
  assert.ok(state.ballBody.velocity.x > 0, 'distribution is aimed toward the teammate');
  assert.ok(messages.some((message) => message.id === keeper.id && ['pass', 'cross'].includes(message.action) && message.success));
  assert.deepEqual(state.score, { blue: 0, red: 0 });
});

test('AI keeper catches shots and back-passes without sliding at the ball', (t) => {
  const { state, actions } = fixture(t);
  const keeper = state.clients.get('ai_keeper_blue');
  const opponent = state.clients.get('red');
  keeper.pos = { x: 0, z: HALF_L - .5 };
  keeper.vel = { x: 0, z: -4 };
  opponent.pos = { x: 0, z: HALF_L - 2 };
  state.ballBody.position.set(opponent.pos.x, BALL_R, opponent.pos.z);
  state.ballBody.velocity.set(0, 0, 0);
  state.ballOwnerId = opponent.id;

  actions.updateBallControl(.016);
  assert.equal(keeper.slideRemaining, 0, 'keeper holds position against a dribbler');

  state.ballOwnerId = null;
  state.looseBallUntil = Date.now() + 1000;
  state.ballBody.position.set(0, BALL_R, HALF_L - 1.6);
  state.ballBody.velocity.set(0, 0, 9);
  actions.updateBallControl(.016);

  assert.equal(state.ballOwnerId, keeper.id, 'keeper catches a shot travelling toward goal');
  assert.equal(keeper.slideRemaining, 0, 'shot save does not use a slide tackle');
  assert.equal(keeper.lastAction.type, 'save');

  state.ballOwnerId = null;
  state.looseBallUntil = 0;
  keeper.keeperPossessionStartedAt = 0;
  state.ballBody.position.set(keeper.pos.x, BALL_R, keeper.pos.z - .7);
  state.ballBody.velocity.set(0, 0, 2);
  actions.updateBallControl(.016);

  assert.equal(state.ballOwnerId, keeper.id, 'keeper controls a nearby back-pass');
  assert.equal(keeper.slideRemaining, 0, 'back-pass control does not use a slide tackle');
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
  assert.deepEqual(
    [state.ballBody.position.x, state.ballBody.position.y, state.ballBody.position.z],
    [0, BALL_R, 0],
    'ball restarts exactly on the centre spot after a goal',
  );
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
