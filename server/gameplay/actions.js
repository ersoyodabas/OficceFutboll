import { recordBallTouch } from './ballTouches.js';
import { DRIBBLE_OFFSET, DRIBBLE_SPRINT_OFFSET } from '../core/config.js';
import { SERVER } from '../../src/network/protocol.js';
import { POSSESSION_RANGE, ACTION_RANGE, STANDING_TACKLE_RANGE, SLIDE_DURATION, SLIDE_FOOT_OFFSET, SLIDE_BALL_CAPTURE_RADIUS, SLIDE_BALL_CONTROL_OFFSET, ACTION_COOLDOWNS, STANDING_TACKLE_COOLDOWN, SLIDE_TACKLE_COOLDOWN, AI_KEEPER_DISTRIBUTION_DELAY, AI_KEEPER_PASS_DISTANCE,
  SHOT_MIN_SPEED, SHOT_MAX_SPEED, SHOT_SPEED_EXPONENT, SHOT_MIN_LIFT, SHOT_MAX_LIFT, SHOT_LIFT_EXPONENT, SHOT_LIFT_VARIATION_FROM_CHARGE, SHOT_MAX_LIFT_VARIATION,
  SHOT_AIM_RESPONSE, SHOT_AIM_MAX_DEG, MAX_SHOT_SPIN, SHOT_CURL_LAUNCH_ANGLE_DEG, KICK_RETAINED_VELOCITY, SHOT_LIFTOFF_HEIGHT,
  KEEPER_REACTION_MS, KEEPER_MAX_DIVE, KEEPER_BODY_REACH, KEEPER_DIVE_REACH, KEEPER_REACH_HEIGHT, KEEPER_CATCH_MAX_SPEED,
  KEEPER_PARRY_RESTITUTION, KEEPER_COLLECT_RANGE, KEEPER_COLLECT_MAX_SPEED, KEEPER_BODY_DEPTH } from '../core/config.js';
import { shotChargeLevel, SHOT_MAX_CHARGE_MS } from '../../shared/shot.js';
import { BALL_R, HALF_L, GOAL_HALF_W } from '../../shared/field.js';
import { isTeleport } from './goalLine.js';
import { aimAtCorner } from './shotAim.js';
import * as CANNON from 'cannon-es';
export function createActions({ state, broadcast }) {
function ballDistance(c) {
  return Math.hypot(state.ballBody.position.x - c.pos.x, state.ballBody.position.z - c.pos.z);
}

function hasBall(c) {
  return state.ballOwnerId === c.id && ballDistance(c) < POSSESSION_RANGE * 1.9 && state.ballBody.position.y < 1.15;
}

function releaseBall(duration = 280) {
  const owner = state.clients.get(state.ballOwnerId);
  if (owner?.isAI) owner.keeperPossessionStartedAt = 0;
  state.ballOwnerId = null;
  state.looseBallUntil = Date.now() + duration;
}

// Every kick starts from a clean spin state; only shots add sidespin afterwards.
function applyBallImpulse(x, y, z) {
  state.ballBody.velocity.scale(KICK_RETAINED_VELOCITY, state.ballBody.velocity);
  state.ballBody.angularVelocity.set(0, 0, 0);
  state.ballBody.applyImpulse(new CANNON.Vec3(x * state.ballBody.mass, y * state.ballBody.mass, z * state.ballBody.mass));
}

// ---------- Charged shots ----------
// The client only reports that S went down (start) and up (release). Charge,
// power, direction and spin are all derived here from the server clock, the
// shooter's facing and their held input, so a browser cannot claim more power.
const degrees = Math.PI / 180;

// Player-relative lateral input: +1 = the shooter's right, -1 = their left.
function lateralInput(c) {
  const input = c.input || { x: 0, z: 0 };
  const length = Math.hypot(input.x, input.z);
  if (length < 0.01) return 0;
  return (-input.x * c.facing.z + input.z * c.facing.x) / length;
}

// Charge (0..1) sets speed and lift; aim intent (-1 left .. +1 right, relative
// to the shooter) turns the shot a few degrees from the facing. There is no
// random sideways deviation: a straight-facing shot with no aim input goes
// straight. Only the lift of near-full-power strikes varies, so rockets can fly
// over the bar. With enough charge, shoot() then steers aimed shots toward an
// upper corner (shotAim.js).
function shotParameters(charge, aimIntent, random = Math.random) {
  const level = Math.min(Math.max(charge, 0), 1);
  const aim = Math.min(Math.max(aimIntent, -1), 1);
  const variation = Math.max(0, (level - SHOT_LIFT_VARIATION_FROM_CHARGE) / (1 - SHOT_LIFT_VARIATION_FROM_CHARGE));
  const baseLift = SHOT_MIN_LIFT + (SHOT_MAX_LIFT - SHOT_MIN_LIFT) * Math.pow(level, SHOT_LIFT_EXPONENT);
  return {
    speed: SHOT_MIN_SPEED + (SHOT_MAX_SPEED - SHOT_MIN_SPEED) * Math.pow(level, SHOT_SPEED_EXPONENT),
    lift: baseLift * (1 + (random() * 2 - 1) * variation * SHOT_MAX_LIFT_VARIATION),
    // Launched just inside the aim line; the sidespin curls it out to the aim.
    yaw: aim * (SHOT_AIM_MAX_DEG - SHOT_CURL_LAUNCH_ANGLE_DEG) * degrees,
    // Positive spin about +Y curves the ball to the shooter's left, so aiming right spins negative.
    spin: -aim * MAX_SHOT_SPIN,
    aim,
  };
}

function cancelShotCharge(c) {
  if (!c.shotCharge) return;
  c.shotCharge = null;
  broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action: 'shot_cancel', success: false, hasBall: hasBall(c) });
}

