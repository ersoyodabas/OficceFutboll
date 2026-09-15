'use strict';

const http = require('http');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const nodePath = require('path');
const { WebSocketServer } = require('ws');
const CANNON = require('cannon-es');
const FIELD = require('../field.js');

// ---------------------------------------------------------------------------
// Config (must match the field geometry used by the Chrome extension client)
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

const TICK_HZ = 60;
const BROADCAST_HZ = 20;
const WIN_SCORE = 5;
const GOAL_PAUSE_SECONDS = 1.5;
const MATCH_END_PAUSE_SECONDS = 6;

// ---------------------------------------------------------------------------
// Ready-up / auto-start config
// ---------------------------------------------------------------------------
const MIN_PLAYERS_TO_START = 1; // solo practice and multiplayer use the same ready flow
const COUNTDOWN_SECONDS = 3;
const MATCH_DURATION_SECONDS = 300; // 5 minutes

const { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, BALL_R, PLAYER_R } = FIELD;

const PLAYER_SPEED = 7.3;
const SPRINT_SPEED = 10.7;
const POSSESSION_RANGE = 1.15;
const ACTION_RANGE = POSSESSION_RANGE * 1.9;
const STANDING_TACKLE_RANGE = 2.1;
const SLIDE_TACKLE_RANGE = 2.7;
const SLIDE_SPEED = 12.5;
const SLIDE_DURATION = 0.58;
const SLIDE_RECOVERY = 0.35;
const ACTION_COOLDOWNS = Object.freeze({ A: 0.42, S: 0.7, D: 0.95 });
const STANDING_TACKLE_COOLDOWN = 0.85;
const SLIDE_TACKLE_COOLDOWN = 1.8;
const MAX_BALL_SPEED = 23;
const MAX_BALL_HEIGHT = 9;

// Pitch bounds every position is clamped into, regardless of its own range.
const PITCH_MIN_X = -HALF_W + PLAYER_R;
const PITCH_MAX_X = HALF_W - PLAYER_R;
const PITCH_MIN_Z = -HALF_L + PLAYER_R;
const PITCH_MAX_Z = HALF_L - PLAYER_R;

// ---------------------------------------------------------------------------
// Positions: each has a home anchor and a roaming range, expressed in the
// "blue" team's frame (positive Z = blue's own defensive third). Red is the
// mirror image on Z; X is shared (left/right stays visually consistent for
// both teams on the shared pitch).
// ---------------------------------------------------------------------------
const POSITIONS = {
  KL: { label: 'Kaleci', x: 0, zHome: HALF_L * .86, zRange: [HALF_L * .68, HALF_L * .94], xRange: null },
  STP: { label: 'Stoper', x: 0, zHome: HALF_L * .55, zRange: [-HALF_L * .15, HALF_L * .88], xRange: null },
  SLB: { label: 'Sol Bek', x: -HALF_W * .62, zHome: HALF_L * .45, zRange: [-HALF_L * .45, HALF_L * .85], xRange: [-HALF_W, HALF_W * .2] },
  SGB: { label: 'Sağ Bek', x: HALF_W * .62, zHome: HALF_L * .45, zRange: [-HALF_L * .45, HALF_L * .85], xRange: [-HALF_W * .2, HALF_W] },
  DOS: { label: 'Def. Orta Saha', x: 0, zHome: HALF_L * .28, zRange: [-HALF_L * .55, HALF_L * .78], xRange: null },
  OOS: { label: 'Orta Saha', x: 0, zHome: 0, zRange: [-HALF_L * .82, HALF_L * .82], xRange: null },
  SLK: { label: 'Sol Kanat', x: -HALF_W * .72, zHome: -HALF_L * .18, zRange: [-HALF_L * .93, HALF_L * .35], xRange: [-HALF_W, HALF_W * .15] },
  SGK: { label: 'Sağ Kanat', x: HALF_W * .72, zHome: -HALF_L * .18, zRange: [-HALF_L * .93, HALF_L * .35], xRange: [-HALF_W * .15, HALF_W] },
  FRV: { label: 'Forvet', x: 0, zHome: -HALF_L * .52, zRange: [-HALF_L * .94, HALF_L * .38], xRange: null },
};
const DEFAULT_POSITION = 'OOS';

