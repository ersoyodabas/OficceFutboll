import { CAMERA_HEIGHT, CAMERA_SIDE_DISTANCE, CAMERA_FOV } from '../core/config.js';
import { THREE } from '../engine/three.js';
import { HALF_W, HALF_L } from '../../shared/field.js';
export function createCamera({ renderer }) {
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(CAMERA_SIDE_DISTANCE, CAMERA_HEIGHT, 0);
camera.lookAt(0, 0.3, 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
const _camLook = new THREE.Vector3(0, .3, 0);
function updateBroadcastCamera(ball, localPlayer, dt = 1 / 60) {
  // Frame the controlled player and ball as a pair. When they separate, the
  // camera pulls back instead of abandoning the player to follow only the ball.
  const hasPlayer = localPlayer && Number.isFinite(localPlayer.x) && Number.isFinite(localPlayer.z);
  const playerX = hasPlayer ? localPlayer.x : ball.position.x;
  const playerZ = hasPlayer ? localPlayer.z : ball.position.z;
  const separation = Math.hypot(ball.position.x - playerX, ball.position.z - playerZ);
  const extraDistance = THREE.MathUtils.clamp((separation - 8) * .65, 0, 26);
  const targetX = THREE.MathUtils.clamp((ball.position.x + playerX) * .5, -HALF_W * .72, HALF_W * .72);
  const targetZ = THREE.MathUtils.clamp((ball.position.z + playerZ) * .5, -HALF_L + 3, HALF_L - 3);
  const desiredSide = targetX + CAMERA_SIDE_DISTANCE + extraDistance;
  const desiredHeight = CAMERA_HEIGHT + extraDistance * .6;
  const followRate = extraDistance > 0 ? 3.8 : 5.2;

  camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredSide, followRate, dt);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredHeight, followRate, dt);
  camera.position.z = THREE.MathUtils.damp(camera.position.z, targetZ, followRate, dt);
  _camLook.x = THREE.MathUtils.damp(_camLook.x, targetX, followRate, dt);
  _camLook.y = THREE.MathUtils.damp(_camLook.y, .35, followRate, dt);
  _camLook.z = THREE.MathUtils.damp(_camLook.z, targetZ, followRate, dt);
  camera.lookAt(_camLook);
}

return { camera, updateBroadcastCamera };
}