function canAct(c, key, now) {
  return c.inMatch && state.phase === 'playing' && state.ballBody && now >= c.cooldowns[key] && c.slideRemaining <= 0 && c.recoveryRemaining <= 0;
}

// A player on the ball can always start charging: the S cooldown only limits
// tackles and repeated taps, and possession itself limits shooting.
function canCharge(c) {
  return c.inMatch && state.phase === 'playing' && state.ballBody && c.slideRemaining <= 0 && c.recoveryRemaining <= 0;
}

function startShotCharge(c) {
  const now = Date.now();
  if (c.shotCharge) return;
  if (!canCharge(c) || (!hasBall(c) && !canAct(c, 'S', now))) {
    // Resolve the client's immediate wind-up even when this press is rejected.
    broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action: 'shot_cancel', success: false, hasBall: false });
    return;
  }
  // Without the ball, S keeps meaning a standing tackle.
  if (!hasBall(c) || ballDistance(c) > ACTION_RANGE) { performAction(c, 'S'); return; }
  // Left/right already held when S goes down counts as aim straight away.
  c.shotCharge = { startedAt: now, aim: lateralInput(c) };
  // Server time confirms the charge; the local bar stays anchored to keydown.
  broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action: 'shot_charge', success: true, hasBall: true, startedAt: now });
}

function releaseShot(c) {
  if (!c.shotCharge) return;
  const now = Date.now();
  const charge = shotChargeLevel(now - c.shotCharge.startedAt);
  const aim = c.shotCharge.aim;
  if (!canCharge(c) || !hasBall(c) || ballDistance(c) > ACTION_RANGE) { cancelShotCharge(c); return; }
  c.shotCharge = null;
  shoot(c, charge, aim, now);
}

function shoot(c, charge, aim, now) {
  const ball = state.ballBody;
  // The struck ball leaves the grass at once instead of scraping along it.
  ball.position.y = Math.max(ball.position.y, BALL_R + SHOT_LIFTOFF_HEIGHT);
  const shot = aimAtCorner({
    team: c.team, charge, shot: shotParameters(charge, aim), facing: c.facing,
    position: { x: ball.position.x, y: ball.position.y, z: ball.position.z },
    residual: { x: ball.velocity.x, y: ball.velocity.y, z: ball.velocity.z },
  });
  const cos = Math.cos(shot.yaw), sin = Math.sin(shot.yaw);
  // Rotate the facing toward the shooter's right by yaw (right = (-fz, fx)).
  const dirX = c.facing.x * cos - c.facing.z * sin;
  const dirZ = c.facing.z * cos + c.facing.x * sin;
  recordBallTouch(state, c, true);
  applyBallImpulse(dirX * shot.speed, shot.lift, dirZ * shot.speed);
  state.ballBody.angularVelocity.set(0, shot.spin, 0);
  releaseBall(450);
  c.cooldowns.S = now + ACTION_COOLDOWNS.S * 1000;
  c.lastAction = { type: 'shot', at: now };
  broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action: 'shot', success: true, hasBall: true, charge, speed: shot.speed, lift: shot.lift, aim: shot.aim, spin: shot.spin });
}

