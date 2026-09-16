import { clubIdentity, defaultClubSelections } from '../../shared/clubs.js';
import { validateClubSelections } from '../../shared/kitClash.js';
import { matchSnapshot } from './snapshot.js';
import { SERVER } from '../../src/network/protocol.js';
import { GOAL_PAUSE_SECONDS, KICKOFF_PAUSE_SECONDS, WIN_SCORE, MATCH_END_PAUSE_SECONDS, MATCH_DURATION_SECONDS,
  OUT_OF_PLAY_SECONDS, GOAL_KICK_DISTANCE, GOAL_KICK_MAX_SIDE, GOAL_KICK_KEEPER_OFFSET, RESTART_EDGE_MARGIN, RESTART_OPPONENT_DISTANCE,
  PITCH_MIN_X, PITCH_MAX_X, PITCH_MIN_Z, PITCH_MAX_Z } from '../core/config.js';
import { HALF_L, BALL_R, FIELD } from '../../shared/field.js';
import { GOAL_TAUNTS } from '../../shared/goalTaunts.js';

// Ball distance in front of a restart taker (the normal dribbling offset).
const RESTART_BALL_OFFSET = 0.86;
export function createMatchManager({ state, broadcast, broadcastLobby, buildWorld, placeAllPlayers }) {
function clearGoalSequence() {
  state.goalEvent = null;
  state.outEvent = null;
  state.kickoffEndsAt = 0;
  state.ballPrevPosition = null;
  state.lastTouches = { blue: null, red: null };
}

// Freezes every player and the ball at a stoppage (goal or out of play).
function stopPlay() {
  state.ballBody.velocity.set(0, 0, 0);
  state.ballBody.angularVelocity.set(0, 0, 0);
  state.ballOwnerId = null;
  for (const c of state.clients.values()) {
    c.input = { x: 0, z: 0, sprint: false };
    c.vel = { x: 0, z: 0 };
    c.slideRemaining = c.recoveryRemaining = c.standingActive = 0;
    c.slideDirection = c.lastAction = c.shotCharge = c.keeperDive = null;
  }
}

// Puts the ball exactly at a restart spot with no leftover motion or spin.
function placeBall(x, z) {
  const ball = state.ballBody;
  ball.position.set(x, BALL_R, z);
  ball.previousPosition.copy(ball.position);
  ball.interpolatedPosition.copy(ball.position);
  ball.velocity.set(0, 0, 0);
  ball.angularVelocity.set(0, 0, 0);
  ball.force.set(0, 0, 0);
  ball.torque.set(0, 0, 0);
  ball.quaternion.set(0, 0, 0, 1);
  ball.aabbNeedsUpdate = true;
  state.ballPrevPosition = null;
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
    tauntIndex: Math.floor(Math.random() * GOAL_TAUNTS.length),
    score: { ...state.score }, startedAt: now, endsAt: now + GOAL_PAUSE_SECONDS * 1000,
    position: { x: state.ballBody.position.x, z: state.ballBody.position.z },
  };
  state.phase = 'goalCelebration';
  stopPlay();
  broadcast({ type: SERVER.GOAL, ...matchSnapshot(state, now) });
  broadcastLobby();
  return true;
}

