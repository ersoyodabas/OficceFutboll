import { matchSnapshot } from './snapshot.js';
import { classifyGoalLineCrossing } from './goalLine.js';
import { isMatchPhase } from '../../shared/matchPhases.js';
import { SERVER } from '../../src/network/protocol.js';
import { BROADCAST_HZ, WIN_SCORE, MAX_BALL_SPEED, MAX_BALL_HEIGHT, PHYSICS_STEP, PHYSICS_MAX_SUBSTEPS } from '../core/config.js';
import { HALF_W, BALL_R } from '../../shared/field.js';
export function createSimulation({ state, broadcast, players, physics, actions, match }) {
let lastTick = Date.now();
let broadcastAccum = 0;

// Touchlines stay walled (no throw-ins). Goal lines are open: crossing them is
// judged by classifyGoalLineCrossing as a goal or out of play.
function containBallWithinTouchlines() {
  const ball = state.ballBody;
  const maxX = HALF_W - BALL_R;
  if (ball.position.x < -maxX) {
    ball.position.x = -maxX;
    if (ball.velocity.x < 0) ball.velocity.x *= -.45;
  } else if (ball.position.x > maxX) {
    ball.position.x = maxX;
    if (ball.velocity.x > 0) ball.velocity.x *= -.45;
  }
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
  } else if (state.phase === 'outOfPlay') {
    match.advanceOutOfPlay(now);
  } else if (state.phase === 'playing') {
    // Where the ball was before this tick: goal-line and goalkeeper checks use
    // the whole path, so a fast ball cannot skip past a line or a keeper.
    const ball = state.ballBody;
    const previous = state.ballPrevPosition || { x: ball.position.x, y: ball.position.y, z: ball.position.z };
    state.ballPrevPosition = previous;

    actions.updateShotCharges(dt);
    for (const c of state.clients.values()) players.applyPlayerControl(c, dt);
    physics.applyMagnus(dt);
    state.world.step(PHYSICS_STEP, dt, PHYSICS_MAX_SUBSTEPS);
    actions.updateBallControl(dt);
    for (const c of state.clients.values()) physics.resolvePlayerBallContact(c);
    containBallWithinTouchlines();

    if (ball.velocity.length() > MAX_BALL_SPEED) {
      ball.velocity.scale(MAX_BALL_SPEED / ball.velocity.length(), ball.velocity);
    }
    if (ball.position.y > MAX_BALL_HEIGHT) {
      ball.position.y = MAX_BALL_HEIGHT;
      if (ball.velocity.y > 0) ball.velocity.y = 0;
    }

    const crossing = classifyGoalLineCrossing(previous, ball.position, dt);
    if (crossing?.goal) {
      // Ball over the +Z line scores for red (blue defends +Z), and vice versa.
      match.confirmGoal(crossing.end > 0 ? 'red' : 'blue', now);
    } else if (crossing) {
      match.declareOutOfPlay(crossing, now);
    } else if (ball.position.y < -5) {
      match.resetAfterGoal(state.pendingServe === 'blue' ? 'red' : 'blue');
    }
    state.ballPrevPosition = state.ballBody ? { x: ball.position.x, y: ball.position.y, z: ball.position.z } : null;

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
