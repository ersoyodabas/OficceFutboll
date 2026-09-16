import { BALL_VISUAL_SCALE } from '../core/config.js';
import { THREE } from '../engine/three.js';
import { BALL_R } from '../../shared/field.js';
import { makeCanvasTexture } from '../engine/assetLoader.js';
export function createBall({ scene }) {
const ballTex = makeCanvasTexture(256, 256, (ctx, s) => {
  ctx.fillStyle = '#f5f5ed';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#a7aaa7'; ctx.lineWidth = 3;
  ctx.fillStyle = '#172028';
  for (let yy = -1; yy < 4; yy++) {
    for (let xx = -1; xx < 5; xx++) {
      const cx = xx * 72 + (yy % 2 ? 36 : 0), cy = yy * 72;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI / 2 + i * Math.PI * 2 / 5;
        const px = cx + Math.cos(angle) * 20, py = cy + Math.sin(angle) * 20;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
});
ballTex.colorSpace = THREE.SRGBColorSpace;
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 24, 24),
  new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.5 })
);
ball.castShadow = true;
ball.position.set(0, BALL_R, 0);
// rendering scale only — server physics still uses BALL_R for its collider
ball.scale.setScalar(BALL_VISUAL_SCALE);
scene.add(ball);
const ballNet = { serverPos: new THREE.Vector3(0, BALL_R, 0), serverVel: new THREE.Vector3(), lastUpdate: performance.now() };
const _predicted = new THREE.Vector3();
function update(dt, now) {
    const elapsed = (now - ballNet.lastUpdate) / 1000;
    _predicted.set(
      ballNet.serverPos.x + ballNet.serverVel.x * elapsed,
      Math.max(BALL_R, ballNet.serverPos.y + ballNet.serverVel.y * elapsed),
      ballNet.serverPos.z + ballNet.serverVel.z * elapsed
    );
    ball.position.lerp(_predicted, Math.min(1, dt * 14));
    const ballSpeed = ballNet.serverVel.length();
    if (ballSpeed > 0.05) {
      const axis = new THREE.Vector3(-ballNet.serverVel.z, 0, ballNet.serverVel.x).normalize();
      ball.rotateOnWorldAxis(axis, (ballSpeed * dt) / BALL_R);
    }

}
function applySnapshot(snapshot, snap = false) {
ballNet.serverPos.set(snapshot.x, snapshot.y, snapshot.z);
ballNet.serverVel.set(snapshot.vx, snapshot.vy, snapshot.vz);
ballNet.lastUpdate = performance.now();
if (snap) { ball.position.copy(ballNet.serverPos); ball.quaternion.set(0, 0, 0, 1); }
}
function reset() { ballNet.serverPos.set(0, BALL_R, 0); ballNet.serverVel.set(0, 0, 0); }
return { mesh: ball, net: ballNet, update, applySnapshot, reset };
}