// Keeps charges honest every tick: a lost ball, slide or phase change cancels
// the charge, held left/right input steers the aim intent within [-1, 1], and
// a charge held for the full SHOT_MAX_CHARGE_MS fires at maximum power.
function updateShotCharges(dt) {
  const now = Date.now();
  for (const c of state.clients.values()) {
    if (!c.shotCharge) continue;
    if (state.phase !== 'playing' || !c.inMatch || c.slideRemaining > 0 || !hasBall(c)) { cancelShotCharge(c); continue; }
    const blend = 1 - Math.exp(-dt * SHOT_AIM_RESPONSE);
    c.shotCharge.aim = Math.min(1, Math.max(-1, c.shotCharge.aim + (lateralInput(c) - c.shotCharge.aim) * blend));
    if (now - c.shotCharge.startedAt >= SHOT_MAX_CHARGE_MS) releaseShot(c);
  }
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
  c.turnRate = 0;
}

function secureBallForKeeper(c) {
  const direction = { x: 0, z: c.team === 'blue' ? -1 : 1 };
  recordBallTouch(state, c, true);
  state.ballOwnerId = c.id;
  state.looseBallUntil = 0;
  state.ballBody.position.set(
    c.pos.x + direction.x * SLIDE_BALL_CONTROL_OFFSET,
    BALL_R,
    c.pos.z + direction.z * SLIDE_BALL_CONTROL_OFFSET
  );
  state.ballBody.velocity.set(0, 0, 0);
  state.ballBody.angularVelocity.set(0, 0, 0);
  c.facing = direction;
  c.vel.x = 0;
  c.vel.z = 0;
  c.slideRemaining = 0;
  c.slideDirection = null;
  c.recoveryRemaining = 0;
  c.keeperPossessionStartedAt = Date.now();
}

function captureBallWithSlide(c) {
  if (!c.inMatch || c.slideRemaining <= 0 || state.ballBody.position.y > 1.1) return false;

  const direction = c.slideDirection || c.facing;
  const footX = c.pos.x + direction.x * SLIDE_FOOT_OFFSET;
  const footZ = c.pos.z + direction.z * SLIDE_FOOT_OFFSET;
  const distanceToFoot = Math.hypot(state.ballBody.position.x - footX, state.ballBody.position.z - footZ);
  if (distanceToFoot > SLIDE_BALL_CAPTURE_RADIUS) return false;

  const newlyCaptured = state.ballOwnerId !== c.id;
  const isAIKeeper = c.isAI && c.position === 'KL';
  if (isAIKeeper) {
    secureBallForKeeper(c);
    return newlyCaptured;
  }
  recordBallTouch(state, c, true);
  state.ballOwnerId = c.id;
  state.looseBallUntil = 0;
  state.ballBody.position.x = c.pos.x + direction.x * SLIDE_BALL_CONTROL_OFFSET;
  state.ballBody.position.y = BALL_R;
  state.ballBody.position.z = c.pos.z + direction.z * SLIDE_BALL_CONTROL_OFFSET;
  state.ballBody.velocity.set(c.vel.x, 0, c.vel.z);
  state.ballBody.angularVelocity.set(0, 0, 0);
  return newlyCaptured;
}

function keeperDistributionTarget(keeper) {
  const teammates = Array.from(state.clients.values()).filter((candidate) => (
    candidate.inMatch && candidate.team === keeper.team && candidate.id !== keeper.id && !candidate.isAI
  ));
  if (!teammates.length) return null;
  const attackSign = keeper.team === 'blue' ? -1 : 1;
  return teammates.reduce((best, candidate) => {
    const distance = Math.hypot(candidate.pos.x - keeper.pos.x, candidate.pos.z - keeper.pos.z);
    const progress = candidate.pos.z * attackSign;
    const score = progress - distance * .12;
    return !best || score > best.score ? { player: candidate, score } : best;
  }, null).player;
}

