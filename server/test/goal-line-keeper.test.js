import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameState } from '../core/gameState.js';
import { createPlayerManager } from '../gameplay/playerManager.js';
import { createActions } from '../gameplay/actions.js';
import { buildWorld, createBallPhysics } from '../gameplay/ballPhysics.js';
import { createMatchManager } from '../gameplay/matchManager.js';
import { createSimulation } from '../gameplay/simulation.js';
import { classifyGoalLineCrossing, GOAL_LINE_CROSSING_Z } from '../gameplay/goalLine.js';
import { createServer } from '../core/server.js';
import { BALL_R, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, GOAL_POST_R, FIELD } from '../../shared/field.js';
import { CLIENT, SERVER } from '../../src/network/protocol.js';
import {
  OUT_OF_PLAY_SECONDS, GOAL_KICK_DISTANCE, GOAL_KICK_MAX_SIDE, SHOT_MIN_SPEED, SHOT_MAX_SPEED, SHOT_MIN_LIFT, SHOT_MAX_LIFT,
} from '../core/config.js';

// Blue attacks the red goal at -Z.
function fixture(t) {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(Math, 'random', () => .5); // no launch wobble: deterministic aim
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
  const shooter = state.clients.get('blue');
  state.clients.get('red').pos = { x: 20, z: 20 };
  const redKeeper = state.clients.get('ai_keeper_red');
  function advance(ms = 17) { now += ms; simulation.tick(); }
  // Runs play until it stops (goal, out) or maxTicks pass.
  function playOut(maxTicks = 200, each = () => {}) {
    for (let i = 0; i < maxTicks && state.phase === 'playing'; i++) { advance(); each(); }
  }
  // Charged shot from (x, z) at the red goal, aiming at aimX on the goal line.
  function chargedShot({ x = 0, z, aimX = 0, charge, prepare = () => {} }) {
    shooter.pos = { x, z };
    const dx = aimX - x, dz = -HALF_L - z, length = Math.hypot(dx, dz);
    shooter.facing = { x: dx / length, z: dz / length };
    shooter.vel = { x: 0, z: 0 };
    shooter.input = { x: 0, z: 0, sprint: false };
    shooter.cooldowns.S = 0;
    state.ballOwnerId = shooter.id;
    state.ballBody.position.set(x + shooter.facing.x * .86, BALL_R, z + shooter.facing.z * .86);
    state.ballBody.velocity.set(0, 0, 0);
    state.ballBody.angularVelocity.set(0, 0, 0);
    state.ballPrevPosition = null;
    actions.startShotCharge(shooter);
    prepare();
    now += Math.round(charge * 2000);
    actions.releaseShot(shooter);
    return messages.findLast((m) => m.action === 'shot');
  }
  // Loose ball launched from a point with a given velocity.
  function launch(position, velocity) {
    state.ballOwnerId = null;
    state.looseBallUntil = 0;
    state.ballBody.position.set(...position);
    state.ballBody.velocity.set(...velocity);
    state.ballBody.angularVelocity.set(0, 0, 0);
    state.ballPrevPosition = null;
  }
  const removeRedKeeper = () => state.clients.delete('ai_keeper_red');
  return { state, messages, actions, shooter, redKeeper, advance, playOut, chargedShot, launch, removeRedKeeper, wait: (ms) => { now += ms; } };
}

test('goal-line decisions follow the ball path: inside the mouth is a goal, over the bar or wide never is', () => {
  const inside = classifyGoalLineCrossing({ x: 1, y: .5, z: 31.5 }, { x: 1.1, y: .45, z: 32.3 }, 1 / 60);
  assert.equal(inside.goal, true);
  assert.equal(inside.end, 1);
  const overBar = classifyGoalLineCrossing({ x: 0, y: 3.2, z: -31.4 }, { x: 0, y: 3, z: -32.4 }, 1 / 60);
  assert.equal(overBar.goal, false, 'above the crossbar is out');
  const wide = classifyGoalLineCrossing({ x: 4.5, y: .3, z: 31.6 }, { x: 4.6, y: .3, z: 32.4 }, 1 / 60);
  assert.equal(wide.goal, false, 'outside the posts is out');
  // Crosses the plane above the bar and only dips below it afterwards.
  const dipping = classifyGoalLineCrossing({ x: 0, y: 2.6, z: 31.5 }, { x: 0, y: 2.1, z: 32.3 }, 1 / 60);
  assert.ok(dipping.y > GOAL_HEIGHT - BALL_R);
  assert.equal(dipping.goal, false, 'a ball over the bar at the line never counts');
  assert.equal(classifyGoalLineCrossing({ x: 0, y: .2, z: 31.9 }, { x: 0, y: .2, z: GOAL_LINE_CROSSING_Z - .01 }, 1 / 60), null,
    'still in play until the whole ball is over the line');
});

