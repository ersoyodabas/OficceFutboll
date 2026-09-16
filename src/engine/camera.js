import { CAMERA_HEIGHT, CAMERA_SIDE_DISTANCE, CAMERA_FOV } from '../core/config.js';
import { THREE } from '../engine/three.js';
import { HALF_W } from '../../shared/field.js';
export function createCamera({ renderer }) {
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(CAMERA_SIDE_DISTANCE, CAMERA_HEIGHT, 0);
camera.lookAt(-HALF_W * .35, 0.3, 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
const _camLook = new THREE.Vector3(0, .3, 0);
function updateBroadcastCamera(ball) {
  camera.position.set(CAMERA_SIDE_DISTANCE, CAMERA_HEIGHT, ball.position.z);
  _camLook.set(ball.position.x, ball.position.y, ball.position.z);
  camera.lookAt(_camLook);
}

return { camera, updateBroadcastCamera };
}
