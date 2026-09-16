import { recordBallTouch } from './ballTouches.js';
import { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, GOAL_POST_R, BALL_R, PLAYER_R } from '../../shared/field.js';
import * as CANNON from 'cannon-es';
import { MAGNUS_COEFFICIENT, MAGNUS_MIN_SPEED, GOAL_FRAME_RESTITUTION, GOAL_FRAME_FRICTION, PLAYER_COLLISION_HEIGHT,
  GRAVITY, BALL_MASS, BALL_LINEAR_DAMPING, BALL_ANGULAR_DAMPING } from '../core/config.js';
export function buildWorld() {
  const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
  w.broadphase = new CANNON.SAPBroadphase(w);
  w.allowSleep = false;

  const groundMat = new CANNON.Material('ground');
  const ballMat = new CANNON.Material('ball');
  w.addContactMaterial(new CANNON.ContactMaterial(groundMat, ballMat, { friction: 0.25, restitution: 0.45 }));

  const ground = new CANNON.Body({ mass: 0, material: groundMat });
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  w.addBody(ground);

  // No boundary walls: a ball that fully crosses a touchline or a goal line
  // (outside the goal mouth) is out of play (see goalLine.js).

  // Goal frames as real round posts and crossbars (cannon-es cylinders run
  // along Y). Inner post faces sit at ±GOAL_HALF_W and the crossbar underside at
  // GOAL_HEIGHT, matching the rendered goals, so shots can ring off the woodwork.
  const frameMat = new CANNON.Material('goalFrame');
  w.addContactMaterial(new CANNON.ContactMaterial(frameMat, ballMat, { friction: GOAL_FRAME_FRICTION, restitution: GOAL_FRAME_RESTITUTION }));
  const r = GOAL_POST_R;
  for (const end of [1, -1]) {
    const z = end * (HALF_L + r);
    for (const side of [-1, 1]) {
      const post = new CANNON.Body({ mass: 0, material: frameMat });
      post.addShape(new CANNON.Cylinder(r, r, GOAL_HEIGHT + r * 2, 16));
      post.position.set(side * (GOAL_HALF_W + r), (GOAL_HEIGHT + r * 2) / 2, z);
      w.addBody(post);
    }
    const crossbar = new CANNON.Body({ mass: 0, material: frameMat });
    crossbar.addShape(new CANNON.Cylinder(r, r, (GOAL_HALF_W + r * 2) * 2, 16));
    crossbar.quaternion.setFromEuler(0, 0, Math.PI / 2);
    crossbar.position.set(0, GOAL_HEIGHT + r, z);
    w.addBody(crossbar);
  }

  const ball = new CANNON.Body({
    mass: BALL_MASS,
    material: ballMat,
    shape: new CANNON.Sphere(BALL_R),
    linearDamping: BALL_LINEAR_DAMPING,
    angularDamping: BALL_ANGULAR_DAMPING,
  });
  ball.position.set(0, BALL_R, 0);
  w.addBody(ball);

  return { world: w, ball };
}
export function createBallPhysics({ state }) {
function resolvePlayerBallContact(c) {
  if (!c.inMatch || state.ballOwnerId === c.id) return;
  // AI keepers interact through their reach model (actions.js), and nobody
  // blocks a ball passing over their head.
  if (c.isAI && c.position === 'KL') return;
  if (state.ballBody.position.y - BALL_R > PLAYER_COLLISION_HEIGHT) return;
  const dx = state.ballBody.position.x - c.pos.x;
  const dz = state.ballBody.position.z - c.pos.z;
  const dist = Math.hypot(dx, dz);
  const minDist = PLAYER_R + BALL_R;
  if (dist >= minDist || dist < 1e-4) return;

  if (state.ballBody.position.y <= 1.35) recordBallTouch(state, c);
  const nx = dx / dist, nz = dz / dist;
  const overlap = minDist - dist;
  state.ballBody.position.x += nx * overlap;
  state.ballBody.position.z += nz * overlap;

  const relVX = state.ballBody.velocity.x - c.vel.x;
  const relVZ = state.ballBody.velocity.z - c.vel.z;
  const relSpeed = relVX * nx + relVZ * nz;
  if (relSpeed < 0) {
    const restitution = 1.05;
    state.ballBody.velocity.x -= (1 + restitution) * relSpeed * nx;
    state.ballBody.velocity.z -= (1 + restitution) * relSpeed * nz;
  }
  state.ballBody.velocity.x += c.vel.x * 0.3;
  state.ballBody.velocity.z += c.vel.z * 0.3;
}

// Magnus effect from sidespin: F = k · (ω_y ŷ × v_horizontal), applied as a
// velocity change so it is independent of the physics sub-step count. Only the
// vertical spin axis is used: rolling spin from ground contact must not push
// the ball into the turf or lift it. The force scales with ball speed, so the
// curve fades as the ball slows and vanishes for a loose, rolling ball.
function applyMagnus(dt) {
  const ball = state.ballBody;
  if (!ball || state.ballOwnerId) return;
  const spin = ball.angularVelocity.y;
  const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
  if (Math.abs(spin) < 1e-3 || speed < MAGNUS_MIN_SPEED) return;
  const scale = MAGNUS_COEFFICIENT * dt / ball.mass;
  const vx = ball.velocity.x, vz = ball.velocity.z;
  ball.velocity.x += spin * vz * scale;
  ball.velocity.z -= spin * vx * scale;
}

return { resolvePlayerBallContact, applyMagnus };
}