test('charge shapes both speed and lift: partial charges are weaker and lower', (t) => {
  const { actions } = fixture(t);
  const levels = [0, .15, .3, .5, .65, .85, 1].map((charge) => actions.shotParameters(charge, 0, () => .5));
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i].speed > levels[i - 1].speed, 'speed rises with charge');
    assert.ok(levels[i].lift > levels[i - 1].lift, 'lift rises with charge');
  }
  assert.equal(levels[0].speed, SHOT_MIN_SPEED);
  assert.equal(levels[0].lift, SHOT_MIN_LIFT);
  assert.equal(levels.at(-1).speed, SHOT_MAX_SPEED);
  assert.equal(levels.at(-1).lift, SHOT_MAX_LIFT);
  assert.ok(levels[2].lift < SHOT_MIN_LIFT + (SHOT_MAX_LIFT - SHOT_MIN_LIFT) * .3, '30 % stays low');
  // Bands: 0–50 % normal, 50–80 % strong, 80–100 % very fast, 100 % rocket.
  const speed = (charge) => actions.shotParameters(charge, 0, () => .5).speed;
  assert.equal(Math.round(speed(.5)), 27);
  assert.equal(Math.round(speed(.8)), 37);
  assert.equal(speed(1), SHOT_MAX_SPEED);
  assert.ok(speed(.8) - speed(.5) > 8 && speed(1) - speed(.8) > 6, 'every band is clearly faster than the one before');
  assert.ok(speed(1) > speed(.25) * 2, 'a full charge is dramatically faster than a short one');
});

test('a fully charged rocket can rise over the crossbar and is AUT, not a goal', (t) => {
  const { state, messages, shooter, chargedShot, playOut, removeRedKeeper } = fixture(t);
  removeRedKeeper();
  t.mock.method(Math, 'random', () => .99); // top of the full-power lift variation
  // Aimed at the upper-left corner from 26 m, where the height error is largest.
  const shot = chargedShot({ z: -HALF_L + 26, charge: 1, prepare: () => { shooter.shotCharge.aim = -1; } });
  assert.equal(shot.charge, 1);
  assert.equal(shot.speed, SHOT_MAX_SPEED);
  playOut();
  assert.equal(state.phase, 'outOfPlay');
  assert.deepEqual(state.score, { blue: 0, red: 0 });
  assert.equal(state.outEvent.defendingTeam, 'red');
  assert.ok(state.outEvent.position.y > GOAL_HEIGHT - BALL_R, `crossed at height ${state.outEvent.position.y}`);
  assert.ok(messages.some((m) => m.type === SERVER.OUT_OF_PLAY));
});

test('a full-power rocket without extra lift stays on target and scores', (t) => {
  const { state, chargedShot, playOut, removeRedKeeper } = fixture(t);
  removeRedKeeper();
  const shot = chargedShot({ z: -HALF_L + 18, charge: 1 });
  assert.equal(shot.speed, SHOT_MAX_SPEED);
  playOut();
  assert.equal(state.phase, 'goalCelebration');
  assert.deepEqual(state.score, { blue: 1, red: 0 });
});

test('a moderate charge from the same spot stays under the bar and scores', (t) => {
  const { state, chargedShot, playOut, removeRedKeeper } = fixture(t);
  removeRedKeeper();
  chargedShot({ z: -HALF_L + 16, charge: .45 });
  playOut();
  assert.equal(state.phase, 'goalCelebration');
  assert.deepEqual(state.score, { blue: 1, red: 0 });
});

test('a wide shot is AUT; after about 2 s the defending keeper restarts with a goal kick', (t) => {
  const { state, messages, chargedShot, playOut, advance, shooter } = fixture(t);
  chargedShot({ x: 2, z: -HALF_L + 16, aimX: GOAL_HALF_W + 3, charge: .3 });
  playOut();
  assert.equal(state.phase, 'outOfPlay');
  assert.ok(Math.abs(state.outEvent.position.x) > GOAL_HALF_W);
  const out = messages.findLast((m) => m.type === SERVER.OUT_OF_PLAY);
  assert.equal(out.outEvent.endsAt - out.outEvent.startedAt, OUT_OF_PLAY_SECONDS * 1000);
  assert.deepEqual(out.ball, { ...out.ball, vx: 0, vy: 0, vz: 0 }, 'play is stopped');

  // An attacker standing in the box must be moved out for the goal kick.
  shooter.pos = { x: 1, z: -HALF_L + 3 };
  advance(OUT_OF_PLAY_SECONDS * 1000 - 40);
  assert.equal(state.phase, 'outOfPlay', 'the notice runs for the full duration');
  advance(40);
  assert.equal(state.phase, 'playing');
  const kick = messages.findLast((m) => m.type === SERVER.RESTART);
  assert.ok(kick, 'every client receives the authoritative restart');
  assert.equal(kick.outEvent.restart, 'goalKick');
  assert.equal(kick.outEvent.notice, 'AUT');
  assert.equal(state.ballOwnerId, 'ai_keeper_red');
  assert.ok(Math.abs(state.ballBody.position.z - (-(HALF_L - GOAL_KICK_DISTANCE))) < .3, 'ball placed in front of the red goal');
  assert.ok(Math.abs(state.ballBody.position.x) <= GOAL_KICK_MAX_SIDE + .3);
  assert.ok(-shooter.pos.z < HALF_L - FIELD.PENALTY_DEPTH, 'attacker moved out of the penalty area');
});

