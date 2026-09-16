import { clubIdentity, defaultClubSelections } from '../../shared/clubs.js';
import { validateClubSelections } from '../../shared/kitClash.js';
import { matchSnapshot } from './snapshot.js';
import { SERVER } from '../../src/network/protocol.js';
import { GOAL_PAUSE_SECONDS, KICKOFF_PAUSE_SECONDS, WIN_SCORE, MATCH_END_PAUSE_SECONDS, MATCH_DURATION_SECONDS } from '../core/config.js';
import { HALF_L, BALL_R } from '../../shared/field.js';
export function createMatchManager({ state, broadcast, broadcastLobby, buildWorld, placeAllPlayers }) {
function clearGoalSequence() {
  state.goalEvent = null;
  state.kickoffEndsAt = 0;
  state.lastTouches = { blue: null, red: null };
}
function startMatch() {
  if (validateClubSelections(state.teams)) {
    state.phase = 'lobby';
    for (const c of state.clients.values()) c.ready = false;
    broadcast({ type: SERVER.COUNTDOWN_CANCELLED }); broadcastLobby(); return;
  }
  clearGoalSequence();
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
    name: `AI Kaleci (${clubIdentity(state.teams[team]).initials})`,
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
  broadcast({ type: SERVER.MATCH_START, startedAt: state.matchStartedAt, endsAt: state.matchEndsAt, teams: state.teams });
}

// Called only after simulation has validated the ball against the goal opening.
function confirmGoal(teamId, now = Date.now()) {
  const identity = clubIdentity(state.teams[teamId]);
  if (state.phase !== 'playing' || !state.ballBody || !identity) return false;
  state.score[teamId]++;
  state.pendingServe = teamId === 'blue' ? 'red' : 'blue';
  const scorer = state.lastTouches[teamId];
  state.goalEvent = {
    id: ++state.goalSequence, teamId, teamName: identity.name, teamInitials: identity.initials, teamColor: identity.color, teams: state.teams,
    teamLogo: identity.logo, scorerId: scorer?.id ?? null, scorerName: scorer?.name ?? null,
    score: { ...state.score }, startedAt: now, endsAt: now + GOAL_PAUSE_SECONDS * 1000,
    position: { x: state.ballBody.position.x, z: state.ballBody.position.z },
  };
  state.phase = 'goalCelebration';
  state.ballBody.velocity.set(0, 0, 0);
  state.ballBody.angularVelocity.set(0, 0, 0);
  state.ballOwnerId = null;
  for (const c of state.clients.values()) {
    c.input = { x: 0, z: 0, sprint: false };
    c.vel = { x: 0, z: 0 };
    c.slideRemaining = c.recoveryRemaining = c.standingActive = 0;
    c.slideDirection = c.lastAction = null;
  }
  broadcast({ type: SERVER.GOAL, ...matchSnapshot(state, now) });
  broadcastLobby();
  return true;
}

function resetAfterGoal(scorerTeam, now = Date.now()) {
  state.pendingServe = scorerTeam === 'blue' ? 'red' : 'blue';
  const ball = state.ballBody;
  ball.position.set(0, BALL_R, 0);
  ball.previousPosition.copy(ball.position);
  ball.interpolatedPosition.copy(ball.position);
  ball.velocity.set(0, 0, 0);
  ball.angularVelocity.set(0, 0, 0);
  ball.force.set(0, 0, 0);
  ball.torque.set(0, 0, 0);
  ball.quaternion.set(0, 0, 0, 1);
  ball.aabbNeedsUpdate = true;
  state.ballOwnerId = null;
  state.looseBallUntil = 0;
  state.lastTouches = { blue: null, red: null };
  placeAllPlayers();
  assignKickoffTaker();
  state.phase = 'kickoff';
  state.kickoffEndsAt = now + KICKOFF_PAUSE_SECONDS * 1000;
  broadcast({ type: SERVER.KICKOFF_RESET, ...matchSnapshot(state, now) });
  broadcastLobby();
}

function assignKickoffTaker() {
  // Nearest human on the conceding team takes kickoff. AI is a solo-play fallback.
  const takers = [...state.clients.values()].filter((c) => c.inMatch && c.team === state.pendingServe);
  takers.sort((a, b) => Number(!!a.isAI) - Number(!!b.isAI)
    || Math.hypot(a.pos.x, a.pos.z) - Math.hypot(b.pos.x, b.pos.z) || a.id.localeCompare(b.id));
  const taker = takers[0];
  if (taker) {
    taker.pos = { x: 0, z: taker.team === 'blue' ? .86 : -.86 };
    state.ballOwnerId = taker.id;
  }
}

function advanceGoalSequence(now) {
  if (state.phase === 'goalCelebration' && now >= state.goalEvent.endsAt) {
    // A winning/final-whistle goal still gets the full presentation.
    if (state.score.blue >= WIN_SCORE || state.score.red >= WIN_SCORE || now >= state.matchEndsAt) endMatch();
    else resetAfterGoal(state.goalEvent.teamId, now);
  } else if (state.phase === 'kickoff' && now >= state.kickoffEndsAt) {
    if (!state.clients.get(state.ballOwnerId)?.inMatch) assignKickoffTaker();
    state.phase = 'playing';
    broadcast({ type: SERVER.STATE, ...matchSnapshot(state, now) });
    broadcastLobby();
  }
}

function endMatch() {
  clearGoalSequence();
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
  clearGoalSequence();
  state.teams = defaultClubSelections();
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
  state.teams = defaultClubSelections();
  state.phase = 'lobby';
  state.score = { blue: 0, red: 0 };
  // ready is per-match — everyone re-confirms before the next one starts
  for (const c of state.clients.values()) c.ready = false;
  broadcastLobby();
}

return { startMatch, confirmGoal, advanceGoalSequence, resetAfterGoal, endMatch, abortMatchToLobby, backToLobby };
}
