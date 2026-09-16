import { PLAYER_SPEED, SPRINT_SPEED, SLIDE_SPEED, SLIDE_RECOVERY, PITCH_MIN_X, PITCH_MAX_X, PITCH_MIN_Z, PITCH_MAX_Z, POSITIONS, positionFor,
  PLAYER_ACCELERATION, PLAYER_SPRINT_ACCELERATION, PLAYER_DECELERATION, PLAYER_STAND_TURN_RATE, PLAYER_MAX_TURN_RATE, PLAYER_SPRINT_TURN_RATE, PLAYER_TURN_ACCELERATION,
  SHOT_CHARGE_TURN_FACTOR, SHOT_CHARGE_SPEED_FACTOR,
  KEEPER_POSITION_SPEED, KEEPER_LATERAL_FACTOR, KEEPER_MAX_SIDE, KEEPER_MIN_DEPTH, KEEPER_MAX_DEPTH, KEEPER_DIVE_SPEED } from '../core/config.js';
import { HALF_L, GOAL_HALF_W, FIELD } from '../../shared/field.js';
export function createPlayerManager({ state }) {
function spawnFor(c, sameSpotIndex) {
  const slot = FIELD.LOBBY_SLOTS[c.slot];
  if (slot) return { x: slot.x, z: slot.z * (c.team === 'blue' ? 1 : -1) };
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
  for (const c of state.clients.values()) {
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
    c.slideDirection = null;
    c.recoveryRemaining = 0;
    c.keeperPossessionStartedAt = 0;
    c.input = { x: 0, z: 0, sprint: false };
    c.facing = { x: 0, z: c.team === 'blue' ? -1 : 1 };
    c.cooldowns = { A: 0, S: 0, D: 0 };
    c.standingActive = 0;
    c.turnRate = 0;
    c.shotCharge = null;
    c.lastAction = null;
  }
}
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

// Turn rate falls from standing agility to jog to sprint as the player speeds up.
function turnRateForSpeed(speed) {
  if (speed <= PLAYER_SPEED) return PLAYER_STAND_TURN_RATE + (PLAYER_MAX_TURN_RATE - PLAYER_STAND_TURN_RATE) * (speed / PLAYER_SPEED);
  const t = Math.min(1, (speed - PLAYER_SPEED) / (SPRINT_SPEED - PLAYER_SPEED));
  return PLAYER_MAX_TURN_RATE + (PLAYER_SPRINT_TURN_RATE - PLAYER_MAX_TURN_RATE) * t;
}

function approach(value, target, maxStep) {
  return value < target ? Math.min(target, value + maxStep) : Math.max(target, value - maxStep);
}

// Momentum-based steering. The body has an angular speed (c.turnRate) that
// builds up and eases off with a speed-dependent angular acceleration, capped by
// a speed-dependent turn rate, and slows early enough to stop on the input
// direction. Speed only builds along the direction the body already faces:
// input behind the player brakes first, then the body turns, then it
// accelerates the new way. Velocity always follows the body's facing.
function steerFootballer(c, dt) {
  const inp = c.input || { x: 0, z: 0, sprint: false };
  const inputLength = Math.hypot(inp.x, inp.z);
  const charging = !!c.shotCharge;
  let speed = Math.hypot(c.vel.x, c.vel.z);
  let desiredSpeed = 0;
  const agility = turnRateForSpeed(speed);
  const maxRate = agility * (charging ? SHOT_CHARGE_TURN_FACTOR : 1);
  const turnAcceleration = PLAYER_TURN_ACCELERATION * (agility / PLAYER_STAND_TURN_RATE);
  const heading = Math.atan2(c.facing.x, c.facing.z);
  let diff = 0, targetRate = 0;
  if (inputLength > 0.01) {
    const target = Math.atan2(inp.x / inputLength, inp.z / inputLength);
    diff = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
    targetRate = Math.sign(diff) * Math.min(maxRate, Math.sqrt(2 * turnAcceleration * Math.abs(diff)));
  }
  c.turnRate = approach(c.turnRate || 0, targetRate, turnAcceleration * dt);
  const step = c.turnRate * dt;

  if (inputLength > 0.01) {
    let remaining = 0;
    if (Math.abs(diff) < 1e-4 || (Math.abs(diff) <= Math.abs(step) && Math.sign(step) === Math.sign(diff))) {
      c.facing = { x: inp.x / inputLength, z: inp.z / inputLength }; // arrived: use the exact input direction
      c.turnRate = 0;
    } else {
      const next = heading + step;
      c.facing = { x: Math.sin(next), z: Math.cos(next) };
      remaining = Math.abs(Math.atan2(Math.sin(heading + diff - next), Math.cos(heading + diff - next)));
    }
    const cap = c.recoveryRemaining > 0 ? PLAYER_SPEED * .35 : (inp.sprint ? SPRINT_SPEED : PLAYER_SPEED);
    // Full speed only once the body points where the player wants to go.
    desiredSpeed = cap * Math.max(0, Math.cos(remaining)) * (charging ? SHOT_CHARGE_SPEED_FACTOR : 1);
  } else if (step) {
    const next = heading + step; // a turn in progress eases out
    c.facing = { x: Math.sin(next), z: Math.cos(next) };
  }

  if (desiredSpeed > speed) {
    const acceleration = speed >= PLAYER_SPEED ? PLAYER_SPRINT_ACCELERATION : PLAYER_ACCELERATION;
    speed = approach(speed, desiredSpeed, acceleration * dt);
  } else {
    speed = approach(speed, desiredSpeed, PLAYER_DECELERATION * dt);
  }
  c.vel.x = c.facing.x * speed;
  c.vel.z = c.facing.z * speed;
}

function applyPlayerControl(c, dt) {
  if (!c.inMatch) return;

  if (c.isAI && c.position === 'KL' && state.ballOwnerId === c.id) {
    // A keeper that has secured the ball stops the save animation and faces
    // into the pitch. Distribution is handled by actions.updateBallControl.
    c.slideRemaining = 0;
    c.slideDirection = null;
    c.recoveryRemaining = 0;
    c.vel.x = 0;
    c.vel.z = 0;
    c.facing = { x: 0, z: c.team === 'blue' ? -1 : 1 };
    c.pos.x = Math.max(PITCH_MIN_X, Math.min(PITCH_MAX_X, c.pos.x));
    c.pos.z = Math.max(PITCH_MIN_Z, Math.min(PITCH_MAX_Z, c.pos.z));
    return;
  }

  // A slide keeps the direction captured at its starting moment. Input or AI
  // steering cannot bend the player mid-slide.
  if (c.slideRemaining > 0) {
    c.slideRemaining = Math.max(0, c.slideRemaining - dt);
    const slideDirection = c.slideDirection || c.facing;
    c.vel.x = slideDirection.x * SLIDE_SPEED;
    c.vel.z = slideDirection.z * SLIDE_SPEED;
    c.facing = { x: slideDirection.x, z: slideDirection.z };

    const range = allowedRange(c);
    c.pos.x = Math.max(range.xMin, Math.min(range.xMax, c.pos.x + c.vel.x * dt));
    c.pos.z = Math.max(range.zMin, Math.min(range.zMax, c.pos.z + c.vel.z * dt));
    if (c.slideRemaining === 0) {
      c.slideDirection = null;
      c.recoveryRemaining = SLIDE_RECOVERY;
    }
    c.standingActive = Math.max(0, c.standingActive - dt);
    return;
  }

  // AI goalkeeper behavior
  if (c.isAI && c.position === 'KL') {
    const keeperZ = c.team === 'blue' ? HALF_L : -HALF_L;
    const sign = c.team === 'blue' ? 1 : -1;
    const ball = state.ballBody.position;
    const now = Date.now();
    let targetX = c.pos.x, targetZ = c.pos.z, speed = 0;
    const dive = c.keeperDive; // planned by actions.js when a shot is read
    if (dive && now >= dive.startsAt) {
      targetX = dive.targetX; speed = KEEPER_DIVE_SPEED;
    } else if (!dive) {
      // Narrow the angle: shade toward the ball's side and come off the line
      // as play approaches, but never track the ball one-to-one.
      const distance = Math.hypot(ball.x, ball.z - keeperZ);
      const depth = Math.max(KEEPER_MIN_DEPTH, Math.min(KEEPER_MAX_DEPTH, KEEPER_MAX_DEPTH * (1 - distance / 35)));
      targetX = Math.max(-KEEPER_MAX_SIDE, Math.min(KEEPER_MAX_SIDE, ball.x * KEEPER_LATERAL_FACTOR));
      targetZ = keeperZ - sign * depth;
      speed = KEEPER_POSITION_SPEED;
    } // else: reading the shot, set and still for the reaction time

    const dx = targetX - c.pos.x;
    const dz = targetZ - c.pos.z;
    const dist = Math.hypot(dx, dz);
    const step = speed * dt;
    if (dist > 1e-3 && speed > 0) {
      const move = Math.min(step, dist) / dt;
      c.vel.x = (dx / dist) * move;
      c.vel.z = (dz / dist) * move;
    } else {
      c.vel.x = 0;
      c.vel.z = 0;
    }
    const toBallX = ball.x - c.pos.x, toBallZ = ball.z - c.pos.z, toBall = Math.hypot(toBallX, toBallZ);
    c.facing = toBall > .1 ? { x: toBallX / toBall, z: toBallZ / toBall } : { x: 0, z: -sign };

    // Keeper area bounds (6-yard box)
    const keeperXMin = Math.max(PITCH_MIN_X, -GOAL_HALF_W * 2.5);
    const keeperXMax = Math.min(PITCH_MAX_X, GOAL_HALF_W * 2.5);
    const keeperZMin = c.team === 'blue' ? keeperZ - 5 : PITCH_MIN_Z;
    const keeperZMax = c.team === 'blue' ? PITCH_MAX_Z : keeperZ + 5;
    
    c.pos.x = Math.max(keeperXMin, Math.min(keeperXMax, c.pos.x + c.vel.x * dt));
    c.pos.z = Math.max(keeperZMin, Math.min(keeperZMax, c.pos.z + c.vel.z * dt));
    
    c.standingActive = Math.max(0, c.standingActive - dt);
    return;
  }

  c.recoveryRemaining = Math.max(0, c.recoveryRemaining - dt);
  steerFootballer(c, dt);

  const range = allowedRange(c);
  c.pos.x = Math.max(range.xMin, Math.min(range.xMax, c.pos.x + c.vel.x * dt));
  c.pos.z = Math.max(range.zMin, Math.min(range.zMax, c.pos.z + c.vel.z * dt));

  c.standingActive = Math.max(0, c.standingActive - dt);
}

return { placeAllPlayers, applyPlayerControl };
}
