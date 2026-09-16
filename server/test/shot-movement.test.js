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
import { BALL_R } from '../../shared/field.js';
import { SHOT_MAX_CHARGE_MS } from '../../shared/shot.js';
import { CLIENT, SERVER } from '../../src/network/protocol.js';
import { createShotPowerBar } from '../../src/ui/shotPowerBar.js';
import {
  PLAYER_SPEED, SPRINT_SPEED, SHOT_MIN_POWER, SHOT_MAX_POWER, SHOT_POWER_EXPONENT, SHOT_MIN_LIFT, MAX_SHOT_SPIN,
} from '../core/config.js';

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
  const shooter = state.clients.get('blue');
  function giveBall(c = shooter) {
    state.ballOwnerId = c.id;
    state.ballBody.position.set(c.pos.x + c.facing.x * .86, BALL_R, c.pos.z + c.facing.z * .86);
    state.ballBody.velocity.set(0, 0, 0);
    state.ballBody.angularVelocity.set(0, 0, 0);
  }
  return {
    state, messages, players, actions, shooter, giveBall,
    wait(ms) { now += ms; },
    advance(ms = 17) { now += ms; simulation.tick(); },
  };
}
const horizontalSpeed = (body) => Math.hypot(body.velocity.x, body.velocity.z);
const expectedPower = (charge) => SHOT_MIN_POWER + (SHOT_MAX_POWER - SHOT_MIN_POWER) * Math.pow(charge, SHOT_POWER_EXPONENT);
const heading = (c) => Math.atan2(c.facing.x, c.facing.z);

test('S starts a shot charge only with possession; without the ball it stays a standing tackle', (t) => {
  const { state, actions, messages, shooter, giveBall } = fixture(t);
  state.ballOwnerId = null;
  state.ballBody.position.set(10, BALL_R, 10);
  actions.startShotCharge(shooter);
  assert.equal(shooter.shotCharge, null);
  assert.equal(messages.at(-1).action, 'standing_tackle');

  shooter.cooldowns.S = 0;
  giveBall();
  actions.startShotCharge(shooter);
  assert.ok(shooter.shotCharge);
  assert.equal(messages.at(-1).action, 'shot_charge');
  assert.equal(state.ballOwnerId, shooter.id, 'charging does not release the ball');
});

test('releasing S fires a shot with power timed by the server clock', (t) => {
  const { state, actions, messages, shooter, giveBall, wait } = fixture(t);
  giveBall();
  actions.startShotCharge(shooter);
  wait(1000);
  actions.releaseShot(shooter);
  const result = messages.at(-1);
  assert.equal(result.action, 'shot');
  assert.equal(result.charge, .5);
  assert.equal(state.ballOwnerId, null);
  assert.equal(shooter.shotCharge, null);
  assert.ok(Math.abs(horizontalSpeed(state.ballBody) - expectedPower(.5)) < 1e-9);
  assert.ok(horizontalSpeed(state.ballBody) > SHOT_MIN_POWER && horizontalSpeed(state.ballBody) < SHOT_MAX_POWER);
});

test('a 2 s hold gives maximum power and holding longer cannot exceed it', (t) => {
  const { state, actions, messages, shooter, giveBall, wait } = fixture(t);
  const speeds = [];
  for (const hold of [SHOT_MAX_CHARGE_MS, 5000]) {
    shooter.cooldowns.S = 0;
    giveBall();
    actions.startShotCharge(shooter);
    wait(hold);
    actions.releaseShot(shooter);
    assert.equal(messages.at(-1).charge, 1);
    speeds.push(horizontalSpeed(state.ballBody));
  }
  for (const speed of speeds) assert.ok(Math.abs(speed - SHOT_MAX_POWER) < 1e-9);
});

test('holding S for the full 2 s fires automatically at maximum power without a release', (t) => {
  const { state, actions, messages, shooter, giveBall, advance } = fixture(t);
  state.clients.get('red').pos = { x: 20, z: 20 };
  giveBall();
  actions.startShotCharge(shooter);
  let elapsed = 0;
  while (elapsed < SHOT_MAX_CHARGE_MS - 17) {
    advance(17); elapsed += 17;
    state.ballOwnerId = shooter.id;
    state.ballBody.position.set(shooter.pos.x + shooter.facing.x * .86, BALL_R, shooter.pos.z + shooter.facing.z * .86);
    state.ballBody.velocity.set(0, 0, 0);
  }
  assert.ok(shooter.shotCharge, 'still charging just before the limit');
  assert.ok(!messages.some((m) => m.action === 'shot'));
  advance(17);
  const shot = messages.findLast((m) => m.action === 'shot');
  assert.ok(shot, 'the server fired on its own');
  assert.equal(shot.charge, 1);
  assert.equal(shooter.shotCharge, null);
  const count = messages.filter((m) => m.action === 'shot').length;
  actions.releaseShot(shooter); // the late key-up is harmless
  assert.equal(messages.filter((m) => m.action === 'shot').length, count);
});

