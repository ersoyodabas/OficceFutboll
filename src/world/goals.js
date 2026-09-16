import { TEAM_COLOR } from '../core/config.js';
import { THREE } from '../engine/three.js';
import { FIELD, HALF_W, HALF_L, GOAL_HALF_W } from '../../shared/field.js';
export function createGoals({ scene }) {
// ---------- Walls ----------
const wallMat = new THREE.MeshStandardMaterial({ color: 0x154529, roughness: 0.85 });
function makeSideWall(x) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, HALF_L * 2 + 0.5), wallMat);
  wall.position.set(x, 0.45, 0);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
}
makeSideWall(-HALF_W - 0.15);
makeSideWall(HALF_W + 0.15);

// Boundary walls around the goal mouth (gameplay edge — mirrors the server's
// pitch bounds so the ball visually can't leave except through a goal).
function createBoundaryWalls(z) {
  const segW = (HALF_W * 2 - GOAL_HALF_W * 2) / 2;
  [-1, 1].forEach((side) => {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.9, 0.25), wallMat);
    seg.position.set(side * (HALF_W - segW / 2), 0.45, z);
    seg.castShadow = true;
    scene.add(seg);
  });
}

// A real goal structure: two posts, a crossbar, and a netted back — not just
// a wireframe placeholder box.
function createGoal(z, sign) {
  const GOAL_HEIGHT = FIELD.GOAL_HEIGHT;
  const postR = 0.045;
  const frameColor = sign > 0 ? TEAM_COLOR.blue : TEAM_COLOR.red;
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, emissive: frameColor, emissiveIntensity: 0.15, roughness: 0.4 });

  const group = new THREE.Group();
  [-1, 1].forEach((side) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, GOAL_HEIGHT, 12), postMat);
    post.position.set(side * GOAL_HALF_W, GOAL_HEIGHT / 2, z);
    post.castShadow = true;
    group.add(post);
  });
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, GOAL_HALF_W * 2, 12), postMat);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, GOAL_HEIGHT, z);
  crossbar.castShadow = true;
  group.add(crossbar);

  const netDepth = 1.42;
  const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.45 });
  const backNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HALF_W * 2, GOAL_HEIGHT, 8, 6), netMat);
  backNet.position.set(0, GOAL_HEIGHT / 2, z + sign * netDepth);
  group.add(backNet);
  const topNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HALF_W * 2, netDepth, 8, 6), netMat);
  topNet.rotation.x = Math.PI / 2;
  topNet.position.set(0, GOAL_HEIGHT, z + sign * netDepth / 2);
  group.add(topNet);
  [-1, 1].forEach((side) => {
    const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(netDepth, GOAL_HEIGHT, 6, 6), netMat);
    sideNet.rotation.y = Math.PI / 2;
    sideNet.position.set(side * GOAL_HALF_W, GOAL_HEIGHT / 2, z + sign * netDepth / 2);
    group.add(sideNet);
  });

  scene.add(group);
}

createBoundaryWalls(HALF_L + 0.15);
createBoundaryWalls(-HALF_L - 0.15);
createGoal(HALF_L, 1);
createGoal(-HALF_L, -1);

}