function updateAIKeeperPossession(keeper, dt) {
  const now = Date.now();
  if (!keeper.keeperPossessionStartedAt) keeper.keeperPossessionStartedAt = now;
  const teammate = keeperDistributionTarget(keeper);
  const fallbackZ = keeper.team === 'blue' ? keeper.pos.z - 20 : keeper.pos.z + 20;
  const targetX = teammate?.pos.x ?? 0;
  const targetZ = teammate?.pos.z ?? fallbackZ;
  const dx = targetX - keeper.pos.x;
  const dz = targetZ - keeper.pos.z;
  const distance = Math.hypot(dx, dz) || 1;
  const direction = { x: dx / distance, z: dz / distance };
  keeper.facing = direction;
  keeper.vel.x = 0;
  keeper.vel.z = 0;

  const targetBallX = keeper.pos.x + direction.x * .72;
  const targetBallZ = keeper.pos.z + direction.z * .72;
  const blend = 1 - Math.exp(-dt * 18);
  state.ballBody.position.x += (targetBallX - state.ballBody.position.x) * blend;
  state.ballBody.position.z += (targetBallZ - state.ballBody.position.z) * blend;
  state.ballBody.position.y = BALL_R;
  state.ballBody.velocity.set(0, 0, 0);
  state.ballBody.angularVelocity.set(0, 0, 0);

  if (now - keeper.keeperPossessionStartedAt < AI_KEEPER_DISTRIBUTION_DELAY * 1000) return;
  const action = distance > AI_KEEPER_PASS_DISTANCE ? 'cross' : 'pass';
  recordBallTouch(state, keeper, true);
  if (action === 'cross') applyBallImpulse(direction.x * 18, 4.2, direction.z * 18);
  else applyBallImpulse(direction.x * 15, .55, direction.z * 15);
  releaseBall(650);
  keeper.lastAction = { type: action, at: now };
  broadcast({ type: SERVER.ACTION_RESULT, id: keeper.id, action, success: true, hasBall: true });
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
  recordBallTouch(state, c);
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
    // A plain S action (no charge messages) is an uncharged, straight tap shot.
    if (key === 'S') { c.shotCharge = null; shoot(c, 0, 0, now); return; }
    recordBallTouch(state, c, true);
    if (key === 'A') { action = 'pass'; applyBallImpulse(c.facing.x * 16, .35, c.facing.z * 16); }
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
  if (state.phase !== 'playing') return;
  if (state.ballOwnerId) {
    const owner = state.clients.get(state.ballOwnerId);
    if (!owner || !owner.inMatch || !hasBall(owner)) {
      releaseBall(180);
    } else if (owner.isAI && owner.position === 'KL') {
      updateAIKeeperPossession(owner, dt);
    } else {
      recordBallTouch(state, owner, true);
      const sliding = owner.slideRemaining > 0;
      const sprinting = !sliding && !!owner.input.sprint;
      const offset = sliding ? SLIDE_BALL_CONTROL_OFFSET : (sprinting ? DRIBBLE_SPRINT_OFFSET : DRIBBLE_OFFSET);
      const response = sliding ? 18 : (sprinting ? 10 : 12);
      const blend = 1 - Math.exp(-dt * (sliding ? 22 : (sprinting ? 18 : 20)));
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
      // AI keepers use their own reach model below instead of a pickup radius.
      if (!c.inMatch || c.slideRemaining > 0 || isAIKeeper(c)) continue;
      const dist = ballDistance(c);
      if (dist < best) { nearest = c; best = dist; }
    }
    if (nearest) { state.ballOwnerId = nearest.id; recordBallTouch(state, nearest, true); }
  }
  for (const c of state.clients.values()) {
    if (c.standingActive > 0 && attemptTackle(c, false)) {
      c.standingActive = 0;
      broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action: 'standing_tackle', success: true, hasBall: false });
    }
    if (c.slideRemaining > 0 && attemptTackle(c, true)) {
      broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action: 'slide_tackle', success: true, hasBall: false });
    }
    if (isAIKeeper(c)) updateKeeperAgainstBall(c);
  }
}

// ---------- AI goalkeeper: a body with limited reach, not a wall ----------
function isAIKeeper(c) { return c.isAI && c.position === 'KL' && c.inMatch; }
function goalSignFor(c) { return c.team === 'blue' ? 1 : -1; } // blue defends +Z

// Reads a loose ball heading for the keeper's goal. After KEEPER_REACTION_MS
// the keeper dives toward where the ball will cross the line, at most
// KEEPER_MAX_DIVE from where the shot was first read (movement: playerManager).
function readShot(c, now) {
  const ball = state.ballBody;
  const sign = goalSignFor(c);
  if (state.ballOwnerId || ball.velocity.z * sign < 6) {
    if (c.keeperDive && now > c.keeperDive.until) c.keeperDive = null;
    return;
  }
  const time = (sign * HALF_L - ball.position.z) / ball.velocity.z;
  if (!(time > 0 && time < 1.6)) return;
  const crossX = ball.position.x + ball.velocity.x * time;
  if (Math.abs(crossX) > GOAL_HALF_W + 1.5) return; // clearly wide: no dive
  if (!c.keeperDive) c.keeperDive = { originX: c.pos.x, startsAt: now + KEEPER_REACTION_MS, targetX: c.pos.x, until: now };
  const dive = c.keeperDive;
  dive.targetX = Math.max(dive.originX - KEEPER_MAX_DIVE, Math.min(dive.originX + KEEPER_MAX_DIVE, crossX));
  dive.until = now + 400;
}