function resetAfterGoal(scorerTeam, now = Date.now()) {
  state.pendingServe = scorerTeam === 'blue' ? 'red' : 'blue';
  placeBall(0, 0);
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

// ---------- Out of play → authoritative restart ----------
// Every exit is judged here once (play is frozen in 'outOfPlay', so no second
// exit can be declared until the restart). The team that did NOT touch the
// ball last restarts:
//   touchline                  → TAÇ: throw-in by the nearest opposing outfield player
//   goal line, attackers last  → AUT: goal kick by the defending goalkeeper
//   goal line, defenders last  → KORNER: corner by the nearest attacking outfield player
// If the receiving team has no outfield player, its goalkeeper restarts instead.
const OTHER_TEAM = { blue: 'red', red: 'blue' };
const goalSignOf = (team) => (team === 'blue' ? 1 : -1); // blue defends +Z

function lastTouchTeam() {
  const { blue, red } = state.lastTouches;
  if (blue && red) return blue.at >= red.at ? 'blue' : 'red';
  return blue ? 'blue' : red ? 'red' : null;
}
function goalkeeperOf(team) {
  const inTeam = [...state.clients.values()].filter((c) => c.inMatch && c.team === team);
  return inTeam.find((c) => c.isAI && c.position === 'KL') || inTeam.find((c) => c.position === 'KL') || null;
}
function nearestOutfieldPlayer(team, position) {
  let best = null, bestDistance = Infinity;
  for (const c of state.clients.values()) {
    if (!c.inMatch || c.team !== team || c.position === 'KL') continue;
    const distance = Math.hypot(c.pos.x - position.x, c.pos.z - position.z);
    if (distance < bestDistance || (distance === bestDistance && c.id < best.id)) { best = c; bestDistance = distance; }
  }
  return best;
}
// Who takes the restart; throw-ins and corners fall back to the goalkeeper.
function chooseRestart(restart, team, position) {
  if (restart === 'goalKick') return { restart, taker: goalkeeperOf(team) };
  const player = nearestOutfieldPlayer(team, position);
  return player ? { restart, taker: player } : { restart: 'keeperRestart', taker: goalkeeperOf(team) };
}

// crossing: from goalLine.classifyBoundaryCrossing (not a goal).
function declareOutOfPlay(crossing, now = Date.now()) {
  if (state.phase !== 'playing' || !state.ballBody) return false;
  const toucher = lastTouchTeam();
  let restart, receivingTeam, notice, position, defendingTeam = null;
  if (crossing.boundary === 'touchline') {
    // With no recorded touch, the team defending that half gets the ball.
    receivingTeam = toucher ? OTHER_TEAM[toucher] : (crossing.z > 0 ? 'blue' : 'red');
    restart = 'throwIn'; notice = 'TAÇ';
    position = { x: crossing.x, y: crossing.y, z: crossing.z };
  } else {
    defendingTeam = crossing.end > 0 ? 'blue' : 'red';
    position = { x: crossing.x, y: crossing.y, z: crossing.end * HALF_L };
    if (toucher === defendingTeam) { restart = 'corner'; notice = 'KORNER'; receivingTeam = OTHER_TEAM[defendingTeam]; }
    else { restart = 'goalKick'; notice = 'AUT'; receivingTeam = defendingTeam; }
  }
  const chosen = chooseRestart(restart, receivingTeam, position);
  state.outEvent = {
    id: ++state.outSequence, boundary: crossing.boundary, notice, restart: chosen.restart,
    lastTouchTeam: toucher, receivingTeam, defendingTeam, restartPlayerId: chosen.taker?.id ?? null,
    startedAt: now, endsAt: now + OUT_OF_PLAY_SECONDS * 1000, position,
  };
  state.phase = 'outOfPlay';
  stopPlay();
  broadcast({ type: SERVER.OUT_OF_PLAY, ...matchSnapshot(state, now) });
  return true;
}

function advanceOutOfPlay(now) {
  if (state.phase !== 'outOfPlay' || now < state.outEvent.endsAt) return;
  if (now >= state.matchEndsAt) endMatch();
  else restartAfterOut(now);
}

// Moves opponents of the restarting team at least RESTART_OPPONENT_DISTANCE from
// the ball. Straight away from the ball first; near a touchline or corner that
// can be off the pitch, so along the line or into the pitch instead.
function clearOpponents(team, ballX, ballZ) {
  const clampX = (x) => Math.max(PITCH_MIN_X, Math.min(PITCH_MAX_X, x));
  const clampZ = (z) => Math.max(PITCH_MIN_Z, Math.min(PITCH_MAX_Z, z));
  for (const c of state.clients.values()) {
    if (!c.inMatch || c.team === team) continue;
    const dx = c.pos.x - ballX, dz = c.pos.z - ballZ, distance = Math.hypot(dx, dz);
    if (distance >= RESTART_OPPONENT_DISTANCE) continue;
    const directions = [
      distance > 1e-3 ? { x: dx / distance, z: dz / distance } : { x: -(Math.sign(ballX) || 1), z: 0 },
      { x: 0, z: Math.sign(dz) || -(Math.sign(ballZ) || 1) },
      { x: -(Math.sign(ballX) || 1), z: 0 },
      { x: 0, z: -(Math.sign(dz) || -(Math.sign(ballZ) || 1)) },
    ];
    for (const direction of directions) {
      const x = clampX(ballX + direction.x * RESTART_OPPONENT_DISTANCE), z = clampZ(ballZ + direction.z * RESTART_OPPONENT_DISTANCE);
      if (Math.hypot(x - ballX, z - ballZ) >= RESTART_OPPONENT_DISTANCE - 1e-9) { c.pos = { x, z }; break; }
    }
  }
}

// Places the taker, faces them into play and gives them the ball at their feet.
function giveRestartBall(taker, pos, facing, now, ballOffset = RESTART_BALL_OFFSET) {
  taker.pos = { ...pos };
  taker.facing = facing;
  taker.vel = { x: 0, z: 0 };
  taker.turnRate = 0;
  placeBall(pos.x + facing.x * ballOffset, pos.z + facing.z * ballOffset);
  if (taker.isAI) taker.keeperPossessionStartedAt = now;
  state.ballOwnerId = taker.id;
}

function restartAfterOut(now) {
  const event = state.outEvent;
  let taker = state.clients.get(event.restartPlayerId);
  if (!taker?.inMatch || taker.team !== event.receivingTeam) {
    // The chosen player left during the pause: choose again.
    const initial = event.boundary === 'touchline' ? 'throwIn' : event.restart === 'goalKick' ? 'goalKick' : 'corner';
    const chosen = chooseRestart(initial, event.receivingTeam, event.position);
    event.restart = chosen.restart; taker = chosen.taker; event.restartPlayerId = taker?.id ?? null;
  }
  const team = event.receivingTeam;
  const goalSign = goalSignOf(team);
  if (!taker) {
    placeBall(0, 0); // no one to restart (should not happen in a match)
  } else if (event.restart === 'throwIn') {
    const side = Math.sign(event.position.x) || 1;
    const z = Math.max(-(HALF_L - RESTART_EDGE_MARGIN), Math.min(HALF_L - RESTART_EDGE_MARGIN, event.position.z));
    giveRestartBall(taker, { x: side * PITCH_MAX_X, z }, { x: -side, z: 0 }, now);
  } else if (event.restart === 'corner') {
    const sideX = Math.sign(event.position.x) || 1, endZ = Math.sign(event.position.z) || 1;
    const pos = { x: sideX * PITCH_MAX_X, z: endZ * PITCH_MAX_Z };
    const toBox = { x: -pos.x, z: endZ * (HALF_L - FIELD.PENALTY_DEPTH / 2) - pos.z };
    const length = Math.hypot(toBox.x, toBox.z);
    giveRestartBall(taker, pos, { x: toBox.x / length, z: toBox.z / length }, now);
  } else {
    // Goal kick or goalkeeper restart from inside the receiving team's penalty area.
    const ballX = event.restart === 'goalKick' ? Math.max(-GOAL_KICK_MAX_SIDE, Math.min(GOAL_KICK_MAX_SIDE, event.position.x)) : 0;
    const ballZ = goalSign * (HALF_L - GOAL_KICK_DISTANCE);
    const boxEdgeZ = HALF_L - FIELD.PENALTY_DEPTH;
    for (const c of state.clients.values()) {
      if (!c.inMatch || c.team === team) continue;
      if (Math.abs(c.pos.x) < FIELD.PENALTY_HALF_W + 1 && c.pos.z * goalSign > boxEdgeZ - 1) c.pos.z = goalSign * (boxEdgeZ - 1.5);
    }
    giveRestartBall(taker, { x: ballX, z: ballZ + goalSign * GOAL_KICK_KEEPER_OFFSET }, { x: 0, z: -goalSign }, now, GOAL_KICK_KEEPER_OFFSET);
  }
  if (taker) clearOpponents(team, state.ballBody.position.x, state.ballBody.position.z);
  state.looseBallUntil = 0;
  state.phase = 'playing';
  broadcast({ type: SERVER.RESTART, ...matchSnapshot(state, now) });
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

return { startMatch, confirmGoal, advanceGoalSequence, resetAfterGoal, declareOutOfPlay, advanceOutOfPlay, endMatch, abortMatchToLobby, backToLobby };
}
