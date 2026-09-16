import { GOAL_HALF_W, HALF_L } from '../../shared/field.js';
import {
  GRAVITY, BALL_MASS, BALL_LINEAR_DAMPING, BALL_ANGULAR_DAMPING, MAGNUS_COEFFICIENT, MAGNUS_MIN_SPEED, MAX_BALL_SPEED,
  KICK_RETAINED_VELOCITY,
  SHOT_CORNER_FROM_CHARGE, SHOT_CORNER_CHARGE_EXPONENT, SHOT_CORNER_AIM_GAIN, SHOT_CORNER_INSET, SHOT_CORNER_HEIGHT,
  SHOT_CORNER_SCATTER, SHOT_CORNER_HEIGHT_SCATTER, SHOT_CORNER_REFERENCE_DISTANCE, SHOT_CORNER_MAX_DISTANCE,
  SHOT_CORNER_FACING_MARGIN, SHOT_CORNER_MAX_YAW_DEG, SHOT_CORNER_MAX_LIFT,
} from '../core/config.js';

// Top-corner ("doksan") shots. Pure functions: the server calls them when a shot
// is struck, so direction and lift stay authoritative and every client simply
// receives the resulting ball.

const degrees = Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// How strongly a shot is steered toward an upper corner (0..1): nothing below
// SHOT_CORNER_FROM_CHARGE, growing with charge (fastest near 100 %), and only
// when left/right aim is held; straight shots are never steered.
export function cornerPull(charge, aim) {
  const power = clamp((charge - SHOT_CORNER_FROM_CHARGE) / (1 - SHOT_CORNER_FROM_CHARGE), 0, 1);
  return Math.pow(power, SHOT_CORNER_CHARGE_EXPONENT) * clamp(Math.abs(aim) * SHOT_CORNER_AIM_GAIN, 0, 1);
}

// Follows a kicked ball with the simulation's gravity, damping and Magnus curl
// (ground ignored) until it reaches the goal plane z = planeZ.
// Returns { x, y, time } there, or null if it never gets there.
export function predictPlaneCrossing({ position, velocity, spin, planeZ, maxTime = 2.5, step = 1 / 240 }) {
  const side = Math.sign(planeZ - position.z);
  if (!side) return null;
  let { x, y, z } = position;
  let vx = velocity.x, vy = velocity.y, vz = velocity.z, w = spin;
  const damping = Math.pow(1 - BALL_LINEAR_DAMPING, step);
  const spinDamping = Math.pow(1 - BALL_ANGULAR_DAMPING, step);
  const magnus = MAGNUS_COEFFICIENT * step / BALL_MASS;
  for (let time = 0; time < maxTime; time += step) {
    if (Math.abs(w) >= 1e-3 && Math.hypot(vx, vz) >= MAGNUS_MIN_SPEED) {
      const ox = vx, oz = vz;
      vx += w * oz * magnus;
      vz -= w * ox * magnus;
    }
    vx *= damping; vy *= damping; vz *= damping; w *= spinDamping;
    vy -= GRAVITY * step;
    if (vz * side <= 0) return null;
    const nx = x + vx * step, ny = y + vy * step, nz = z + vz * step;
    if ((nz - planeZ) * side >= 0) {
      const f = (planeZ - z) / (nz - z);
      return { x: x + (nx - x) * f, y: y + (ny - y) * f, time: time + step * f };
    }
    x = nx; y = ny; z = nz;
  }
  return null;
}

// Launch velocity exactly as actions.js applies a kick: part of the ball's
// current velocity is kept, the shot is added, and the total is speed-capped.
export function launchVelocity({ facing, residual, speed, yaw, lift }) {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const v = {
    x: residual.x * KICK_RETAINED_VELOCITY + (facing.x * cos - facing.z * sin) * speed,
    y: residual.y * KICK_RETAINED_VELOCITY + lift,
    z: residual.z * KICK_RETAINED_VELOCITY + (facing.z * cos + facing.x * sin) * speed,
  };
  const total = Math.hypot(v.x, v.y, v.z);
  if (total > MAX_BALL_SPEED) for (const k of ['x', 'y', 'z']) v[k] *= MAX_BALL_SPEED / total;
  return v;
}

