import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../core/gameState.js';
import { createPlayerManager } from '../gameplay/playerManager.js';
import { createActions } from '../gameplay/actions.js';
import { buildWorld, createBallPhysics } from '../gameplay/ballPhysics.js';
import { createMatchManager } from '../gameplay/matchManager.js';
import { createSimulation } from '../gameplay/simulation.js';
import { cornerPull } from '../gameplay/shotAim.js';
import { BALL_R, HALF_L, GOAL_HALF_W, GOAL_HEIGHT } from '../../shared/field.js';
import { SHOT_MAX_SPEED, SHOT_MAX_LIFT, SHOT_CORNER_INSET, SHOT_CORNER_HEIGHT, SHOT_AIM_MAX_DEG } from '../core/config.js';

// Blue attacks the red goal at -Z; from the shooter's view +X is right.
function fixture(t, { keeper = false } = {}) {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(Math, 'random', () => .5); // no target error unless a test sets one
  const state = createGameState(), messages = [];
  const broadcast = (message) => messages.push(structuredClone(message));
  const players = createPlayerManager({ state });
  const actions = createActions({ state, broadcast });
  const physics = createBallPhysics({ state });
  const match = createMatchManager({ state, broadcast, broadcastLobby: () => {}, buildWorld, ...players });
  const simulation = createSimulation({ state, broadcast, broadcastLobby: () => {}, players, physics, actions, match });
  for (const team of ['blue', 'red']) state.clients.set(team, { id: team, team, name: team, slot: 4, position: 'FRV', ready: true });
  match.startMatch();
  if (!keeper) state.clients.delete('ai_keeper_red');
  const shooter = state.clients.get('blue');
  state.clients.get('red').pos = { x: 20, z: 20 };

  // A real charged shot from (x, goal distance) facing faceX on the goal line.
  // Returns where the ball centre crossed the goal line and how play ended.
  function shoot({ x = 0, distance, faceX = 0, charge, aim = 0, facing = null, running = 0 }) {
    const z = -HALF_L + distance;
    const dx = faceX - x, dz = -HALF_L - z, length = Math.hypot(dx, dz);
    shooter.pos = { x, z };
    shooter.facing = facing || { x: dx / length, z: dz / length };
    shooter.vel = { x: shooter.facing.x * running, z: shooter.facing.z * running };
    shooter.input = { x: 0, z: 0, sprint: false };
    state.ballOwnerId = shooter.id;
    state.ballBody.position.set(x + shooter.facing.x * .86, BALL_R, z + shooter.facing.z * .86);
    state.ballBody.velocity.set(shooter.vel.x, 0, shooter.vel.z);
    state.ballPrevPosition = null;
    actions.startShotCharge(shooter);
    shooter.shotCharge.aim = aim;
    now += Math.round(charge * 2000);
    actions.releaseShot(shooter);
    const shot = messages.findLast((m) => m.action === 'shot');
    let previous = { ...state.ballBody.position }, crossing = null;
    const velocities = [];
    for (let i = 0; i < 150 && state.phase === 'playing'; i++) {
      now += 17;
      simulation.tick();
      const p = state.ballBody.position;
      velocities.push({ x: state.ballBody.velocity.x, z: state.ballBody.velocity.z });
      if (!crossing && p.z <= -HALF_L && previous.z > -HALF_L) {
        const f = (-HALF_L - previous.z) / (p.z - previous.z);
        crossing = { x: previous.x + (p.x - previous.x) * f, y: previous.y + (p.y - previous.y) * f };
      }
      previous = { x: p.x, y: p.y, z: p.z };
    }
    return { shot, crossing, velocities, phase: state.phase, messages };
  }
  return { state, shoot };
}

test('corner pull: none for straight shots or below 50 %, rising through 80–100 %, a slight aim is enough', () => {
  assert.equal(cornerPull(1, 0), 0, 'straight shots are never steered');
  assert.equal(cornerPull(.5, 1), 0);
  assert.equal(cornerPull(.3, -1), 0);
  assert.ok(cornerPull(.8, 1) > 0 && cornerPull(.8, 1) < cornerPull(.9, 1) && cornerPull(.9, 1) < cornerPull(1, 1));
  assert.equal(cornerPull(1, 1), 1);
  assert.equal(cornerPull(1, -.5), 1, 'a slight left aim picks the corner at full power');
  assert.ok(cornerPull(1, .2) > 0 && cornerPull(1, .2) < 1);
});

test('full power with a slight left or right aim goes into that upper corner', (t) => {
  for (const [aim, side] of [[-.5, -1], [.5, 1]]) {
    const { shoot } = fixture(t);
    const { shot, crossing, phase } = shoot({ distance: 18, charge: 1, aim });
    assert.equal(shot.speed, SHOT_MAX_SPEED);
    assert.ok(Math.abs(crossing.x - side * (GOAL_HALF_W - SHOT_CORNER_INSET)) < .1, `side ${side}: crossed at x ${crossing.x}`);
    assert.ok(Math.abs(crossing.y - SHOT_CORNER_HEIGHT) < .1, `crossed at height ${crossing.y}`);
    assert.equal(phase, 'goalCelebration');
  }
});

