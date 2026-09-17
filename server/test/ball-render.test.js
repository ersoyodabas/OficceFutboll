import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../lib/three.min.js';
import { BALL_R } from '../../shared/field.js';

const { createBall } = await import('../../src/gameplay/ball.js');

test('possessed ball shares player interpolation; a released ball resumes velocity prediction without snapping', (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const previousDocument = globalThis.document;
  const context = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {} };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => { globalThis.document = previousDocument; });
  const ball = createBall({ scene: new THREE.Scene() });
  const player = new THREE.Vector3();
  const snapshot = (x) => ({ x: x + .55, y: BALL_R, z: 0, vx: 8.8, vy: 0, vz: 0 });
  ball.applySnapshot(snapshot(0), true, true);
  const dt = 1 / 60;
  for (let step = 1; step <= 60; step++) {
    now += dt * 1000;
    if (step % 3 === 0) ball.applySnapshot(snapshot(step / 60 * 8.8), false, true);
    const latestX = Math.floor(step / 3) * 3 / 60 * 8.8;
    player.lerp(new THREE.Vector3(latestX, 0, 0), Math.min(1, dt * 14));
    ball.update(dt, now);
    assert.ok(Math.abs(ball.mesh.position.x - player.x - .55) < 1e-9, 'snapshot gaps never stretch the dribble offset');
  }
  const before = ball.mesh.position.clone();
  ball.applySnapshot(snapshot(8.8), false, false);
  assert.ok(ball.mesh.position.equals(before), 'release snapshot does not teleport the mesh');
  now += 50;
  ball.update(dt, now);
  const predicted = 8.8 + .55 + 8.8 * .05;
  assert.ok(Math.abs(ball.mesh.position.x - (before.x + (predicted - before.x) * dt * 14)) < 1e-9);
});