function positionFor(code) {
  return POSITIONS[code] ? code : DEFAULT_POSITION;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
/** @type {Map<string, object>} */
const clients = new Map();
let hostId = null;

// Match-state machine (LOBBY / COUNTDOWN / MATCH / ENDED — kept as the
// existing 'lobby' | 'countdown' | 'playing' | 'ended' strings rather than
// renamed, since they're already equivalent and renaming everywhere would
// touch a lot of proven code for no functional benefit).
let phase = 'lobby';
let countdownRemaining = 0; // internal driver for when the server calls startMatch()
let countdownStartAt = 0;   // absolute ms timestamp — for client-synchronized rendering
let matchStartedAt = 0;
let matchEndsAt = 0;
let goalPauseRemaining = 0;
let endPauseRemaining = 0;
let pendingServe = 'blue';
let score = { blue: 0, red: 0 };
let matchActive = false;

let world = null;
let ballBody = null;
let ballOwnerId = null;
let looseBallUntil = 0;

function teamCounts() {
  let blue = 0, red = 0;
  for (const c of clients.values()) {
    if (c.team === 'blue') blue++;
    else if (c.team === 'red') red++;
  }
  return { blue, red };
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of clients.values()) {
    if (c.ws && c.ws.readyState === c.ws.OPEN) c.ws.send(data);
  }
}

function rosterPayload() {
  return Array.from(clients.values()).map((c) => ({
    id: c.id, name: c.name, team: c.team, position: c.position, isHost: c.id === hostId, ready: !!c.ready,
  }));
}

function broadcastLobby() {
  broadcast({
    type: 'lobby',
    phase,
    countdown: phase === 'countdown' ? Math.ceil(countdownRemaining) : null,
    players: rosterPayload(),
    score,
    hostId,
    minPlayers: MIN_PLAYERS_TO_START,
    positions: POSITIONS,
  });
}

