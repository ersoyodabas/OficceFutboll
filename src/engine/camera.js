import { CAMERA_DISTANCE, CAMERA_HEIGHT, CAMERA_TILT_DEG, CAMERA_HFOV_DEG, CAMERA_MIN_VFOV_DEG, CAMERA_PAN_LIMIT } from '../core/config.js';
import { THREE } from '../engine/three.js';
import { HALF_L } from '../../shared/field.js';

const { degToRad, radToDeg, damp, clamp } = THREE.MathUtils;
// Ground point the camera looks at, from its height and tilt.
const LOOK_X = CAMERA_DISTANCE - CAMERA_HEIGHT / Math.tan(degToRad(CAMERA_TILT_DEG));

export function createCamera({ renderer }) {
const camera = new THREE.PerspectiveCamera(CAMERA_MIN_VFOV_DEG, window.innerWidth / window.innerHeight, 1, 400);

// Keep the calibrated horizontal view on any aspect ratio; taller windows see
// more of the stands instead of less of the pitch.
function baseFov() {
  const fromHorizontal = radToDeg(2 * Math.atan(Math.tan(degToRad(CAMERA_HFOV_DEG / 2)) / camera.aspect));
  return Math.max(CAMERA_MIN_VFOV_DEG, fromHorizontal);
}
function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = baseFov();
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

const look = new THREE.Vector3(LOOK_X, 0, 0);
camera.position.set(CAMERA_DISTANCE, CAMERA_HEIGHT, 0);
camera.lookAt(look);
resize();

let mode = 'normal', goalPosition = null, kickoffRemaining = 0;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function beginGoal(position) { mode = 'goal'; goalPosition = position; }
function beginKickoff() { mode = 'kickoff'; kickoffRemaining = 1.4; }
function resetMode() { mode = 'normal'; goalPosition = null; kickoffRemaining = 0; }

function frame(targetZ, zoom, rate, dt) {
  const z = clamp(targetZ, -CAMERA_PAN_LIMIT, CAMERA_PAN_LIMIT);
  look.z = damp(look.z, z, rate, dt);
  camera.position.set(CAMERA_DISTANCE, CAMERA_HEIGHT, look.z);
  camera.lookAt(look);
  const fov = baseFov() * zoom;
  if (Math.abs(camera.fov - fov) > .01) {
    camera.fov = damp(camera.fov, fov, 3, dt);
    camera.updateProjectionMatrix();
  }
}

function updateBroadcastCamera(ball, localPlayer, dt = 1 / 60) {
  if (mode !== 'normal') {
    const goal = mode === 'goal' && goalPosition;
    const rate = reducedMotion.matches ? 5 : 2.8;
    // Goals tighten the shot slightly on the scoring end; kickoffs recentre.
    frame(goal ? clamp(goalPosition.z, -HALF_L, HALF_L) : 0, goal && !reducedMotion.matches ? .82 : 1, rate, dt);
    if (mode === 'kickoff' && (kickoffRemaining -= dt) <= 0) resetMode();
    return;
  }
  // Pan to keep the controlled player and the ball in shot together; widen the
  // lens a little when they are far apart along the pitch.
  const hasPlayer = localPlayer && Number.isFinite(localPlayer.z);
  const playerZ = hasPlayer ? localPlayer.z : ball.position.z;
  const separation = Math.abs(ball.position.z - playerZ);
  const zoom = 1 + clamp((separation - 22) / 30, 0, .35);
  frame((ball.position.z + playerZ) / 2, zoom, 3.2, dt);
}

return { camera, updateBroadcastCamera, beginGoal, beginKickoff, resetMode };
}
