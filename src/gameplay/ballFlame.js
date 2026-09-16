import { THREE } from '../engine/three.js';
import { makeCanvasTexture } from '../engine/assetLoader.js';
import { createFlameState } from './flameState.js';

// Fire trail for rocket shots: one pooled THREE.Points cloud (additive, no depth
// write) plus a glow sprite on the ball. Particles are emitted along the ball's
// rendered path, drift back from the direction of travel and cool from white-
// yellow to red as they fade. Visual only.
const MAX_PARTICLES = 280;
const PARTICLE_LIFE = 0.28;     // s at full intensity
const EMIT_SPACING = 0.14;      // m of ball travel per particle at full intensity
const MAX_EMIT_PER_FRAME = 48;

export function createBallFlame({ scene, ball, renderer }) {
  const flame = createFlameState();
  const glowTexture = makeCanvasTexture(64, 64, (ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,220,140,0.85)');
    gradient.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });

  const positions = new Float32Array(MAX_PARTICLES * 3);
  const progress = new Float32Array(MAX_PARTICLES).fill(1); // 1 = dead
  const sizes = new Float32Array(MAX_PARTICLES);
  const velocities = new Float32Array(MAX_PARTICLES * 3);
  const ages = new Float32Array(MAX_PARTICLES);
  const lives = new Float32Array(MAX_PARTICLES).fill(1);
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const progressAttribute = new THREE.BufferAttribute(progress, 1).setUsage(THREE.DynamicDrawUsage);
  const sizeAttribute = new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aProgress', progressAttribute);
  geometry.setAttribute('aSize', sizeAttribute);
  const material = new THREE.ShaderMaterial({
    uniforms: { uTexture: { value: glowTexture }, uScale: { value: 800 } },
    vertexShader: `
      attribute float aProgress;
      attribute float aSize;
      uniform float uScale;
      varying float vProgress;
      void main() {
        vProgress = aProgress;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aProgress >= 1.0 ? 0.0 : aSize * (1.0 - aProgress * 0.4) * uScale / -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: `
      uniform sampler2D uTexture;
      varying float vProgress;
      void main() {
        if (vProgress >= 1.0) discard;
        float shape = texture2D(uTexture, gl_PointCoord).a;
        vec3 hot = vec3(1.0, 0.96, 0.72), mid = vec3(1.0, 0.55, 0.1), cool = vec3(0.7, 0.1, 0.02);
        vec3 color = vProgress < 0.4 ? mix(hot, mid, vProgress / 0.4) : mix(mid, cool, (vProgress - 0.4) / 0.6);
        float alpha = shape * (1.0 - vProgress);
        gl_FragColor = vec4(color * alpha, alpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 20;
  scene.add(points);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture, color: 0xff8a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.visible = false;
  glow.renderOrder = 21;
  scene.add(glow);

  let next = 0, carry = 0, alive = 0;
  const lastEmit = new THREE.Vector3();
  let hasLastEmit = false;

  function emit(x, y, z, intensity, dirX, dirY, dirZ) {
    const i = next;
    next = (next + 1) % MAX_PARTICLES;
    const jitter = 0.07 + 0.08 * intensity;
    positions[i * 3] = x + (Math.random() - .5) * jitter;
    positions[i * 3 + 1] = y + (Math.random() - .5) * jitter;
    positions[i * 3 + 2] = z + (Math.random() - .5) * jitter;
    const push = 1.2 + 3 * intensity;
    velocities[i * 3] = -dirX * push + (Math.random() - .5) * .9;
    velocities[i * 3 + 1] = -dirY * push + .5 + Math.random() * .7;
    velocities[i * 3 + 2] = -dirZ * push + (Math.random() - .5) * .9;
    sizes[i] = (0.45 + 0.8 * intensity) * (0.7 + Math.random() * .6);
    lives[i] = PARTICLE_LIFE * (0.65 + Math.random() * .6) * (0.6 + 0.4 * intensity);
    ages[i] = 0;
    progress[i] = 0;
  }

  // Call every rendered frame. playing: normal match play is on screen.
  function update(dt, { now, playing, camera }) {
    const intensity = flame.update({ now, velocity: ball.net.serverVel, playing });
    const position = ball.mesh.position;
    if (intensity > 0) {
      if (!hasLastEmit) { lastEmit.copy(position); hasLastEmit = true; }
      const dx = position.x - lastEmit.x, dy = position.y - lastEmit.y, dz = position.z - lastEmit.z;
      const distance = Math.hypot(dx, dy, dz);
      const spacing = EMIT_SPACING / intensity;
      carry += distance;
      const count = Math.min(MAX_EMIT_PER_FRAME, Math.floor(carry / spacing));
      if (count > 0 && distance > 1e-4) {
        const inv = 1 / distance;
        for (let k = 1; k <= count; k++) {
          const t = k / count;
          emit(lastEmit.x + dx * t, lastEmit.y + dy * t, lastEmit.z + dz * t, intensity, dx * inv, dy * inv, dz * inv);
        }
        carry -= count * spacing;
      }
      lastEmit.copy(position);
      glow.visible = true;
      glow.position.copy(position);
      glow.scale.setScalar(0.7 + 1.1 * intensity);
      glow.material.opacity = 0.55 + 0.45 * intensity;
    } else {
      hasLastEmit = false;
      carry = 0;
      glow.visible = false;
    }

    alive = 0;
    const drag = Math.exp(-dt * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (progress[i] >= 1) continue;
      ages[i] += dt;
      const p = ages[i] / lives[i];
      if (p >= 1) { progress[i] = 1; continue; }
      progress[i] = p;
      positions[i * 3] += velocities[i * 3] * dt;
      positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
      positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
      velocities[i * 3] *= drag; velocities[i * 3 + 1] *= drag; velocities[i * 3 + 2] *= drag;
      alive++;
    }
    points.visible = alive > 0 || intensity > 0;
    if (points.visible) {
      positionAttribute.needsUpdate = true;
      progressAttribute.needsUpdate = true;
      sizeAttribute.needsUpdate = true;
      // Pixels per metre at distance 1, so particle sizes are in metres.
      material.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    }
  }

  function ignite(charge, now) { flame.ignite(charge, now); }
  // Stops emitting; particles already in the air fade out on their own.
  function extinguish() { flame.extinguish(); }
  function clear() {
    flame.extinguish();
    progress.fill(1);
    hasLastEmit = false;
    glow.visible = false;
  }

  return { ignite, extinguish, clear, update, isBurning: flame.isBurning, activeParticles: () => alive };
}
