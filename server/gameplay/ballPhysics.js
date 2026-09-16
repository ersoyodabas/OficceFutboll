import { recordBallTouch } from './ballTouches.js';
import { HALF_W, HALF_L, GOAL_HALF_W, GOAL_HEIGHT, BALL_R, PLAYER_R } from '../../shared/field.js';
import * as CANNON from 'cannon-es';
export function buildWorld() {
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
export function createBallPhysics({ state }) {
function resolvePlayerBallContact(c) {
  if (!c.inMatch || state.ballOwnerId === c.id) return;
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

return { resolvePlayerBallContact };
}
