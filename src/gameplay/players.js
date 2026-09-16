import { PLAYER_ROTATION_SPEED } from '../core/config.js';
import { THREE } from '../engine/three.js';
export function createPlayers({ scene, state, createFootballer, animateFootballer }) {
const entities = new Map();
function removeEntity(e) {
  scene.remove(e.footballer.root);
  scene.remove(e.footballer.tag);
}

function clearEntities() {
  for (const e of entities.values()) removeEntity(e);
  entities.clear();
}

function ensureEntity(id, team, name) {
  let e = entities.get(id);
  if (!e) {
    const number = (hashCode(id) % 23) + 1;
    e = {
      footballer: createFootballer(team, number, name, id === state.myId),
      netPos: new THREE.Vector3(0, 0, 0),
      netVel: new THREE.Vector2(0, 0),
      renderPos: new THREE.Vector3(0, 0, 0),
      team,
    };
    entities.set(id, e);
  }
  return e;
}
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function applySnapshot(players) {
  const seen = new Set();
  for (const p of players) {
    seen.add(p.id);
    const e = ensureEntity(p.id, p.team, p.name);
    e.netPos.set(p.x, 0, p.z);
    e.netVel.set(p.vx, p.vz);
    e.kicking = p.action === 'shot' || p.action === 'pass' || p.action === 'cross';
    e.sliding = !!p.sliding;
    e.hasBall = !!p.hasBall;
    e.facingX = p.facingX;
    e.facingZ = p.facingZ;
  }
  for (const [id, e] of entities) {
    if (!seen.has(id)) { removeEntity(e); entities.delete(id); }
  }

}
function update(dt) {
    for (const [id, e] of entities) {
      e.renderPos.lerp(e.netPos, Math.min(1, dt * 14));
      e.footballer.root.position.set(e.renderPos.x, e.footballer.root.position.y, e.renderPos.z);
      e.footballer.root.position.y = THREE.MathUtils.damp(e.footballer.root.position.y, e.sliding ? .18 : 0, 12, dt);
      e.footballer.tag.position.set(e.renderPos.x, e.footballer.tagOffsetY, e.renderPos.z);
      const spd = e.netVel.length();
      if (Number.isFinite(e.facingX) && Number.isFinite(e.facingZ)) {
        const targetAngle = Math.atan2(e.facingX, e.facingZ);
        let cur = e.footballer.root.rotation.y;
        let diff = Math.atan2(Math.sin(targetAngle - cur), Math.cos(targetAngle - cur));
        e.footballer.root.rotation.y = cur + diff * (1 - Math.exp(-dt * PLAYER_ROTATION_SPEED));
      }
      e.footballer.root.rotation.x = THREE.MathUtils.damp(e.footballer.root.rotation.x, e.sliding ? -1.38 : 0, 15, dt);
      animateFootballer(e.footballer, spd, e.kicking, e.sliding, dt);
    }

}

return { clearEntities, applySnapshot, update };
}