// ---------------------------------------------------------------------------
// Physics world — only the ball is a real cannon-es rigid body (gravity,
// ground/wall collisions). Players are simple server-tracked points; their
// interaction with the ball is resolved with bounded, hand-written vector
// math (see resolvePlayerBallContact). An earlier version also made players
// cannon-es rigid bodies so the engine would resolve player/ball contact
// automatically, but a fast body driven straight through the ball every tick
// (rather than integrated by the solver) re-penetrated it each frame and the
// contact solver kept injecting velocity — the ball climbed without bound
// even at a 90:1 mass ratio and with aligned collider heights. Keeping the
// ball as the only rigid body sidesteps that instability entirely while
// still giving genuine acceleration/impulse-based ball physics.
// ---------------------------------------------------------------------------
function buildWorld() {
  const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  w.broadphase = new CANNON.SAPBroadphase(w);
  w.allowSleep = false;

  const groundMat = new CANNON.Material('ground');
  const ballMat = new CANNON.Material('ball');
  w.addContactMaterial(new CANNON.ContactMaterial(groundMat, ballMat, { friction: 0.25, restitution: 0.45 }));

  const ground = new CANNON.Body({ mass: 0, material: groundMat });
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  w.addBody(ground);

  const wallThickness = 1;
  function addWall(hx, hy, hz, x, y, z) {
    const body = new CANNON.Body({ mass: 0, material: groundMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    body.position.set(x, y, z);
    w.addBody(body);
  }
  addWall(wallThickness / 2, 1.5, HALF_L + 1, -HALF_W - wallThickness / 2, 1.5, 0);
  addWall(wallThickness / 2, 1.5, HALF_L + 1, HALF_W + wallThickness / 2, 1.5, 0);
  const segW = (HALF_W * 2 - GOAL_HALF_W * 2) / 2;
  [-1, 1].forEach((side) => {
    const cx = side * (HALF_W - segW / 2);
    addWall(segW / 2, 1.5, wallThickness / 2, cx, 1.5, HALF_L + wallThickness / 2);
    addWall(segW / 2, 1.5, wallThickness / 2, cx, 1.5, -HALF_L - wallThickness / 2);
  });
  // Regulation-scaled crossbars prevent high balls from being counted as goals.
  addWall(GOAL_HALF_W, 0.05, 0.1, 0, GOAL_HEIGHT, HALF_L);
  addWall(GOAL_HALF_W, 0.05, 0.1, 0, GOAL_HEIGHT, -HALF_L);

  const ball = new CANNON.Body({
    mass: 0.45,
    material: ballMat,
    shape: new CANNON.Sphere(BALL_R),
    linearDamping: 0.35,
    angularDamping: 0.6,
  });
  ball.position.set(0, BALL_R, 0);
  w.addBody(ball);

  return { world: w, ball };
}

function spawnFor(c, sameSpotIndex) {
  const pos = POSITIONS[positionFor(c.position)];
  const mirror = c.team === 'blue' ? 1 : -1;
  const jitter = (sameSpotIndex - 0) * 0.6 * (sameSpotIndex % 2 === 0 ? 1 : -1);
  let x = pos.x + jitter;
  let z = pos.zHome * mirror;
  x = Math.max(PITCH_MIN_X, Math.min(PITCH_MAX_X, x));
  z = Math.max(PITCH_MIN_Z, Math.min(PITCH_MAX_Z, z));
  return { x, z };
}

function placeAllPlayers() {
  const perSpot = new Map();
  for (const c of clients.values()) {
    if (!c.inMatch) continue;
    const key = c.team + ':' + c.position;
    const idx = perSpot.get(key) || 0;
    perSpot.set(key, idx + 1);
    const spot = spawnFor(c, idx);
    c.pos.x = spot.x;
    c.pos.z = spot.z;
    c.vel.x = 0;
    c.vel.z = 0;
    c.slideRemaining = 0;
    c.recoveryRemaining = 0;
  }
}

function startMatch() {
  const built = buildWorld();
  world = built.world;
  ballBody = built.ball;
  ballOwnerId = null;
  looseBallUntil = 0;
  score = { blue: 0, red: 0 };

  for (const c of clients.values()) {
    c.inMatch = c.team === 'blue' || c.team === 'red';
    c.pos = { x: 0, z: 0 };
    c.vel = { x: 0, z: 0 };
    c.input = { x: 0, z: 0, sprint: false };
    c.facing = { x: 0, z: c.team === 'blue' ? -1 : 1 };
    c.cooldowns = { A: 0, S: 0, D: 0 };
    c.slideRemaining = 0;
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
    recoveryRemaining: 0,
    standingActive: 0,
    lastAction: null,
  });
  clients.set('ai_keeper_blue', createAIKeeper('blue'));
  clients.set('ai_keeper_red', createAIKeeper('red'));

  phase = 'playing';
  matchActive = true;
  matchStartedAt = Date.now();
  matchEndsAt = matchStartedAt + MATCH_DURATION_SECONDS * 1000;
  broadcastLobby();
  // Dedicated, one-shot message carrying authoritative timestamps so every
  // client's match clock is driven by the same server time rather than each
  // client independently starting its own local timer whenever its first
  // 'state' packet happens to arrive (which varies with network jitter).
  broadcast({ type: 'matchStart', startedAt: matchStartedAt, endsAt: matchEndsAt });
}

function resetAfterGoal(scorerTeam) {
  pendingServe = scorerTeam === 'blue' ? 'red' : 'blue';
  ballBody.position.set(0, BALL_R, pendingServe === 'blue' ? 3 : -3);
  ballBody.velocity.set(0, 0, 0);
  ballBody.angularVelocity.set(0, 0, 0);
  ballOwnerId = null;
  looseBallUntil = Date.now() + 350;
  placeAllPlayers();
  goalPauseRemaining = GOAL_PAUSE_SECONDS;
}

function endMatch() {
  phase = 'ended';
  matchActive = false;
  endPauseRemaining = MATCH_END_PAUSE_SECONDS;
  broadcast({ type: 'match_end', score, winner: score.blue > score.red ? 'blue' : 'red' });
  for (const c of clients.values()) c.inMatch = false;
  // Remove AI keepers
  clients.delete('ai_keeper_blue');
  clients.delete('ai_keeper_red');
  world = null;
  ballBody = null;
  ballOwnerId = null;
}

function abortMatchToLobby() {
  matchActive = false;
  world = null;
  ballBody = null;
  ballOwnerId = null;
  for (const c of clients.values()) { c.inMatch = false; c.ready = false; }
  phase = 'lobby';
  broadcastLobby();
}

function backToLobby() {
  phase = 'lobby';
  score = { blue: 0, red: 0 };
  // ready is per-match — everyone re-confirms before the next one starts
  for (const c of clients.values()) c.ready = false;
  broadcastLobby();
}

// ---------------------------------------------------------------------------
// Ready-up / auto-start
// ---------------------------------------------------------------------------
function areAllPlayersReady() {
  if (clients.size === 0) return false;
  for (const c of clients.values()) if (!c.ready) return false;
  return true;
}

function canStartCountdown() {
  return phase === 'lobby' && clients.size >= MIN_PLAYERS_TO_START && areAllPlayersReady();
}

function startCountdown() {
  phase = 'countdown';
  countdownStartAt = Date.now();
  countdownRemaining = COUNTDOWN_SECONDS;
  broadcastLobby();
  broadcast({ type: 'countdownStart', startAt: countdownStartAt, duration: COUNTDOWN_SECONDS * 1000 });
}

function cancelCountdown() {
  if (phase !== 'countdown') return;
  phase = 'lobby';
  // require everyone to re-confirm readiness rather than silently resuming
  // with potentially-stale ready flags (see README "Davet Linki" notes on
  // the join-during-countdown decision)
  for (const c of clients.values()) c.ready = false;
  broadcast({ type: 'countdownCancelled' });
  broadcastLobby();
}

function checkAutoStart() {
  if (canStartCountdown()) startCountdown();
}

// ---------------------------------------------------------------------------
// Player movement and possession-dependent actions. The ball remains the
// only dynamic cannon-es body; all action outcomes are decided here.
// ---------------------------------------------------------------------------
function allowedRange(c) {
  // Players can roam freely across the entire pitch (inside boundaries)
  // AI keepers have restricted zone (handled in applyPlayerControl)
  return {
    xMin: PITCH_MIN_X,
    xMax: PITCH_MAX_X,
    zMin: PITCH_MIN_Z,
    zMax: PITCH_MAX_Z,
  };
}

function applyPlayerControl(c, dt) {
  if (!c.inMatch) return;

  // AI goalkeeper behavior
  if (c.isAI && c.position === 'KL') {
    const keeperZ = c.team === 'blue' ? HALF_L : -HALF_L;
    const targetX = ballBody.position.x;
    const targetZ = Math.max(keeperZ - 4, Math.min(keeperZ + 3, ballBody.position.z));
    
    const dx = targetX - c.pos.x;
    const dz = targetZ - c.pos.z;
    const dist = Math.hypot(dx, dz);
    
    if (dist > 0.5) {
      const speed = dist > 8 ? PLAYER_SPEED : PLAYER_SPEED * 0.7;
      c.vel.x = (dx / dist) * speed;
      c.vel.z = (dz / dist) * speed;
      c.facing = { x: dx / dist, z: dz / dist };
    } else {
      c.vel.x = 0;
      c.vel.z = 0;
    }

    // Keeper area bounds (6-yard box)
    const keeperXMin = Math.max(PITCH_MIN_X, -GOAL_HALF_W * 2.5);
    const keeperXMax = Math.min(PITCH_MAX_X, GOAL_HALF_W * 2.5);
    const keeperZMin = keeperZ - 5;
    const keeperZMax = keeperZ + 3;
    
    c.pos.x = Math.max(keeperXMin, Math.min(keeperXMax, c.pos.x + c.vel.x * dt));
    c.pos.z = Math.max(keeperZMin, Math.min(keeperZMax, c.pos.z + c.vel.z * dt));
    
    c.standingActive = Math.max(0, c.standingActive - dt);
    return;
  }

  const inp = c.input || { x: 0, z: 0, sprint: false };
  const len = Math.hypot(inp.x, inp.z) || 1;
  const nx = inp.x / len, nz = inp.z / len;
  if (c.slideRemaining > 0) {
    c.slideRemaining = Math.max(0, c.slideRemaining - dt);
    c.vel.x = c.facing.x * SLIDE_SPEED;
    c.vel.z = c.facing.z * SLIDE_SPEED;
    if (c.slideRemaining === 0) c.recoveryRemaining = SLIDE_RECOVERY;
  } else {
    c.recoveryRemaining = Math.max(0, c.recoveryRemaining - dt);
    const speed = c.recoveryRemaining > 0 ? PLAYER_SPEED * .35 : (inp.sprint ? SPRINT_SPEED : PLAYER_SPEED);
    c.vel.x = nx * speed;
    c.vel.z = nz * speed;
    if (inp.x || inp.z) c.facing = { x: nx, z: nz };
  }

  const range = allowedRange(c);
  c.pos.x = Math.max(range.xMin, Math.min(range.xMax, c.pos.x + c.vel.x * dt));
  c.pos.z = Math.max(range.zMin, Math.min(range.zMax, c.pos.z + c.vel.z * dt));

  c.standingActive = Math.max(0, c.standingActive - dt);
}

function ballDistance(c) {
  return Math.hypot(ballBody.position.x - c.pos.x, ballBody.position.z - c.pos.z);
}

function hasBall(c) {
  return ballOwnerId === c.id && ballDistance(c) < POSSESSION_RANGE * 1.9 && ballBody.position.y < 1.15;
}

function releaseBall(duration = 280) {
  ballOwnerId = null;
  looseBallUntil = Date.now() + duration;
}

function applyBallImpulse(x, y, z) {
  ballBody.velocity.scale(.35, ballBody.velocity);
  ballBody.applyImpulse(new CANNON.Vec3(x * ballBody.mass, y * ballBody.mass, z * ballBody.mass));
}

function attemptTackle(c, sliding) {
  if (!ballOwnerId || ballOwnerId === c.id) return false;
  const owner = clients.get(ballOwnerId);
  if (!owner || owner.team === c.team || ballBody.position.y > 1.1) return false;
  const dx = ballBody.position.x - c.pos.x;
  const dz = ballBody.position.z - c.pos.z;
  const dist = Math.hypot(dx, dz);
  const angle = (dx * c.facing.x + dz * c.facing.z) / (dist || 1);
  const range = sliding ? SLIDE_TACKLE_RANGE : STANDING_TACKLE_RANGE;
  if (dist > range || angle < (sliding ? .12 : .35)) return false;
  if (Math.hypot(owner.pos.x - c.pos.x, owner.pos.z - c.pos.z) > range + .5) return false;
  releaseBall(sliding ? 500 : 300);
  applyBallImpulse(c.facing.x * (sliding ? 8 : 5), sliding ? 1.4 : .25, c.facing.z * (sliding ? 8 : 5));
  return true;
}

function performAction(c, key) {
  if (!c.inMatch || phase !== 'playing' || !ballBody || !['A', 'S', 'D'].includes(key)) return;
  const now = Date.now();
  if (now < c.cooldowns[key] || c.slideRemaining > 0 || c.recoveryRemaining > 0) return;
  const owner = hasBall(c);
  let action, success = false;
  if (owner && ballDistance(c) <= ACTION_RANGE) {
    if (key === 'A') { action = 'pass'; applyBallImpulse(c.facing.x * 16, .35, c.facing.z * 16); }
    if (key === 'S') { action = 'shot'; applyBallImpulse(c.facing.x * 22, 2.8, c.facing.z * 22); }
    if (key === 'D') { action = 'cross'; applyBallImpulse(c.facing.x * 16, 7.2, c.facing.z * 16); }
    releaseBall(450);
    success = true;
    c.cooldowns[key] = now + ACTION_COOLDOWNS[key] * 1000;
  } else if (key === 'A') {
    action = 'no_pass';
    c.cooldowns[key] = now + ACTION_COOLDOWNS.A * 1000;
  } else if (key === 'S') {
    action = 'standing_tackle';
    c.standingActive = .22;
    success = attemptTackle(c, false);
    c.cooldowns.S = now + STANDING_TACKLE_COOLDOWN * 1000;
  } else {
    action = 'slide_tackle';
    c.slideRemaining = SLIDE_DURATION;
    success = attemptTackle(c, true);
    c.cooldowns.D = now + SLIDE_TACKLE_COOLDOWN * 1000;
  }
  c.lastAction = { type: action, at: now };
  broadcast({ type: 'actionResult', id: c.id, action, success, hasBall: owner });
}

function updateBallControl(dt) {
  if (ballOwnerId) {
    const owner = clients.get(ballOwnerId);
    if (!owner || !owner.inMatch || !hasBall(owner)) {
      releaseBall(180);
    } else {
      const sprinting = !!owner.input.sprint;
      const offset = sprinting ? 1.28 : .86;
      const response = sprinting ? 6.5 : 9;
      const blend = 1 - Math.exp(-dt * (sprinting ? 9 : 13));
      const targetX = owner.pos.x + owner.facing.x * offset;
      const targetZ = owner.pos.z + owner.facing.z * offset;
      const desiredVX = owner.vel.x + (targetX - ballBody.position.x) * response;
      const desiredVZ = owner.vel.z + (targetZ - ballBody.position.z) * response;
      ballBody.velocity.x += (desiredVX - ballBody.velocity.x) * blend;
      ballBody.velocity.z += (desiredVZ - ballBody.velocity.z) * blend;
    }
  }
  if (!ballOwnerId && Date.now() >= looseBallUntil && ballBody.position.y < .75) {
    let nearest = null;
    let best = POSSESSION_RANGE;
    for (const c of clients.values()) {
      if (!c.inMatch || c.slideRemaining > 0) continue;
      const dist = ballDistance(c);
      if (dist < best) { nearest = c; best = dist; }
    }
    if (nearest) ballOwnerId = nearest.id;
  }
  for (const c of clients.values()) {
    if (c.standingActive > 0 && attemptTackle(c, false)) {
      c.standingActive = 0;
      broadcast({ type: 'actionResult', id: c.id, action: 'standing_tackle', success: true, hasBall: false });
    }
    if (c.slideRemaining > 0 && attemptTackle(c, true)) {
      broadcast({ type: 'actionResult', id: c.id, action: 'slide_tackle', success: true, hasBall: false });
    }
    // AI goalkeeper automatic defense
    if (c.isAI && c.position === 'KL' && ballOwnerId && ballOwnerId !== c.id) {
      const dist = ballDistance(c);
      if (dist < SLIDE_TACKLE_RANGE && c.slideRemaining === 0 && Date.now() >= c.cooldowns.D) {
        c.slideRemaining = SLIDE_DURATION;
        if (attemptTackle(c, true)) {
          c.cooldowns.D = Date.now() + SLIDE_TACKLE_COOLDOWN * 1000;
          broadcast({ type: 'actionResult', id: c.id, action: 'slide_tackle', success: true, hasBall: false });
        }
      }
    }
  }
}

// Bounded, hand-resolved contact between a player (a circle in the XZ plane)
// and the ball (the one real rigid body). This is the same proven approach
// the original single-player prototype used, now driving the cannon-es ball
// body directly — see the note above buildWorld() for why this replaced
// letting the physics engine's solver own player/ball contact.
function resolvePlayerBallContact(c) {
  if (!c.inMatch || ballOwnerId === c.id) return;
  const dx = ballBody.position.x - c.pos.x;
  const dz = ballBody.position.z - c.pos.z;
  const dist = Math.hypot(dx, dz);
  const minDist = PLAYER_R + BALL_R;
  if (dist >= minDist || dist < 1e-4) return;

  const nx = dx / dist, nz = dz / dist;
  const overlap = minDist - dist;
  ballBody.position.x += nx * overlap;
  ballBody.position.z += nz * overlap;

  const relVX = ballBody.velocity.x - c.vel.x;
  const relVZ = ballBody.velocity.z - c.vel.z;
  const relSpeed = relVX * nx + relVZ * nz;
  if (relSpeed < 0) {
    const restitution = 1.05;
    ballBody.velocity.x -= (1 + restitution) * relSpeed * nx;
    ballBody.velocity.z -= (1 + restitution) * relSpeed * nz;
  }
  ballBody.velocity.x += c.vel.x * 0.3;
  ballBody.velocity.z += c.vel.z * 0.3;
}

// ---------------------------------------------------------------------------
// Main tick loop
// ---------------------------------------------------------------------------
let lastTick = Date.now();
let broadcastAccum = 0;

setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;

  if (phase === 'countdown') {
    countdownRemaining -= dt;
    if (countdownRemaining <= 0) startMatch();
  } else if (phase === 'playing') {
    if (goalPauseRemaining > 0) {
      goalPauseRemaining -= dt;
    } else {
      for (const c of clients.values()) applyPlayerControl(c, dt);
      world.step(1 / TICK_HZ, dt, 5);
      updateBallControl(dt);
      for (const c of clients.values()) resolvePlayerBallContact(c);

      if (ballBody.position.x < -HALF_W + BALL_R) ballBody.position.x = -HALF_W + BALL_R;
      if (ballBody.position.x > HALF_W - BALL_R) ballBody.position.x = HALF_W - BALL_R;

      if (ballBody.velocity.length() > MAX_BALL_SPEED) {
        ballBody.velocity.scale(MAX_BALL_SPEED / ballBody.velocity.length(), ballBody.velocity);
      }
      if (ballBody.position.y > MAX_BALL_HEIGHT) {
        ballBody.position.y = MAX_BALL_HEIGHT;
        if (ballBody.velocity.y > 0) ballBody.velocity.y = 0;
      }

      const ballUnderCrossbar = ballBody.position.y <= GOAL_HEIGHT - BALL_R;
      if (ballBody.position.z > HALF_L - BALL_R && Math.abs(ballBody.position.x) < GOAL_HALF_W - BALL_R * 0.5 && ballUnderCrossbar) {
        score.red++;
        broadcastLobby();
        resetAfterGoal('red');
      } else if (ballBody.position.z < -HALF_L + BALL_R && Math.abs(ballBody.position.x) < GOAL_HALF_W - BALL_R * 0.5 && ballUnderCrossbar) {
        score.blue++;
        broadcastLobby();
        resetAfterGoal('blue');
      } else if (Math.abs(ballBody.position.z) > HALF_L + 2 || ballBody.position.y < -5) {
        resetAfterGoal(pendingServe === 'blue' ? 'red' : 'blue');
      }

      if (score.blue >= WIN_SCORE || score.red >= WIN_SCORE || now >= matchEndsAt) endMatch();
    }
  } else if (phase === 'ended') {
    endPauseRemaining -= dt;
    if (endPauseRemaining <= 0) backToLobby();
  }

  broadcastAccum += dt;
  if (broadcastAccum >= 1 / BROADCAST_HZ) {
    broadcastAccum = 0;
    if (phase === 'playing' && world) {
      broadcast({
        type: 'state',
        score,
        // included on every tick (not just the one-shot 'matchStart') so a
        // client that connects mid-match — reconnect, or a late joiner who
        // ends up spectating — still gets a correctly-synced clock from its
        // very first packet rather than only clients present at kickoff.
        startedAt: matchStartedAt,
        endsAt: matchEndsAt,
        ball: {
          x: ballBody.position.x, y: ballBody.position.y, z: ballBody.position.z,
          vx: ballBody.velocity.x, vy: ballBody.velocity.y, vz: ballBody.velocity.z,
        },
        players: Array.from(clients.values())
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
            hasBall: ballOwnerId === c.id,
            sliding: c.slideRemaining > 0,
            action: c.lastAction && now - c.lastAction.at < 300 ? c.lastAction.type : null,
          })),
      });
    }
  }
}, 1000 / TICK_HZ);

