import { PLAYER_SPEED, SPRINT_SPEED, SLIDE_SPEED, SLIDE_RECOVERY, PITCH_MIN_X, PITCH_MAX_X, PITCH_MIN_Z, PITCH_MAX_Z, POSITIONS, positionFor } from '../core/config.js';
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

function applyPlayerControl(c, dt) {
  if (!c.inMatch) return;

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
    const targetX = state.ballBody.position.x;
    const targetZ = Math.max(keeperZ - 4, Math.min(keeperZ + 3, state.ballBody.position.z));
    
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
  c.recoveryRemaining = Math.max(0, c.recoveryRemaining - dt);
  const speed = c.recoveryRemaining > 0 ? PLAYER_SPEED * .35 : (inp.sprint ? SPRINT_SPEED : PLAYER_SPEED);
  c.vel.x = nx * speed;
  c.vel.z = nz * speed;
  if (inp.x || inp.z) c.facing = { x: nx, z: nz };

  const range = allowedRange(c);
  c.pos.x = Math.max(range.xMin, Math.min(range.xMax, c.pos.x + c.vel.x * dt));
  c.pos.z = Math.max(range.zMin, Math.min(range.zMax, c.pos.z + c.vel.z * dt));

  c.standingActive = Math.max(0, c.standingActive - dt);
}

return { placeAllPlayers, applyPlayerControl };
}