test('releasing without a server-side charge or after losing the ball never shoots', (t) => {
  const { state, actions, messages, shooter, giveBall, advance } = fixture(t);
  giveBall();
  const before = messages.length;
  actions.releaseShot(shooter);
  assert.equal(messages.length, before, 'a bare release is ignored');

  actions.startShotCharge(shooter);
  // An opponent wins the ball mid-charge.
  const opponent = state.clients.get('red');
  state.ballOwnerId = opponent.id;
  state.ballBody.position.set(opponent.pos.x, BALL_R, opponent.pos.z);
  advance();
  assert.equal(shooter.shotCharge, null);
  assert.ok(messages.some((m) => m.id === shooter.id && m.action === 'shot_cancel'));
  const count = messages.filter((m) => m.action === 'shot').length;
  actions.releaseShot(shooter);
  assert.equal(messages.filter((m) => m.action === 'shot').length, count);
});

test('opposite input brakes and turns before running the other way', (t) => {
  const { players, shooter } = fixture(t);
  shooter.facing = { x: 1, z: 0 };
  shooter.vel = { x: PLAYER_SPEED, z: 0 };
  shooter.input = { x: -1, z: 0, sprint: false };
  players.applyPlayerControl(shooter, 1 / 60);
  assert.ok(shooter.vel.x > 0, 'velocity does not flip instantly');
  assert.ok(Math.hypot(shooter.vel.x, shooter.vel.z) < PLAYER_SPEED, 'the player brakes first');
  let minSpeed = Infinity;
  for (let i = 0; i < 120; i++) {
    players.applyPlayerControl(shooter, 1 / 60);
    minSpeed = Math.min(minSpeed, Math.hypot(shooter.vel.x, shooter.vel.z));
  }
  assert.ok(minSpeed < 1.5, 'speed drops while turning round');
  assert.ok(Math.abs(shooter.vel.x + PLAYER_SPEED) < 1e-6, 'then accelerates to full speed the other way');
});

test('sprinting turns slower than jogging, and both need time to turn', (t) => {
  const { players, shooter } = fixture(t);
  function turnedAngle(sprint) {
    const speed = sprint ? SPRINT_SPEED : PLAYER_SPEED;
    shooter.facing = { x: 0, z: 1 };
    shooter.vel = { x: 0, z: speed };
    shooter.input = { x: 1, z: 0, sprint };
    const start = heading(shooter);
    for (let i = 0; i < 6; i++) players.applyPlayerControl(shooter, 1 / 60);
    return Math.abs(heading(shooter) - start);
  }
  const jog = turnedAngle(false), sprint = turnedAngle(true);
  assert.ok(jog < Math.PI / 2, 'no instant 90° snap');
  assert.ok(sprint < jog * .7, `sprint turn ${sprint} should be clearly slower than jog turn ${jog}`);
});

test('movement is frame-rate independent', (t) => {
  const { players, shooter } = fixture(t);
  function run(dt) {
    shooter.pos = { x: 0, z: 0 };
    shooter.facing = { x: 0, z: 1 };
    shooter.vel = { x: 0, z: 0 };
    shooter.input = { x: 1, z: 0, sprint: false };
    for (let elapsed = 0; elapsed < 1.5 - 1e-9; elapsed += dt) players.applyPlayerControl(shooter, dt);
    return { ...shooter.pos, speed: Math.hypot(shooter.vel.x, shooter.vel.z) };
  }
  const fine = run(1 / 120), coarse = run(1 / 20);
  assert.ok(Math.hypot(fine.x - coarse.x, fine.z - coarse.z) < .35, `positions ${JSON.stringify(fine)} vs ${JSON.stringify(coarse)}`);
  assert.ok(Math.abs(fine.speed - coarse.speed) < 1e-6);
});

test('curve intent from left/right input is bounded and spin never exceeds MAX_SHOT_SPIN', (t) => {
  const { state, actions, messages, shooter, giveBall, advance } = fixture(t);
  assert.equal(Math.abs(actions.shotParameters(1, 25).spin), MAX_SHOT_SPIN);
  assert.equal(Math.abs(actions.shotParameters(.4, -25).spin), MAX_SHOT_SPIN);
  giveBall();
  actions.startShotCharge(shooter);
  // Hold the shooter's right (computed from the facing) for 1.7 s, just short of the auto-fire.
  shooter.input = { x: -shooter.facing.z, z: shooter.facing.x, sprint: false };
  for (let i = 0; i < 100; i++) {
    advance(17);
    state.ballOwnerId = shooter.id; // keep possession for the test while the player drifts
    state.ballBody.position.set(shooter.pos.x + shooter.facing.x * .86, BALL_R, shooter.pos.z + shooter.facing.z * .86);
    assert.ok(Math.abs(shooter.shotCharge.curve) <= 1);
  }
  actions.releaseShot(shooter);
  const shot = messages.at(-1);
  assert.equal(shot.action, 'shot');
  assert.ok(Math.abs(shot.spin) <= MAX_SHOT_SPIN);
  assert.ok(shot.spin < 0, 'a right curve spins clockwise seen from above');
});

