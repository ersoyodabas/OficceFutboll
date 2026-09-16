import { SERVER } from '../../src/network/protocol.js';
import { GOAL_PAUSE_SECONDS, MATCH_END_PAUSE_SECONDS, MATCH_DURATION_SECONDS } from '../core/config.js';
import { HALF_L, BALL_R } from '../../shared/field.js';
export function createMatchManager({ state, broadcast, broadcastLobby, buildWorld, placeAllPlayers }) {
function startMatch() {
  const built = buildWorld();
  state.world = built.world;
  state.ballBody = built.ball;
  state.ballOwnerId = null;
  state.looseBallUntil = 0;
  state.score = { blue: 0, red: 0 };

  for (const c of state.clients.values()) {
    c.inMatch = c.team === 'blue' || c.team === 'red';
    c.pos = { x: 0, z: 0 };
    c.vel = { x: 0, z: 0 };
    c.input = { x: 0, z: 0, sprint: false };
    c.facing = { x: 0, z: c.team === 'blue' ? -1 : 1 };
    c.cooldowns = { A: 0, S: 0, D: 0 };
    c.slideRemaining = 0;
    c.slideDirection = null;
    c.recoveryRemaining = 0;
    c.standingActive = 0;
    c.lastAction = null;
  }
  placeAllPlayers();

  // Create AI goalkeepers for both ends
  const createAIKeeper = (team) => ({
    id: 'ai_keeper_' + team,
    name: team === 'blue' ? 'AI Kaleci (Mavi)' : 'AI Kaleci (Kırmızı)',
    team,
    position: 'KL',
    isAI: true,
    inMatch: true,
    ws: null,
    pos: { x: 0, z: team === 'blue' ? HALF_L : -HALF_L },
    vel: { x: 0, z: 0 },
    input: { x: 0, z: 0, sprint: false },
    facing: { x: 0, z: team === 'blue' ? -1 : 1 },
    cooldowns: { A: 0, S: 0, D: 0 },
    slideRemaining: 0,
    slideDirection: null,
    recoveryRemaining: 0,
    standingActive: 0,
    lastAction: null,
    keeperPossessionStartedAt: 0,
  });
  for (const team of ['blue', 'red']) {
    if (!Array.from(state.clients.values()).some((c) => c.inMatch && c.team === team && c.slot === 0)) {
      state.clients.set('ai_keeper_' + team, createAIKeeper(team));
    }
  }

  state.phase = 'playing';
  state.matchActive = true;
  state.matchStartedAt = Date.now();
  state.matchEndsAt = state.matchStartedAt + MATCH_DURATION_SECONDS * 1000;
  broadcastLobby();
  // Dedicated, one-shot message carrying authoritative timestamps so every
  // client's match clock is driven by the same server time rather than each
  // client independently starting its own local timer whenever its first
  // 'state' packet happens to arrive (which varies with network jitter).
  broadcast({ type: SERVER.MATCH_START, startedAt: state.matchStartedAt, endsAt: state.matchEndsAt });
}

function resetAfterGoal(scorerTeam) {
  state.pendingServe = scorerTeam === 'blue' ? 'red' : 'blue';
  state.ballBody.position.set(0, BALL_R, 0);
  state.ballBody.velocity.set(0, 0, 0);
  state.ballBody.angularVelocity.set(0, 0, 0);
  state.ballOwnerId = null;
  state.looseBallUntil = Date.now() + 350;
  placeAllPlayers();
  state.goalPauseRemaining = GOAL_PAUSE_SECONDS;
}

function endMatch() {
  state.phase = 'ended';
  state.matchActive = false;
  state.endPauseRemaining = MATCH_END_PAUSE_SECONDS;
  broadcast({ type: SERVER.MATCH_END, score: state.score, winner: state.score.blue > state.score.red ? 'blue' : 'red' });
  for (const c of state.clients.values()) c.inMatch = false;
  // Remove AI keepers
  state.clients.delete('ai_keeper_blue');
  state.clients.delete('ai_keeper_red');
  state.world = null;
  state.ballBody = null;
  state.ballOwnerId = null;
}

function abortMatchToLobby() {
  state.matchActive = false;
  state.world = null;
  state.ballBody = null;
  state.ballOwnerId = null;
  state.clients.delete('ai_keeper_blue');
  state.clients.delete('ai_keeper_red');
  state.score = { blue: 0, red: 0 };
  if (!state.clients.has(state.hostId)) state.hostId = state.clients.keys().next().value || null;
  for (const c of state.clients.values()) { c.inMatch = false; c.ready = false; }
  state.phase = 'lobby';
  broadcastLobby();
}

function backToLobby() {
  state.phase = 'lobby';
  state.score = { blue: 0, red: 0 };
  // ready is per-match — everyone re-confirms before the next one starts
  for (const c of state.clients.values()) c.ready = false;
  broadcastLobby();
}

return { startMatch, resetAfterGoal, endMatch, abortMatchToLobby, backToLobby };
}