// Finds the yaw (from the facing, + = shooter's right) and lift that put the
// ball through `target` on the goal plane, curl included. Returns null when no
// sensible solution exists (e.g. the corner is behind the shooter).
export function solveShot({ position, residual, facing, speed, spin, target, yaw, lift }) {
  const at = (yawValue, liftValue) => predictPlaneCrossing({
    position, spin, planeZ: target.z,
    velocity: launchVelocity({ facing, residual, speed, yaw: yawValue, lift: liftValue }),
  });
  for (let i = 0; i < 8; i++) {
    const p = at(yaw, lift);
    if (!p) return null;
    const ex = target.x - p.x, ey = target.y - p.y;
    if (Math.abs(ex) < .01 && Math.abs(ey) < .01) return { yaw, lift };
    const dYaw = at(yaw + .01, lift), dLift = at(yaw, lift + .2);
    if (!dYaw || !dLift) return null;
    const j00 = (dYaw.x - p.x) / .01, j01 = (dLift.x - p.x) / .2;
    const j10 = (dYaw.y - p.y) / .01, j11 = (dLift.y - p.y) / .2;
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-9) return null;
    yaw += clamp((j11 * ex - j01 * ey) / det, -.2, .2);
    lift += clamp((-j10 * ex + j00 * ey) / det, -4, 4);
  }
  const p = at(yaw, lift);
  return p && Math.abs(target.x - p.x) < .05 && Math.abs(target.y - p.y) < .05 ? { yaw, lift } : null;
}

// Steers a shot toward the upper corner on the aimed side of the goal the
// shooter attacks. `shot` is the plain facing-based shot (speed, lift, yaw,
// spin, aim). The pull blends from that shot to the solved corner shot, and the
// corner target carries a small random error that grows with distance, so a
// top-corner attempt can still find the post, the crossbar or nothing at all.
// Shots not facing the goal, from too far, or with no aim are left unchanged.
export function aimAtCorner({ team, position, residual, facing, charge, shot, random = Math.random }) {
  const pull = cornerPull(charge, shot.aim);
  if (pull <= 0) return shot;
  const goalZ = team === 'blue' ? -HALF_L : HALF_L;
  const toGoal = goalZ - position.z;
  if (Math.abs(toGoal) > SHOT_CORNER_MAX_DISTANCE || toGoal * facing.z <= 0) return shot;
  // Where the facing line meets the goal line: it must point at or near the goal.
  const facingX = position.x + facing.x * (toGoal / facing.z);
  if (Math.abs(facingX) > GOAL_HALF_W + SHOT_CORNER_FACING_MARGIN) return shot;

  // The shooter's right is (-facing.z, facing.x); pick the corner on the aimed side.
  const side = Math.sign(shot.aim) * Math.sign(-facing.z);
  const distance = Math.hypot(side * (GOAL_HALF_W - SHOT_CORNER_INSET) - position.x, toGoal);
  const error = clamp(distance / SHOT_CORNER_REFERENCE_DISTANCE, .5, 1.6) * pull;
  const target = {
    x: side * (GOAL_HALF_W - SHOT_CORNER_INSET) + (random() * 2 - 1) * SHOT_CORNER_SCATTER * error,
    y: SHOT_CORNER_HEIGHT + (random() * 2 - 1) * SHOT_CORNER_HEIGHT_SCATTER * error,
    z: goalZ,
  };
  const sideways = (target.x - position.x) * -facing.z + (target.z - position.z) * facing.x;
  const forward = (target.x - position.x) * facing.x + (target.z - position.z) * facing.z;
  const solved = solveShot({ position, residual, facing, speed: shot.speed, spin: shot.spin, target, yaw: Math.atan2(sideways, forward), lift: shot.lift });
  if (!solved) return shot;
  const maxYaw = SHOT_CORNER_MAX_YAW_DEG * degrees;
  return {
    ...shot,
    yaw: shot.yaw + (clamp(solved.yaw, -maxYaw, maxYaw) - shot.yaw) * pull,
    lift: shot.lift + (clamp(solved.lift, 0, SHOT_CORNER_MAX_LIFT) - shot.lift) * pull,
    corner: pull,
  };
}
