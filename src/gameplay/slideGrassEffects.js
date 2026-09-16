import { THREE } from '../engine/three.js';

const GRASS_CAPACITY = 320;
const SOIL_CAPACITY = 140;

export function createSlideGrassEffects({ scene }) {
  const dummy = new THREE.Object3D();

  function createPool(geometry, material, capacity) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    scene.add(mesh);

    const particles = Array.from({ length: capacity }, () => ({ active: false }));
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    return { mesh, particles, cursor: 0 };
  }

  const grass = createPool(
    new THREE.ConeGeometry(.052, .34, 3),
    new THREE.MeshBasicMaterial({ color: 0x91d052, side: THREE.DoubleSide }),
    GRASS_CAPACITY
  );
  const soil = createPool(
    new THREE.TetrahedronGeometry(.075, 0),
    new THREE.MeshBasicMaterial({ color: 0x9a6637 }),
    SOIL_CAPACITY
  );

  function randomBetween(min, max) { return min + Math.random() * (max - min); }

  function spawn(pool, origin, facing, playerVelocity, kind, strength = 1) {
    const index = pool.cursor;
    pool.cursor = (pool.cursor + 1) % pool.particles.length;
    const particle = pool.particles[index];
    const lateralX = facing.z;
    const lateralZ = -facing.x;
    const lateral = randomBetween(-1, 1);
    const backwardSpeed = randomBetween(1.8, kind === 'grass' ? 5.4 : 4.1) * strength;
    const sideSpeed = lateral * randomBetween(1.1, 3.5) * strength;

    particle.active = true;
    particle.position = new THREE.Vector3(
      origin.x - facing.x * randomBetween(.18, .55) * Math.max(.55, strength) + lateralX * lateral * .38 * strength,
      randomBetween(.04, .16) * Math.max(.65, strength),
      origin.z - facing.z * randomBetween(.18, .55) * Math.max(.55, strength) + lateralZ * lateral * .38 * strength
    );
    particle.velocity = new THREE.Vector3(
      -facing.x * backwardSpeed + lateralX * sideSpeed + playerVelocity.x * .12,
      randomBetween(kind === 'grass' ? 1.7 : 1.2, kind === 'grass' ? 4.2 : 3.1) * strength,
      -facing.z * backwardSpeed + lateralZ * sideSpeed + playerVelocity.z * .12
    );
    particle.rotation = new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    particle.spin = new THREE.Vector3(randomBetween(-11, 11), randomBetween(-13, 13), randomBetween(-11, 11));
    particle.life = particle.maxLife = randomBetween(kind === 'grass' ? .7 : .42, kind === 'grass' ? 1.25 : .8) * Math.max(.62, strength);
    particle.size = randomBetween(kind === 'grass' ? .7 : .65, kind === 'grass' ? 1.45 : 1.25) * Math.max(.48, strength);
    particle.bounced = false;
  }

  function emit(origin, facing, playerVelocity, grassCount, soilCount, strength = 1) {
    for (let i = 0; i < grassCount; i++) spawn(grass, origin, facing, playerVelocity, 'grass', strength);
    for (let i = 0; i < soilCount; i++) spawn(soil, origin, facing, playerVelocity, 'soil', strength);
  }

  function burst(origin, facing, playerVelocity) {
    emit(origin, facing, playerVelocity, 34, 12);
  }

  function trail(origin, facing, playerVelocity) {
    emit(origin, facing, playerVelocity, 2, Math.random() < .55 ? 1 : 0);
  }

  function sprintKick(origin, facing, playerVelocity, footSide) {
    const lateralX = facing.z;
    const lateralZ = -facing.x;
    const footOrigin = {
      x: origin.x + lateralX * footSide * .16,
      z: origin.z + lateralZ * footSide * .16,
    };
    emit(footOrigin, facing, playerVelocity, 1, Math.random() < .38 ? 2 : 1, .58);
  }

  function updatePool(pool, dt) {
    for (let i = 0; i < pool.particles.length; i++) {
      const particle = pool.particles[i];
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        pool.mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      particle.velocity.y -= 9.8 * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      if (particle.position.y < .035) {
        particle.position.y = .035;
        if (!particle.bounced && particle.velocity.y < -.7) particle.velocity.y *= -.24;
        else particle.velocity.y = 0;
        particle.velocity.x *= Math.pow(.06, dt);
        particle.velocity.z *= Math.pow(.06, dt);
        particle.bounced = true;
      }
      particle.rotation.x += particle.spin.x * dt;
      particle.rotation.y += particle.spin.y * dt;
      particle.rotation.z += particle.spin.z * dt;

      const appear = Math.min(1, (particle.maxLife - particle.life) / .08);
      const disappear = Math.min(1, particle.life / .22);
      const scale = particle.size * appear * disappear;
      dummy.position.copy(particle.position);
      dummy.rotation.copy(particle.rotation);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      pool.mesh.setMatrixAt(i, dummy.matrix);
    }
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  function update(dt) {
    updatePool(grass, dt);
    updatePool(soil, dt);
  }

  function clear() {
    for (const pool of [grass, soil]) {
      for (let i = 0; i < pool.particles.length; i++) {
        pool.particles[i].active = false;
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        pool.mesh.setMatrixAt(i, dummy.matrix);
      }
      pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  return { burst, trail, sprintKick, update, clear };
}
