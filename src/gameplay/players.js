import { getKit } from '../../shared/clubs.js';
import { PLAYER_ROTATION_SPEED } from '../core/config.js';
import { THREE } from '../engine/three.js';
import { createSlideGrassEffects } from './slideGrassEffects.js';
export function createPlayers({ scene, state, createFootballer, animateFootballer }) {
const entities = new Map();
const slideGrass = createSlideGrassEffects({ scene });
function removeEntity(e) {
  scene.remove(e.footballer.root);
  scene.remove(e.footballer.tag);
}

function clearEntities() {
  for (const e of entities.values()) removeEntity(e);
  entities.clear();
  slideGrass.clear();
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
      wasSliding: false,
      grassEmitAccumulator: 0,
      sprintEmitAccumulator: 0,
      sprintFootSide: -1,
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

function applySnapshot(players, snap = false) {
  if (snap) slideGrass.clear();
  const seen = new Set();
  for (const p of players) {
    seen.add(p.id);
    const e = ensureEntity(p.id, p.team, p.name);
    const kit = getKit(state.teams?.[p.team]?.clubId, state.teams?.[p.team]?.kitId);
    if (kit) e.footballer.applyKit(kit);
    e.netPos.set(p.x, 0, p.z);
    if (snap) {
      e.renderPos.copy(e.netPos); e.footballer.root.position.copy(e.netPos);
      e.footballer.body.rotation.x = 0; e.footballer.body.position.y = 0;
      e.wasSliding = false; e.grassEmitAccumulator = e.sprintEmitAccumulator = 0;
    }
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
      e.footballer.root.position.set(e.renderPos.x, 0, e.renderPos.z);
      e.footballer.body.position.y = THREE.MathUtils.damp(e.footballer.body.position.y, e.sliding ? .18 : 0, 12, dt);
      e.footballer.tag.position.set(e.renderPos.x, e.footballer.tagOffsetY, e.renderPos.z);
      const spd = e.netVel.length();
      const sprinting = !e.sliding && spd > 8.6;
      if (Number.isFinite(e.facingX) && Number.isFinite(e.facingZ)) {
        const targetAngle = Math.atan2(e.facingX, e.facingZ);
        const cur = e.footballer.root.rotation.y;
        const diff = Math.atan2(Math.sin(targetAngle - cur), Math.cos(targetAngle - cur));
        e.footballer.root.rotation.y = cur + diff * (1 - Math.exp(-dt * PLAYER_ROTATION_SPEED));
      }
      e.footballer.body.rotation.x = THREE.MathUtils.damp(e.footballer.body.rotation.x, e.sliding ? -1.38 : sprinting ? .2 : 0, 15, dt);
      animateFootballer(e.footballer, spd, e.kicking, e.sliding, sprinting, dt);

      const facingLength = Math.hypot(e.facingX, e.facingZ) || 1;
      const facing = { x: e.facingX / facingLength, z: e.facingZ / facingLength };
      const velocity = { x: e.netVel.x, z: e.netVel.y };

      if (e.sliding) {
        if (!e.wasSliding) slideGrass.burst(e.renderPos, facing, velocity);
        e.grassEmitAccumulator += dt * (34 + Math.min(spd, 13) * 2.2);
        while (e.grassEmitAccumulator >= 1) {
          slideGrass.trail(e.renderPos, facing, velocity);
          e.grassEmitAccumulator -= 1;
        }
      } else {
        e.grassEmitAccumulator = 0;
      }
      if (sprinting) {
        e.sprintEmitAccumulator += dt * (4.6 + spd * .3);
        while (e.sprintEmitAccumulator >= 1) {
          slideGrass.sprintKick(e.renderPos, facing, velocity, e.sprintFootSide);
          e.sprintFootSide *= -1;
          e.sprintEmitAccumulator -= 1;
        }
      } else {
        e.sprintEmitAccumulator = 0;
      }
      e.wasSliding = e.sliding;
    }
    slideGrass.update(dt);
}

function getLocalPosition() {
  return entities.get(state.myId)?.renderPos || null;
}

return { clearEntities, applySnapshot, update, getLocalPosition };
}