// ---------------------------------------------------------------------------
// "Davet Linki Kopyala" (copy invite link) landing page. The link itself is
// built entirely client-side (see game.js) and just carries the server
// address + inviter name as query params — no email, no token/store needed
// for that. This route only exists so the link the user copy-pastes (into
// Slack/Teams/etc.) opens something useful instead of a dead chrome-extension
// URL (extension ids differ per install, so those can't be shared reliably).
// ---------------------------------------------------------------------------
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Invitees use the same game.html/game.js lobby as extension users, served
// from this LAN server because unpacked extension IDs differ between machines.
function handleJoinLanding(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const fromName = url.searchParams.get('from');
  const lanIp = getLanIPv4Addresses()[0];
  const serverUrl = url.searchParams.get('server') || (lanIp ? `ws://${lanIp}:${PORT}` : `ws://localhost:${PORT}`);
  const safeServerUrl = escapeHtml(serverUrl);
  const safeFromName = escapeHtml(fromName || '');

  const matchInProgress = phase === 'playing';
  const statusLine = matchInProgress
    ? 'Maç şu anda devam ediyor. Bittiğinde otomatik olarak lobiye alınacaksın.'
    : (fromName
      ? `<strong>${escapeHtml(fromName)}</strong> seni Office Futboll maçına davet etti.`
      : 'Office Futboll maçına davet edildin.');

  const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Office Futboll'a Katıl</title></head>
<body style="margin:0; padding:24px; background:#10151c; color:#e8ebef; font-family:Arial, Helvetica, sans-serif;">
  <div style="max-width:420px; margin:0 auto; background:#161d26; border-radius:10px; overflow:hidden;">
    <div style="background:#12321f; padding:26px 24px; text-align:center;">
      <div style="font-size:12px; letter-spacing:2px; color:#5ce87a; font-weight:bold;">⚽ OFFICE FUTBOLL</div>
      <div style="font-size:22px; font-weight:bold; margin-top:10px;">Maça davet edildiniz!</div>
    </div>
    <div style="padding:24px; font-size:14px; line-height:1.6; text-align:center;">
      <p>${statusLine}</p>

      <form action="/game.html" method="get" onsubmit="console.log('[JOIN] Invite button clicked'); document.getElementById('joinBtn').textContent='KATILIYOR...';">
        <input type="hidden" name="server" value="${safeServerUrl}">
        <input type="hidden" name="from" value="${safeFromName}">
        <input type="hidden" name="join" value="1">
        <label for="playerName" style="display:block;text-align:left;">Adın</label>
        <input id="playerName" name="name" type="text" maxlength="20" required autocomplete="name" placeholder="Adını yaz" style="box-sizing:border-box;width:100%;padding:12px;margin:6px 0;border-radius:8px;border:1px solid #6b7684;background:#0f141b;color:#fff;">
        <button id="joinBtn" type="submit" style="display:inline-block; width:100%; padding:16px 24px; margin:18px 0 8px; font-size:17px; font-weight:bold;
        color:#ffffff; background:#3ea45f; border:none; border-radius:8px; cursor:pointer;">
        ⚽ KATIL
        </button>
      </form>

      <p style="color:#9aa5b1; font-size:12px; text-transform:uppercase; margin-bottom:4px; text-align:left;">Sunucu adresi</p>
      <div style="background:#0f141b; border-radius:8px; padding:12px 14px; color:#5ce87a; font-family:Consolas, 'Courier New', monospace; font-size:15px; text-align:left;">${safeServerUrl}</div>

      <p style="color:#9aa5b1; font-size:13px; margin-top:18px; text-align:left;">Katıldıktan sonra lobide takımını ve mevkini seçip HAZIR'a bas.</p>
      <p style="color:#6b7684; font-size:12px; margin-top:14px;">
        Bu adrese ulaşamıyorsan şirket ağına veya VPN'e bağlı olduğundan emin ol.
      </p>
    </div>
  </div>
</body></html>`;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

const httpServer = http.createServer((req, res) => {
  const path = (req.url || '').split('?')[0];

  if (req.method === 'GET' && path === '/join') {
    handleJoinLanding(req, res);
    return;
  }

  const gameFiles = {
    '/game.html': ['game.html', 'text/html; charset=utf-8'],
    '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
    '/field.js': ['field.js', 'text/javascript; charset=utf-8'],
    '/stadium.js': ['stadium.js', 'text/javascript; charset=utf-8'],
    '/lib/three.min.js': ['lib/three.min.js', 'text/javascript; charset=utf-8'],
    '/textures/grass.jpg': ['textures/grass.jpg', 'image/jpeg'],
    '/assets/textures/pitch/grass_diffuse.png': ['assets/textures/pitch/grass_diffuse.png', 'image/png'],
    '/assets/textures/pitch/grass_normal.png': ['assets/textures/pitch/grass_normal.png', 'image/png'],
  };
  if (req.method === 'GET' && gameFiles[path]) {
    const [file, contentType] = gameFiles[path];
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    fs.createReadStream(nodePath.join(__dirname, '..', file)).pipe(res);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Ofis Futbolu 3D sunucusu calisiyor.\n');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('[SERVER] Connection opened');
  const id = crypto.randomUUID();
  const client = {
    id, ws, name: 'Oyuncu', team: null, position: DEFAULT_POSITION, ready: false,
    inMatch: false, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    input: { x: 0, z: 0, sprint: false },
    facing: { x: 0, z: 1 }, cooldowns: { A: 0, S: 0, D: 0 },
    slideRemaining: 0, recoveryRemaining: 0, standingActive: 0, lastAction: null,
  };
  let joined = false;

  // let a not-yet-joined socket see live team/position counts in its picker UI
  send(ws, { type: 'lobby', phase, countdown: null, players: rosterPayload(), score, hostId, minPlayers: MIN_PLAYERS_TO_START, positions: POSITIONS });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join' && !joined) {
      console.log('[SERVER] Join request received', { name: msg.name, team: msg.team, position: msg.position });
      client.name = String(msg.name || 'Oyuncu').slice(0, 20).trim() || 'Oyuncu';
      client.team = msg.team === 'red' ? 'red' : 'blue';
      client.position = positionFor(msg.position);
      clients.set(id, client);
      joined = true;
      console.log('[SERVER] Player joined:', client.name, 'Players online:', clients.size);
      if (!hostId) hostId = id;
      send(ws, { type: 'welcome', id, isHost: id === hostId, field: { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, BALL_R, PLAYER_R }, positions: POSITIONS });
      // A new player joining mid-countdown wasn't part of the readiness that
      // triggered it — cancel and make everyone (including them) re-confirm,
      // rather than silently starting a match they never agreed to join.
      cancelCountdown();
      broadcastLobby();
      console.log('[SERVER] Broadcasting lobby state');
    } else if (msg.type === 'update_self' && joined) {
      if (phase !== 'lobby') return;
      if (msg.team === 'blue' || msg.team === 'red') client.team = msg.team;
      if (msg.position) client.position = positionFor(msg.position);
      client.ready = false; // team/position changed — stale readiness doesn't carry over
      broadcastLobby();
    } else if (msg.type === 'set_team' && joined) {
      if (id !== hostId || phase !== 'lobby') return;
      const target = clients.get(msg.playerId);
      if (target && (msg.team === 'blue' || msg.team === 'red')) {
        target.team = msg.team;
        target.ready = false;
        broadcastLobby();
      }
    } else if (msg.type === 'ready' && joined) {
      if (phase !== 'lobby') return; // can't change readiness once counting down or in-match
      client.ready = !!msg.ready;
      broadcastLobby();
      checkAutoStart();
    } else if (msg.type === 'input' && joined) {
      client.input = {
        x: Math.max(-1, Math.min(1, Number(msg.x) || 0)),
        z: Math.max(-1, Math.min(1, Number(msg.z) || 0)),
        sprint: msg.sprint === true,
      };
    } else if (msg.type === 'action' && joined) {
      performAction(client, msg.key);
    }
  });

  ws.on('close', () => {
    if (!joined) return;
    clients.delete(id);
    if (id === hostId) {
      const next = clients.keys().next();
      hostId = next.done ? null : next.value;
    }
    broadcastLobby();
    if (phase === 'countdown') {
      // a departing player invalidates whatever readiness triggered this
      // countdown — cancel it unconditionally (cancelCountdown also covers
      // the "count dropped below MIN_PLAYERS_TO_START" case since the
      // countdown can't meaningfully continue either way)
      cancelCountdown();
    } else if (phase === 'playing') {
      const { blue, red } = teamCounts();
      if (blue < 1 || red < 1) abortMatchToLobby();
    } else if (phase === 'lobby') {
      // someone who wasn't ready leaving might be exactly what was blocking
      // the remaining, already-ready players from starting
      checkAutoStart();
    }
  });

  ws.on('error', () => {});
});

// Finds this machine's non-internal IPv4 addresses so the startup banner can
// print ready-to-use LAN connection URLs even if the DHCP-assigned IP changes
// later — no IP is ever hardcoded into the binding itself.
function getLanIPv4Addresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

const HOST = '0.0.0.0'; // listen on all network interfaces, not just localhost

httpServer.listen(PORT, HOST, () => {
  const lanAddrs = getLanIPv4Addresses();
  console.log('========================================');
  console.log(' OFFICE FUTBOLL SERVER');
  console.log('========================================');
  console.log('Local:');
  console.log(`  ws://localhost:${PORT}`);
  console.log('');
  console.log('LAN:');
  if (lanAddrs.length) {
    lanAddrs.forEach((ip) => console.log(`  ws://${ip}:${PORT}`));
  } else {
    console.log('  (LAN arayuzu bulunamadi)');
  }
  console.log('');
  console.log(`Port: ${PORT}`);
  console.log('');
  console.log('Waiting for players...');
  console.log('========================================');
});