// Closest approach of the ball's path this tick to the keeper's vertical body
// axis, so a fast shot cannot skip through the keeper between two ticks.
// `approaching` is true when the ball is still getting closer at the end of the
// tick, i.e. its closest approach has not happened yet.
function closestApproach(c) {
  const ball = state.ballBody.position, prev = state.ballPrevPosition;
  if (!prev || isTeleport(prev, ball, 1 / 60)) {
    return { horizontal: Math.hypot(ball.x - c.pos.x, ball.z - c.pos.z), x: ball.x, y: ball.y, z: ball.z, approaching: false };
  }
  const dx = ball.x - prev.x, dz = ball.z - prev.z, lengthSq = dx * dx + dz * dz;
  const raw = lengthSq > 1e-9 ? ((c.pos.x - prev.x) * dx + (c.pos.z - prev.z) * dz) / lengthSq : 1;
  const t = Math.min(1, Math.max(0, raw));
  const x = prev.x + dx * t, z = prev.z + dz * t, y = prev.y + (ball.y - prev.y) * t;
  return { horizontal: Math.hypot(x - c.pos.x, z - c.pos.z), x, y, z, approaching: raw > 1 };
}

function keeperHolds(c, now) {
  secureBallForKeeper(c);
  c.keeperDive = null;
  c.lastAction = { type: 'save', at: now };
  broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action: 'save', success: true, hasBall: false });
}

function updateKeeperAgainstBall(c) {
  const now = Date.now();
  readShot(c, now);
  if (state.ballOwnerId) return;
  // looseBallUntil stops whoever just kicked the ball from playing it again at
  // once. It must not blind the keeper to a shot (a rocket from 16 m arrives
  // before it ends); only the keeper's own parry or distribution is off limits.
  const lockedOut = now < state.looseBallUntil;
  if (lockedOut && state.lastTouches[c.team]?.id === c.id) return;
  const ball = state.ballBody;
  const speed = ball.velocity.length();

  // Slow loose balls near the keeper (back-passes, rebounds) are gathered.
  if (!lockedOut && speed <= KEEPER_COLLECT_MAX_SPEED && ballDistance(c) <= KEEPER_COLLECT_RANGE && ball.position.y < .75) {
    keeperHolds(c, now);
    return;
  }
  const approach = closestApproach(c);
  const diving = c.keeperDive && now >= c.keeperDive.startsAt;
  const reach = (diving ? KEEPER_DIVE_REACH : KEEPER_BODY_REACH) + BALL_R;
  const atBody = approach.horizontal <= KEEPER_BODY_REACH + BALL_R;
  if (approach.horizontal > reach || approach.y - BALL_R > KEEPER_REACH_HEIGHT) return;
  // Nothing behind the keeper (goal side) is reachable once it has gone past.
  if ((approach.z - c.pos.z) * goalSignFor(c) > KEEPER_BODY_DEPTH) return;
  // A ball still closing in is judged at its true closest approach (a later
  // tick) unless it has already reached the body.
  if (approach.approaching && !atBody) return;

  // Balls into the body/hands at a catchable pace are held; balls only reached
  // at full stretch, or struck too hard, are parried away from goal.
  if (speed <= KEEPER_CATCH_MAX_SPEED * (atBody ? 1 : .5)) {
    keeperHolds(c, now);
    return;
  }
  const sign = goalSignFor(c);
  recordBallTouch(state, c);
  const side = approach.horizontal > 1e-3 ? (approach.x - c.pos.x) / approach.horizontal : (ball.velocity.x >= 0 ? 1 : -1);
  ball.position.set(approach.x, Math.max(BALL_R, approach.y), approach.z - sign * .05);
  const rebound = Math.abs(ball.velocity.z) * KEEPER_PARRY_RESTITUTION;
  ball.velocity.set(ball.velocity.x * .35 + side * speed * .22, Math.max(ball.velocity.y * .4, 1.5), -sign * rebound);
  ball.angularVelocity.set(0, 0, 0);
  state.ballPrevPosition = { x: ball.position.x, y: ball.position.y, z: ball.position.z };
  state.looseBallUntil = now + 300;
  c.keeperDive = null;
  c.lastAction = { type: 'save', at: now };
  broadcast({ type: SERVER.ACTION_RESULT, id: c.id, action: 'parry', success: true, hasBall: false });
}

return { releaseBall, performAction, updateBallControl, startShotCharge, releaseShot, cancelShotCharge, updateShotCharges, shotParameters };
}
