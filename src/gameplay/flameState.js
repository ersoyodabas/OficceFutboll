// When the rocket-shot flame burns, and how strongly. Pure presentation logic:
// it only reads the authoritative shot charge and the ball velocity the server
// sends, and never feeds anything back into physics.
export const FLAME_MIN_CHARGE = 0.8;      // shots above this charge ignite
export const FLAME_MIN_SPEED = 13;        // m/s: slower balls stop burning
export const FLAME_MAX_MS = 2600;         // a flame never outlives this
export const FLAME_ARM_MS = 400;          // time allowed for the kick to show up in snapshots
export const FLAME_IMPACT_SPEED_RATIO = 0.7;         // sudden speed loss → it hit something
export const FLAME_IMPACT_TURN_COS = Math.cos(35 * Math.PI / 180); // sudden horizontal turn → deflection

// 0 below FLAME_MIN_CHARGE, then from 0.35 to 1 at full charge.
export function flameIntensity(charge) {
  if (!(charge >= FLAME_MIN_CHARGE)) return 0;
  return 0.35 + 0.65 * Math.min(1, (charge - FLAME_MIN_CHARGE) / (1 - FLAME_MIN_CHARGE));
}

export function createFlameState() {
  let intensity = 0, ignitedAt = 0, armed = false, launchSpeed = 0, lastSpeed = 0, lastDirX = 0, lastDirZ = 0;

  function ignite(charge, now) {
    intensity = flameIntensity(charge);
    ignitedAt = now;
    armed = false;
  }
  function extinguish() { intensity = 0; armed = false; }

  // velocity: latest authoritative ball velocity; playing: match in normal play
  // with the ball loose. Returns the current intensity (0 = no flame).
  function update({ now, velocity, playing }) {
    if (!intensity) return 0;
    if (!playing || now - ignitedAt > FLAME_MAX_MS) { extinguish(); return 0; }
    const horizontal = Math.hypot(velocity.x, velocity.z);
    const speed = Math.hypot(horizontal, velocity.y);
    if (!armed) {
      if (speed >= FLAME_MIN_SPEED) {
        armed = true; launchSpeed = lastSpeed = speed;
        lastDirX = velocity.x / (horizontal || 1); lastDirZ = velocity.z / (horizontal || 1);
      } else if (now - ignitedAt > FLAME_ARM_MS) {
        extinguish();
      }
      return intensity;
    }
    const dirX = velocity.x / (horizontal || 1), dirZ = velocity.z / (horizontal || 1);
    const turnedSharply = horizontal > 1 && dirX * lastDirX + dirZ * lastDirZ < FLAME_IMPACT_TURN_COS;
    if (speed < FLAME_MIN_SPEED || speed < lastSpeed * FLAME_IMPACT_SPEED_RATIO || turnedSharply) { extinguish(); return 0; }
    lastSpeed = speed; lastDirX = dirX; lastDirZ = dirZ;
    // Burns hottest at launch speed and fades as air drag slows the ball.
    return intensity * Math.min(1, Math.max(0.45, speed / launchSpeed));
  }

  return { ignite, extinguish, update, isBurning: () => intensity > 0 };
}
