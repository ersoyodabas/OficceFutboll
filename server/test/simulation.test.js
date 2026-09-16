import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../core/gameState.js';
import { createPlayerManager } from '../gameplay/playerManager.js';
import { createActions } from '../gameplay/actions.js';
import { buildWorld, createBallPhysics } from '../gameplay/ballPhysics.js';
import { createMatchManager } from '../gameplay/matchManager.js';
import { createSimulation } from '../gameplay/simulation.js';
import { recordBallTouch } from '../gameplay/ballTouches.js';
import { BALL_R, HALF_W, HALF_L, GOAL_HALF_W, FIELD } from '../../shared/field.js';
import { PLAYER_SPEED, MATCH_DURATION_SECONDS, MATCH_END_PAUSE_SECONDS, GOAL_PAUSE_SECONDS, KICKOFF_PAUSE_SECONDS, SHOT_MIN_SPEED, SHOT_MIN_LIFT, OUT_OF_PLAY_SECONDS } from '../core/config.js';

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
  player.input = { x: 1, z: 1, sprint: false };
  for (let i = 0; i < 120; i++) players.applyPlayerControl(player, 1 / 60);
  // Diagonal input reaches, but never exceeds, the jog cap along the input direction.
  assert.ok(Math.abs(Math.hypot(player.vel.x, player.vel.z) - PLAYER_SPEED) < 1e-8);
  assert.ok(Math.abs(player.facing.x - Math.SQRT1_2) < 1e-9 && Math.abs(player.facing.z - Math.SQRT1_2) < 1e-9);
  for (const [key, action, horizontal, vertical] of [['A', 'pass', 16, .35], ['S', 'shot', SHOT_MIN_SPEED, SHOT_MIN_LIFT], ['D', 'cross', 16, 7.2]]) {
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
  // Turning takes time now; let the body come round to the input before sliding.
  for (let i = 0; i < 60; i++) players.applyPlayerControl(player, 1 / 60);
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

test('slide capture over the end line near the corner is out over the goal line, never a goal', (t) => {
  const { state, actions, advance, messages } = fixture(t);
  const player = state.clients.get('blue');
  player.pos = { x: HALF_W - .48, z: HALF_L - .48 };
  player.facing = { x: 0, z: 1 };
  player.input = { x: 0, z: 1, sprint: false };
  player.vel = { x: 0, z: 12.5 };
  state.ballBody.position.set(player.pos.x, BALL_R, player.pos.z + .7);
  state.ballBody.velocity.set(0, 0, 8);

  actions.performAction(player, 'D');
  assert.ok(state.ballBody.position.z > HALF_L + BALL_R, 'slide capture pushes the whole ball over the end line');
  advance();

  assert.equal(state.phase, 'outOfPlay', 'over the goal line is out of play');
  assert.equal(state.outEvent.boundary, 'goalLine', 'the goal line was crossed, not the touchline');
  assert.equal(state.outEvent.defendingTeam, 'blue');
  assert.equal(state.outEvent.notice, 'KORNER', 'blue put it over its own goal line');
  assert.ok(messages.some((m) => m.type === 'outOfPlay'));
  assert.deepEqual(state.score, { blue: 0, red: 0 }, 'a corner ball is not a goal');
});

test('a ball beside the post, outside the goal mouth, is out rather than a goal', (t) => {
  const { state, actions, advance } = fixture(t);
  const player = state.clients.get('blue');
  player.pos = { x: GOAL_HALF_W + .25, z: HALF_L - .48 };
  player.facing = { x: 0, z: 1 };
  player.input = { x: 0, z: 1, sprint: false };
  player.vel = { x: 0, z: 12.5 };
  state.ballBody.position.set(player.pos.x, BALL_R, player.pos.z + .7);
  state.ballBody.velocity.set(0, 0, 8);

  actions.performAction(player, 'D');
  advance();

  assert.equal(state.phase, 'outOfPlay');
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

test('AI keeper saves a shot it reaches and gathers back-passes without sliding at the ball', (t) => {
  const { state, actions, advance } = fixture(t);
  const keeper = state.clients.get('ai_keeper_blue');
  const opponent = state.clients.get('red');
  keeper.pos = { x: 0, z: HALF_L - .8 };
  opponent.pos = { x: 0, z: HALF_L - 2.4 };
  state.ballBody.position.set(opponent.pos.x, BALL_R, opponent.pos.z - .86);
  state.ballBody.velocity.set(0, 0, 0);
  state.ballOwnerId = opponent.id;

  actions.updateBallControl(.016);
  assert.equal(keeper.slideRemaining, 0, 'keeper holds position against a dribbler');
  assert.equal(state.ballOwnerId, opponent.id, 'keeper does not snatch a dribbled ball from a distance');

  // A catchable shot into the keeper's body.
  opponent.pos = { x: 15, z: 0 };
  state.clients.get('blue').pos = { x: -15, z: 0 };
  state.ballOwnerId = null;
  state.looseBallUntil = 0;
  state.ballBody.position.set(0, .9, HALF_L - 9);
  state.ballBody.velocity.set(0, 1.5, 14);
  for (let i = 0; i < 90 && state.ballOwnerId !== keeper.id; i++) advance();

  assert.equal(state.ballOwnerId, keeper.id, 'keeper holds a shot struck at the body');
  assert.equal(keeper.slideRemaining, 0, 'shot save does not use a slide tackle');
  assert.equal(keeper.lastAction.type, 'save');
  assert.deepEqual(state.score, { blue: 0, red: 0 });

  state.ballOwnerId = null;
  state.looseBallUntil = 0;
  keeper.keeperPossessionStartedAt = 0;
  state.ballBody.position.set(keeper.pos.x, BALL_R, keeper.pos.z - .9);
  state.ballBody.velocity.set(0, 0, 2);
  advance();

  assert.equal(state.ballOwnerId, keeper.id, 'keeper gathers a nearby back-pass');
  assert.equal(keeper.slideRemaining, 0, 'back-pass control does not use a slide tackle');
});

test('physics, crossbar filtering, out of play, goals, winning score and lobby reset remain authoritative', (t) => {
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
  assert.equal(state.phase, 'outOfPlay', 'it is out of play instead');
  advance(OUT_OF_PLAY_SECONDS * 1000);
  assert.equal(state.phase, 'playing', 'play resumes with a goal kick');
  assert.equal(state.ballOwnerId, 'ai_keeper_red', 'the defending keeper takes the goal kick');

  moveKeepersAway();
  state.ballOwnerId = null;
  state.looseBallUntil = 0;
  state.ballBody.position.set(0, BALL_R, -HALF_L - .5);
  state.ballBody.velocity.set(0, 0, 0);
  advance();
  assert.deepEqual(state.score, { blue: 1, red: 0 });
  assert.equal(state.phase, 'goalCelebration');
  advance(GOAL_PAUSE_SECONDS * 1000);
  assert.equal(state.phase, 'kickoff');
  assert.equal(state.ballOwnerId, 'red');
  assert.deepEqual(
    [state.ballBody.position.x, state.ballBody.position.y, state.ballBody.position.z],
    [0, BALL_R, 0],
    'ball restarts exactly on the centre spot after a goal',
  );
  advance(KICKOFF_PAUSE_SECONDS * 1000);
  state.score.blue = 4;
  moveKeepersAway();
  state.ballBody.position.set(0, BALL_R, -HALF_L - .5);
  advance();
  assert.equal(state.phase, 'goalCelebration');
  advance(GOAL_PAUSE_SECONDS * 1000);
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

test('goal sequence freezes actions, credits server touches and resets once at the deadline', (t) => {
  const { state, actions, match, advance, messages } = fixture(t);
  const attacker = state.clients.get('blue'), defender = state.clients.get('red');
  state.ballBody.position.set(attacker.pos.x, BALL_R, attacker.pos.z);
  state.ballOwnerId = attacker.id;
  actions.performAction(attacker, 'S');
  recordBallTouch(state, defender); // A defensive deflection must not replace the attacking scorer.
  const startedAt = state.matchStartedAt, endsAt = state.matchEndsAt;
  assert.equal(match.confirmGoal('blue'), true);
  assert.equal(match.confirmGoal('blue'), false);
  assert.equal(match.confirmGoal('red'), false);
  const goal = messages.find((m) => m.type === 'goal');
  assert.equal(goal.goalEvent.scorerId, 'blue');
  assert.equal(goal.goalEvent.scorerName, 'blue');
  assert.equal(goal.goalEvent.teamId, 'blue');
  assert.deepEqual(goal.score, { blue: 1, red: 0 });
  assert.equal(goal.phase, 'goalCelebration');
  const frozen = state.ballBody.position.clone(), frozenPlayers = [...state.clients.values()].map((c) => ({ ...c.pos }));
  const count = messages.filter((m) => m.type === 'actionResult').length;
  for (const key of ['A', 'S', 'D']) actions.performAction(attacker, key);
  advance(3999);
  assert.equal(state.phase, 'goalCelebration');
  assert.deepEqual(state.ballBody.position, frozen);
  assert.deepEqual([...state.clients.values()].map((c) => c.pos), frozenPlayers);
  assert.equal(messages.filter((m) => m.type === 'actionResult').length, count);
  const snapshot = messages.findLast((m) => m.type === 'state');
  assert.equal(snapshot.goalEvent.id, goal.goalEvent.id);
  assert.equal(snapshot.phase, 'goalCelebration');
  advance(1);
  assert.equal(state.phase, 'kickoff');
  assert.equal(state.pendingServe, 'red');
  assert.equal(state.ballOwnerId, defender.id);
  assert.deepEqual([state.ballBody.position.x, state.ballBody.position.y, state.ballBody.position.z], [0, BALL_R, 0]);
  assert.equal(state.ballBody.velocity.length(), 0);
  assert.equal(state.ballBody.angularVelocity.length(), 0);
  assert.deepEqual(attacker.pos, { x: FIELD.LOBBY_SLOTS[4].x, z: FIELD.LOBBY_SLOTS[4].z });
  assert.deepEqual(defender.pos, { x: 0, z: -.86 });
  for (const c of state.clients.values()) {
    assert.deepEqual(c.input, { x: 0, z: 0, sprint: false });
    assert.deepEqual(c.vel, { x: 0, z: 0 });
    assert.equal(c.slideRemaining, 0); assert.equal(c.standingActive, 0);
    assert.equal(c.lastAction, null); assert.deepEqual(c.cooldowns, { A: 0, S: 0, D: 0 });
  }
  assert.equal(state.matchStartedAt, startedAt); assert.equal(state.matchEndsAt, endsAt);
  actions.performAction(defender, 'S');
  assert.equal(state.ballBody.velocity.length(), 0, 'kickoff camera hold also blocks actions');
  advance(800);
  assert.equal(state.phase, 'playing');
  actions.performAction(defender, 'A');
  assert.equal(messages.at(-1).action, 'pass');
  assert.equal(messages.filter((m) => m.type === 'kickoffReset').length, 1);
  assert.equal(messages.filter((m) => m.type === 'goal').length, 1);
  // Touches from the previous goal are gone; unknown scorer remains null.
  match.confirmGoal('blue');
  assert.equal(state.goalEvent.scorerName, null);
  assert.equal(state.goalEvent.id, goal.goalEvent.id + 1);
});

test('aborting a celebration cancels it and a new match has no stale touch or phase', (t) => {
  const { state, match, advance } = fixture(t);
  match.confirmGoal('red');
  match.abortMatchToLobby();
  advance(5000);
  assert.equal(state.phase, 'lobby');
  assert.equal(state.goalEvent, null);
  match.startMatch();
  assert.equal(state.phase, 'playing');
  assert.deepEqual(state.lastTouches, { blue: null, red: null });
});

test('kickoff reassigns a departed taker and solo play can use the conceding AI keeper', (t) => {
  const { state, match, advance } = fixture(t);
  match.confirmGoal('blue');
  advance(4000);
  assert.equal(state.ballOwnerId, 'red');
  state.clients.delete('red');
  advance(800);
  assert.equal(state.ballOwnerId, 'ai_keeper_red');
  assert.equal(state.phase, 'playing');
  assert.equal(state.clients.get('ai_keeper_red').pos.z, -.86);
  advance(17); advance(520);
  assert.equal(state.ballOwnerId, null, 'AI takes kickoff and distributes automatically');
  assert.ok(state.ballBody.velocity.z > 0);
});

test('opposing possession clears a stale attacker while unknown goals remain safe', (t) => {
  const { state, actions, match } = fixture(t);
  recordBallTouch(state, state.clients.get('blue'));
  const opponent = state.clients.get('red');
  state.ballBody.position.set(opponent.pos.x, BALL_R, opponent.pos.z);
  state.ballOwnerId = opponent.id;
  actions.performAction(opponent, 'A');
  match.confirmGoal('blue');
  assert.equal(state.goalEvent.scorerId, null);
  assert.equal(state.goalEvent.scorerName, null);
});