test('a curled shot bends through the authoritative simulation; a straight one does not', (t) => {
  const { state, actions, messages, shooter, giveBall, advance, wait } = fixture(t);
  const opponent = state.clients.get('red');
  opponent.pos = { x: 20, z: 20 };
  function lateralVelocities(curve) {
    shooter.pos = { x: 0, z: 5 };
    shooter.facing = { x: 0, z: -1 };
    shooter.vel = { x: 0, z: 0 };
    shooter.input = { x: 0, z: 0, sprint: false };
    shooter.cooldowns.S = 0;
    giveBall();
    actions.startShotCharge(shooter);
    shooter.shotCharge.curve = curve;
    wait(1000);
    actions.releaseShot(shooter);
    assert.equal(messages.at(-1).action, 'shot');
    const right = { x: -shooter.facing.z, z: shooter.facing.x };
    const lateral = () => state.ballBody.velocity.x * right.x + state.ballBody.velocity.z * right.z;
    const start = lateral();
    for (let i = 0; i < 24; i++) advance(17);
    return { start, end: lateral() };
  }
  const straight = lateralVelocities(0);
  assert.ok(Math.abs(straight.start) < 1e-9 && Math.abs(straight.end) < 1e-6, 'no spin, no bend');
  const curled = lateralVelocities(1);
  assert.ok(curled.start < 0, 'a right curve launches slightly to the left');
  assert.ok(curled.end - curled.start > 1.5, `the ball bends right in flight (${curled.start} → ${curled.end})`);
});

test('segmented power bar fills left to right, caps at 100% and hides on stop', () => {
  const classes = new Set();
  const segments = Array.from({ length: 10 }, () => {
    const props = {};
    return { props, style: { setProperty: (name, value) => { props[name] = Number(value); } } };
  });
  const element = {
    hidden: true, style: {}, querySelectorAll: () => segments,
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), remove: (name) => classes.delete(name) },
  };
  const fills = () => segments.map((s) => s.props['--fill']);
  const bar = createShotPowerBar(element);
  bar.start(1000);
  assert.equal(bar.isCharging(), true);
  assert.equal(element.hidden, true, 'nothing shows before the first positioned frame');
  bar.update(1000 + SHOT_MAX_CHARGE_MS * .55, { x: 100, y: 50, visible: true });
  assert.equal(element.hidden, false);
  assert.deepEqual(fills().map((f) => Math.round(f * 100) / 100), [1, 1, 1, 1, 1, .5, 0, 0, 0, 0]);
  bar.update(9000, { x: 100, y: 50, visible: true });
  assert.deepEqual(fills(), Array(10).fill(1));
  assert.ok(classes.has('max'));
  bar.update(9100, null);
  assert.equal(element.hidden, true, 'hidden when the player is off screen');
  bar.stop();
  assert.equal(bar.isCharging(), false);
  assert.equal(element.hidden, true);
  assert.deepEqual(fills(), Array(10).fill(0));
  assert.ok(!classes.has('max'));
});

test('charged shots over WebSocket ignore spoofed power and reach every client identically', { timeout: 20000 }, async (t) => {
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

  const shooter = state.clients.get(a.id);
  state.clients.get(b.id).pos = { x: 18, z: 18 };
  shooter.pos = { x: 0, z: 4 };
  shooter.facing = { x: 0, z: -1 };
  state.ballOwnerId = shooter.id;
  state.ballBody.position.set(0, BALL_R, 3.2);
  state.ballBody.velocity.set(0, 0, 0);
  a.send({ type: CLIENT.SHOT_CHARGE_START, power: 100, charge: 1 });
  await a.wait((m) => m.type === SERVER.ACTION_RESULT && m.action === 'shot_charge');
  // Hold the shooter's left while charging, then release claiming full power.
  a.send({ type: CLIENT.INPUT, x: -1, z: 0, sprint: false });
  await new Promise((r) => setTimeout(r, 450));
  a.send({ type: CLIENT.SHOT_RELEASE, power: 100, charge: 1, spin: 999 });
  const shotA = await a.wait((m) => m.type === SERVER.ACTION_RESULT && m.action === 'shot');
  const shotB = await b.wait((m) => m.type === SERVER.ACTION_RESULT && m.action === 'shot');
  assert.deepEqual(shotA, shotB);
  assert.ok(shotA.charge > .1 && shotA.charge < .5, `server-timed charge ${shotA.charge}`);
  assert.ok(Math.abs(shotA.spin) > 0 && Math.abs(shotA.spin) <= MAX_SHOT_SPIN);
  // The next few snapshots carry the same spinning ball state to both clients.
  const fromA = a.messages.length, fromB = b.messages.length;
  const later = await a.wait((m) => m.type === SERVER.STATE && Math.abs(m.ball.wy) > 0, fromA);
  const same = await b.wait((m) => m.type === SERVER.STATE && m.serverTime === later.serverTime, fromB);
  assert.deepEqual(same.ball, later.ball);
  for (const client of [a, b]) client.socket.close();
});