test('a well-placed shot past the keeper scores; the same shot at the keeper is saved', (t) => {
  const run = (aimX) => {
    const { state, redKeeper, launch, playOut, messages } = fixture(t);
    redKeeper.pos = { x: 0, z: -HALF_L + .6 };
    const from = [0, .5, -HALF_L + 12];
    const dx = aimX, dz = -12.6, length = Math.hypot(dx, dz);
    launch(from, [28 * dx / length, 2, 28 * dz / length]);
    playOut(120);
    return { state, messages };
  };
  const corner = run(GOAL_HALF_W - .45);
  assert.equal(corner.state.phase, 'goalCelebration', 'a hard shot near the post beats the dive');
  assert.deepEqual(corner.state.score, { blue: 1, red: 0 });
  t.mock.restoreAll();

  const central = run(0);
  assert.deepEqual(central.state.score, { blue: 0, red: 0 });
  assert.ok(central.messages.some((m) => m.id === 'ai_keeper_red' && ['save', 'parry'].includes(m.action)), 'the keeper saves it');
});

test('a ball over the keeper but under the crossbar scores', (t) => {
  const { state, redKeeper, launch, playOut } = fixture(t);
  redKeeper.pos = { x: 0, z: -HALF_L + 1.5 };
  launch([0, 2.75, -HALF_L + 4], [0, -1.5, -15]);
  playOut(60, () => { redKeeper.pos.z = -HALF_L + 1.5; });
  assert.equal(state.phase, 'goalCelebration');
  assert.deepEqual(state.score, { blue: 1, red: 0 });
});

test('the ball rebounds off a post and off the crossbar instead of scoring', (t) => {
  const post = fixture(t);
  post.removeRedKeeper();
  const postX = GOAL_HALF_W + GOAL_POST_R;
  post.launch([postX, .8, -HALF_L + 6], [0, 0, -20]);
  let reboundedFromPost = false;
  post.playOut(80, () => { if (post.state.ballBody.velocity.z > 1) reboundedFromPost = true; });
  assert.ok(reboundedFromPost, 'the post sends the ball back');
  assert.deepEqual(post.state.score, { blue: 0, red: 0 });
  t.mock.restoreAll();

  const bar = fixture(t);
  bar.removeRedKeeper();
  const barY = GOAL_HEIGHT + GOAL_POST_R;
  // Launched so gravity brings the ball onto the bar as it arrives.
  const time = 5 / 18;
  bar.launch([0, barY, -HALF_L + 5], [0, 9.82 * time / 2, -18]);
  let reboundedFromBar = false;
  bar.playOut(80, () => { if (bar.state.ballBody.velocity.z > 1) reboundedFromBar = true; });
  assert.ok(reboundedFromBar, 'the crossbar sends the ball back');
  assert.deepEqual(bar.state.score, { blue: 0, red: 0 });
});

test('AUT and the goal kick reach every client identically', { timeout: 20000 }, async (t) => {
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
    await wait((m) => m.type === SERVER.WELCOME);
    send({ type: CLIENT.SELECT_SLOT, team, slot: 4 });
    return { socket, messages, send, wait };
  }
  const a = await connect('A', 'blue');
  const b = await connect('B', 'red');
  await b.wait((m) => m.type === SERVER.LOBBY && m.players.filter((p) => Number.isInteger(p.slot)).length === 2);
  a.send({ type: CLIENT.READY, ready: true });
  b.send({ type: CLIENT.READY, ready: true });
  await a.wait((m) => m.type === SERVER.MATCH_START);
  await b.wait((m) => m.type === SERVER.MATCH_START);

  // A ball over the red crossbar.
  state.ballOwnerId = null;
  state.looseBallUntil = 0;
  state.ballBody.position.set(0, 3.5, -HALF_L - .6);
  state.ballBody.velocity.set(0, 0, 0);
  const outA = await a.wait((m) => m.type === SERVER.OUT_OF_PLAY);
  const outB = await b.wait((m) => m.type === SERVER.OUT_OF_PLAY);
  assert.deepEqual(outA, outB);
  assert.equal(outA.phase, 'outOfPlay');
  assert.equal(outA.outEvent.defendingTeam, 'red');
  const kickA = await a.wait((m) => m.type === SERVER.RESTART);
  const kickB = await b.wait((m) => m.type === SERVER.RESTART);
  assert.deepEqual(kickA, kickB);
  assert.ok(kickA.serverTime - outA.serverTime >= OUT_OF_PLAY_SECONDS * 1000 - 20);
  assert.ok(kickA.players.find((p) => p.id === 'ai_keeper_red').hasBall);
  for (const client of [a, b]) client.socket.close();
});
