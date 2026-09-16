import { SERVER } from '../../src/network/protocol.js';
import { TICK_HZ, BROADCAST_HZ, WIN_SCORE, MAX_BALL_SPEED, MAX_BALL_HEIGHT } from '../core/config.js';
import { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, BALL_R } from '../../shared/field.js';
export function createSimulation({ state, broadcast, broadcastLobby, players, physics, actions, match }) {
let lastTick = Date.now();
let broadcastAccum = 0;

function tick() {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;

  if (state.phase === 'countdown') {
    state.countdownRemaining -= dt;
    if (state.countdownRemaining <= 0) match.startMatch();
  } else if (state.phase === 'playing') {
    if (state.goalPauseRemaining > 0) {
      state.goalPauseRemaining -= dt;
    } else {
      for (const c of state.clients.values()) players.applyPlayerControl(c, dt);
      state.world.step(1 / TICK_HZ, dt, 5);
      actions.updateBallControl(dt);
      for (const c of state.clients.values()) physics.resolvePlayerBallContact(c);

      if (state.ballBody.position.x < -HALF_W + BALL_R) state.ballBody.position.x = -HALF_W + BALL_R;
      if (state.ballBody.position.x > HALF_W - BALL_R) state.ballBody.position.x = HALF_W - BALL_R;

      if (state.ballBody.velocity.length() > MAX_BALL_SPEED) {
        state.ballBody.velocity.scale(MAX_BALL_SPEED / state.ballBody.velocity.length(), state.ballBody.velocity);
      }
      if (state.ballBody.position.y > MAX_BALL_HEIGHT) {
        state.ballBody.position.y = MAX_BALL_HEIGHT;
        if (state.ballBody.velocity.y > 0) state.ballBody.velocity.y = 0;
      }

      const ballUnderCrossbar = state.ballBody.position.y <= GOAL_HEIGHT - BALL_R;
      if (state.ballBody.position.z > HALF_L - BALL_R && Math.abs(state.ballBody.position.x) < GOAL_HALF_W - BALL_R * 0.5 && ballUnderCrossbar) {
        state.score.red++;
        broadcastLobby();
        match.resetAfterGoal('red');
      } else if (state.ballBody.position.z < -HALF_L + BALL_R && Math.abs(state.ballBody.position.x) < GOAL_HALF_W - BALL_R * 0.5 && ballUnderCrossbar) {
        state.score.blue++;
        broadcastLobby();
        match.resetAfterGoal('blue');
      } else if (Math.abs(state.ballBody.position.z) > HALF_L + 2 || state.ballBody.position.y < -5) {
        match.resetAfterGoal(state.pendingServe === 'blue' ? 'red' : 'blue');
      }

      if (state.score.blue >= WIN_SCORE || state.score.red >= WIN_SCORE || now >= state.matchEndsAt) match.endMatch();
    }
  } else if (state.phase === 'ended') {
    state.endPauseRemaining -= dt;
    if (state.endPauseRemaining <= 0) match.backToLobby();
  }

  broadcastAccum += dt;
  if (broadcastAccum >= 1 / BROADCAST_HZ) {
    broadcastAccum = 0;
    if (state.phase === 'playing' && state.world) {
      broadcast({
        type: SERVER.STATE,
        score: state.score,
        // included on every tick (not just the one-shot 'matchStart') so a
        // client that connects mid-match — reconnect, or a late joiner who
        // ends up spectating — still gets a correctly-synced clock from its
        // very first packet rather than only clients present at kickoff.
        startedAt: state.matchStartedAt,
        endsAt: state.matchEndsAt,
        ball: {
          x: state.ballBody.position.x, y: state.ballBody.position.y, z: state.ballBody.position.z,
          vx: state.ballBody.velocity.x, vy: state.ballBody.velocity.y, vz: state.ballBody.velocity.z,
        },
        players: Array.from(state.clients.values())
          .filter((c) => c.inMatch)
          .map((c) => ({
            id: c.id,
            team: c.team,
            position: c.position,
            name: c.name,
            x: c.pos.x,
            z: c.pos.z,
            vx: c.vel.x,
            vz: c.vel.z,
            facingX: c.facing.x,
            facingZ: c.facing.z,
            hasBall: state.ballOwnerId === c.id,
            sliding: c.slideRemaining > 0,
            action: c.lastAction && now - c.lastAction.at < 300 ? c.lastAction.type : null,
          })),
      });
    }
  }
}

return { tick };
}