test('the corner is reached from an angle and on the run; a straight rocket stays central', (t) => {
  const angled = fixture(t).shoot({ x: 7, distance: 15, faceX: 2, charge: 1, aim: -1 });
  assert.ok(Math.abs(angled.crossing.x + (GOAL_HALF_W - SHOT_CORNER_INSET)) < .1, `far corner from the right: x ${angled.crossing.x}`);
  const running = fixture(t).shoot({ x: -3, distance: 20, charge: 1, aim: .6, running: 8.8 });
  assert.ok(Math.abs(running.crossing.x - (GOAL_HALF_W - SHOT_CORNER_INSET)) < .15, `on the run: x ${running.crossing.x}`);
  assert.ok(Math.abs(running.crossing.y - SHOT_CORNER_HEIGHT) < .15, `on the run: y ${running.crossing.y}`);
  const straight = fixture(t).shoot({ distance: 18, charge: 1, aim: 0 });
  assert.ok(Math.abs(straight.crossing.x) < 1e-6, 'no sideways movement at all');
  assert.ok(straight.crossing.y > .8 && straight.crossing.y < 1.6, `central height ${straight.crossing.y}`);
});

test('the corner tendency grows with charge: 80 % leans toward it, 100 % reaches it', (t) => {
  const at = (charge) => fixture(t).shoot({ distance: 16, charge, aim: 1 }).crossing;
  const strong = at(.65), veryFast = at(.8), rocket = at(1);
  assert.ok(strong.x < veryFast.x && veryFast.x < rocket.x, `wider with charge: ${strong.x} ${veryFast.x} ${rocket.x}`);
  assert.ok(strong.y < veryFast.y && veryFast.y < rocket.y, `higher with charge: ${strong.y} ${veryFast.y} ${rocket.y}`);
  const low = at(.4);
  assert.ok(Math.abs(Math.atan2(low.x, 16) * 180 / Math.PI) < SHOT_AIM_MAX_DEG + 1.5, 'below 50 % the plain small aim applies');
});

test('corner shots are not guaranteed: the target error can put them on the frame, wide or over', (t) => {
  // The largest outward error from 24 m, for each corner (the error is random:
  // toward the middle it stays on target and is left to the keeper).
  for (const [aim, random] of [[1, .99], [-1, 0]]) {
    const { state, shoot } = fixture(t);
    t.mock.method(Math, 'random', () => random);
    const { phase, crossing } = shoot({ distance: 24, charge: 1, aim });
    assert.notEqual(phase, 'goalCelebration', `aim ${aim}: no goal (crossed at ${JSON.stringify(crossing)})`);
    assert.deepEqual(state.score, { blue: 0, red: 0 });
    assert.ok(!crossing || Math.abs(crossing.x) > GOAL_HALF_W - BALL_R || crossing.y > GOAL_HEIGHT - BALL_R, 'wide, high or off the frame');
  }
  const inward = fixture(t);
  t.mock.method(Math, 'random', () => 0);
  const { crossing } = inward.shoot({ distance: 24, charge: 1, aim: 1 });
  assert.ok(crossing.x < GOAL_HALF_W - SHOT_CORNER_INSET - .5 && crossing.y < SHOT_CORNER_HEIGHT - .3, 'an inward error lands lower and nearer the keeper');
});

test('shots not facing the goal, or from too far, are not steered', (t) => {
  const sideways = fixture(t).shoot({ distance: 12, charge: 1, aim: 1, facing: { x: 1, z: 0 } });
  assert.ok(Math.abs(sideways.shot.lift - SHOT_MAX_LIFT) < 1e-9, 'plain full-power lift');
  const far = fixture(t).shoot({ distance: 40, charge: 1, aim: 1 });
  assert.ok(Math.abs(far.shot.lift - SHOT_MAX_LIFT) < 1e-9);
});

test('a shot leaves the grass cleanly: its launch direction is the aimed direction', (t) => {
  const { shot, velocities } = fixture(t).shoot({ distance: 20, faceX: 0, charge: .45, aim: 1 });
  const launchAngle = Math.atan2(velocities[0].x, -velocities[0].z) * 180 / Math.PI;
  assert.ok(shot.aim === 1);
  // Launched just inside the aim line (the curl carries it out), not scrubbed toward the pitch axis.
  assert.ok(launchAngle > SHOT_AIM_MAX_DEG - 2.5, `launch angle ${launchAngle}°`);
});

test('the keeper can save a straight rocket from close range', (t) => {
  const { state, shoot } = fixture(t, { keeper: true });
  const { phase, messages } = shoot({ distance: 16, charge: 1, aim: 0 });
  assert.notEqual(phase, 'goalCelebration');
  assert.deepEqual(state.score, { blue: 0, red: 0 });
  assert.ok(messages.some((m) => m.id === 'ai_keeper_red' && ['save', 'parry'].includes(m.action)), 'the keeper got to it');
});
