import { matchSnapshot } from './snapshot.js';
import { isMatchPhase } from '../../shared/matchPhases.js';
import { SERVER } from '../../src/network/protocol.js';
import { TICK_HZ, BROADCAST_HZ, WIN_SCORE, MAX_BALL_SPEED, MAX_BALL_HEIGHT } from '../core/config.js';
import { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, BALL_R } from '../../shared/field.js';
export function createSimulation({ state, broadcast, players, physics, actions, match }) {
let lastTick = Date.now();
let broadcastAccum = 0;

function containBallWithinPitch() {
  const ball = state.ballBody;
  const maxX = HALF_W - BALL_R;
  const maxZ = HALF_L - BALL_R;
  const goalOpeningHalfWidth = GOAL_HALF_W - BALL_R;
  const ballUnderCrossbar = ball.position.y <= GOAL_HEIGHT - BALL_R;

  if (ball.position.x < -maxX) {
    ball.position.x = -maxX;
    if (ball.velocity.x < 0) ball.velocity.x *= -.45;
  } else if (ball.position.x > maxX) {
    ball.position.x = maxX;
    if (ball.velocity.x > 0) ball.velocity.x *= -.45;
  }

  // Sliding tackles and possession control move the ball after Cannon's world
  // step. At an end-line wall that direct correction can otherwise teleport the
  // ball completely through the collider. Only the real goal opening stays open.
  const canEnterGoal = Math.abs(ball.position.x) < goalOpeningHalfWidth && ballUnderCrossbar;
  if (!canEnterGoal && ball.position.z < -maxZ) {
    ball.position.z = -maxZ;
    if (ball.velocity.z < 0) ball.velocity.z *= -.45;
  } else if (!canEnterGoal && ball.position.z > maxZ) {
    ball.position.z = maxZ;
    if (ball.velocity.z > 0) ball.velocity.z *= -.45;
  }

  return { ballUnderCrossbar, goalOpeningHalfWidth };
}

function tick() {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;

  if (state.phase === 'countdown') {
    state.countdownRemaining -= dt;
    if (state.countdownRemaining <= 0) match.startMatch();
  } else if (state.phase === 'goalCelebration' || state.phase === 'kickoff') {
    match.advanceGoalSequence(now);
  } else if (state.phase === 'playing') {
    for (const c of state.clients.values()) players.applyPlayerControl(c, dt);
    state.world.step(1 / TICK_HZ, dt, 5);
    actions.updateBallControl(dt);
    for (const c of state.clients.values()) physics.resolvePlayerBallContact(c);

    const { ballUnderCrossbar, goalOpeningHalfWidth } = containBallWithinPitch();

    if (state.ballBody.velocity.length() > MAX_BALL_SPEED) {
      state.ballBody.velocity.scale(MAX_BALL_SPEED / state.ballBody.velocity.length(), state.ballBody.velocity);
    }
    if (state.ballBody.position.y > MAX_BALL_HEIGHT) {
      state.ballBody.position.y = MAX_BALL_HEIGHT;
      if (state.ballBody.velocity.y > 0) state.ballBody.velocity.y = 0;
    }

    if (state.ballBody.position.z > HALF_L - BALL_R && Math.abs(state.ballBody.position.x) < goalOpeningHalfWidth && ballUnderCrossbar) {
      match.confirmGoal('red', now);
    } else if (state.ballBody.position.z < -HALF_L + BALL_R && Math.abs(state.ballBody.position.x) < goalOpeningHalfWidth && ballUnderCrossbar) {
      match.confirmGoal('blue', now);
    } else if (Math.abs(state.ballBody.position.z) > HALF_L + 2 || state.ballBody.position.y < -5) {
      match.resetAfterGoal(state.pendingServe === 'blue' ? 'red' : 'blue');
    }

    if (state.phase === 'playing' && (state.score.blue >= WIN_SCORE || state.score.red >= WIN_SCORE || now >= state.matchEndsAt)) match.endMatch();
  } else if (state.phase === 'ended') {
    state.endPauseRemaining -= dt;
    if (state.endPauseRemaining <= 0) match.backToLobby();
  }

  broadcastAccum += dt;
  if (broadcastAccum >= 1 / BROADCAST_HZ) {
    broadcastAccum = 0;
    if (isMatchPhase(state.phase) && state.world) {
      broadcast({ type: SERVER.STATE, ...matchSnapshot(state, now) });
    }
  }
}

return { tick };
}
