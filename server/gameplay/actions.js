import { SERVER } from '../../src/network/protocol.js';
import { POSSESSION_RANGE, ACTION_RANGE, STANDING_TACKLE_RANGE, SLIDE_TACKLE_RANGE, SLIDE_DURATION, SLIDE_FOOT_OFFSET, SLIDE_BALL_CAPTURE_RADIUS, SLIDE_BALL_CONTROL_OFFSET, ACTION_COOLDOWNS, STANDING_TACKLE_COOLDOWN, SLIDE_TACKLE_COOLDOWN } from '../core/config.js';
import { BALL_R } from '../../shared/field.js';
import * as CANNON from 'cannon-es';
export function createActions({ state, broadcast }) {
function ballDistance(c) {
  return Math.hypot(state.ballBody.position.x - c.pos.x, state.ballBody.position.z - c.pos.z);
}

function hasBall(c) {
  return state.ballOwnerId === c.id && ballDistance(c) < POSSESSION_RANGE * 1.9 && state.ballBody.position.y < 1.15;
}

function releaseBall(duration = 280) {
  state.ballOwnerId = null;
  state.looseBallUntil = Date.now() + duration;
}

function applyBallImpulse(x, y, z) {
  state.ballBody.velocity.scale(.35, state.ballBody.velocity);
  state.ballBody.applyImpulse(new CANNON.Vec3(x * state.ballBody.mass, y * state.ballBody.mass, z * state.ballBody.mass));
}

function beginSlide(c) {
  const speed = Math.hypot(c.vel.x, c.vel.z);
  const input = c.input || { x: 0, z: 0 };
  const inputLength = Math.hypot(input.x, input.z);
  let direction;

  if (speed > 0.35) {
    direction = { x: c.vel.x / speed, z: c.vel.z / speed };
  } else if (inputLength > 0.01) {
    direction = { x: input.x / inputLength, z: input.z / inputLength };
  } else {
    const facingLength = Math.hypot(c.facing.x, c.facing.z) || 1;
    direction = { x: c.facing.x / facingLength, z: c.facing.z / facingLength };
  }

  c.slideDirection = direction;
  c.facing = { x: direction.x, z: direction.z };
  c.slideRemaining = SLIDE_DURATION;
}

function captureBallWithSlide(c) {
  if (!c.inMatch || c.slideRemaining <= 0 || state.ballBody.position.y > 1.1) return false;

  const direction = c.slideDirection || c.facing;
  const footX = c.pos.x + direction.x * SLIDE_FOOT_OFFSET;
  const footZ = c.pos.z + direction.z * SLIDE_FOOT_OFFSET;
  const distanceToFoot = Math.hypot(state.ballBody.position.x - footX, state.ballBody.position.z - footZ);
  if (distanceToFoot > SLIDE_BALL_CAPTURE_RADIUS) return false;

  const newlyCaptured = state.ballOwnerId !== c.id;
  state.ballOwnerId = c.id;
  state.looseBallUntil = 0;
  state.ballBody.position.x = c.pos.x + direction.x * SLIDE_BALL_CONTROL_OFFSET;
  state.ballBody.position.y = BALL_R;
  state.ballBody.position.z = c.pos.z + direction.z * SLIDE_BALL_CONTROL_OFFSET;
  state.ballBody.velocity.set(c.vel.x, 0, c.vel.z);
  state.ballBody.angularVelocity.set(0, 0, 0);
  return newlyCaptured;
}

function attemptTackle(c, sliding) {
  if (sliding) return captureBallWithSlide(c);
  if (!state.ballOwnerId || state.ballOwnerId === c.id) return false;
  const owner = state.clients.get(state.ballOwnerId);
  if (!owner || owner.team === c.team || state.ballBody.position.y > 1.1) return false;
  const dx = state.ballBody.position.x - c.pos.x;
  const dz = state.ballBody.position.z - c.pos.z;
  const dist = Math.hypot(dx, dz);
  const angle = (dx * c.facing.x + dz * c.facing.z) / (dist || 1);
  const range = STANDING_TACKLE_RANGE;
  if (dist > range || angle < .35) return false;
  if (Math.hypot(owner.pos.x - c.pos.x, owner.pos.z - c.pos.z) > range + .5) return false;
  releaseBall(300);
  applyBallImpulse(c.facing.x * 5, .25, c.facing.z * 5);
  return true;
}

function performAction(c, key) {
  if (!c.inMatch || state.phase !== 'playing' || !state.ballBody || !['A', 'S', 'D'].includes(key)) return;
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
    beginSlide(c);
    success = attemptTackle(c, true);
    c.cooldowns.D = now + SLIDE_TACKLE_COOLDOWN * 1000;
  }
  c.lastAction = { type: action, at: now };
  broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action, success, hasBall: owner });
}

function updateBallControl(dt) {
  if (state.ballOwnerId) {
    const owner = state.clients.get(state.ballOwnerId);
    if (!owner || !owner.inMatch || !hasBall(owner)) {
      releaseBall(180);
    } else {
      const sliding = owner.slideRemaining > 0;
      const sprinting = !sliding && !!owner.input.sprint;
      const offset = sliding ? SLIDE_BALL_CONTROL_OFFSET : (sprinting ? 1.28 : .86);
      const response = sliding ? 18 : (sprinting ? 6.5 : 9);
      const blend = 1 - Math.exp(-dt * (sliding ? 22 : (sprinting ? 9 : 13)));
      const targetX = owner.pos.x + owner.facing.x * offset;
      const targetZ = owner.pos.z + owner.facing.z * offset;
      const desiredVX = owner.vel.x + (targetX - state.ballBody.position.x) * response;
      const desiredVZ = owner.vel.z + (targetZ - state.ballBody.position.z) * response;
      state.ballBody.velocity.x += (desiredVX - state.ballBody.velocity.x) * blend;
      state.ballBody.velocity.z += (desiredVZ - state.ballBody.velocity.z) * blend;
    }
  }
  if (!state.ballOwnerId && Date.now() >= state.looseBallUntil && state.ballBody.position.y < .75) {
    let nearest = null;
    let best = POSSESSION_RANGE;
    for (const c of state.clients.values()) {
      if (!c.inMatch || c.slideRemaining > 0) continue;
      const dist = ballDistance(c);
      if (dist < best) { nearest = c; best = dist; }
    }
    if (nearest) state.ballOwnerId = nearest.id;
  }
  for (const c of state.clients.values()) {
    if (c.standingActive > 0 && attemptTackle(c, false)) {
      c.standingActive = 0;
      broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action: 'standing_tackle', success: true, hasBall: false });
    }
    if (c.slideRemaining > 0 && attemptTackle(c, true)) {
      broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action: 'slide_tackle', success: true, hasBall: false });
    }
    // AI goalkeeper automatic defense
    if (c.isAI && c.position === 'KL' && state.ballOwnerId && state.ballOwnerId !== c.id) {
      const dist = ballDistance(c);
      if (dist < SLIDE_TACKLE_RANGE && c.slideRemaining === 0 && Date.now() >= c.cooldowns.D) {
        beginSlide(c);
        if (attemptTackle(c, true)) {
          c.cooldowns.D = Date.now() + SLIDE_TACKLE_COOLDOWN * 1000;
          broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action: 'slide_tackle', success: true, hasBall: false });
        }
      }
    }
  }
}

return { releaseBall, performAction, updateBallControl };
}
