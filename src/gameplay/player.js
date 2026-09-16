import { TEAM_COLOR, PLAYER_VISUAL_SCALE } from '../core/config.js';
import { THREE } from '../engine/three.js';
import { makeCanvasTexture } from '../engine/assetLoader.js';
export function createPlayerFactory({ scene }) {
const SKIN_COLOR = 0xe3ab7f;
const skinMat = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.7 });
const hairMat = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.8 });
const bootMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 });
const shortsMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.75 });

function jerseyTextures(teamHex, number) {
  const teamCss = '#' + teamHex.toString(16).padStart(6, '0');
  function draw() {
    return makeCanvasTexture(256, 256, (ctx, s) => {
      ctx.fillStyle = teamCss;
      ctx.fillRect(0, 0, s, s);
      const grad = ctx.createLinearGradient(0, 0, s, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0.18)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      grad.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s * 0.08);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 4;
      ctx.font = 'bold 150px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(String(number), s / 2, s * 0.56);
      ctx.fillText(String(number), s / 2, s * 0.56);
    });
  }
  return { front: draw(), back: draw(), plain: makeCanvasTexture(64, 64, (ctx, s) => { ctx.fillStyle = teamCss; ctx.fillRect(0, 0, s, s); }) };
}

function nameSprite(name) {
  const tex = makeCanvasTexture(512, 128, (ctx, s, h) => {
    ctx.clearRect(0, 0, s, h);
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = name.length > 14 ? name.slice(0, 13) + '…' : name;
    const textW = ctx.measureText(text).width;
    const padX = 36;
    const boxW = Math.min(s, textW + padX * 2);
    const boxX = (s - boxW) / 2;
    ctx.fillStyle = 'rgba(8,10,14,0.68)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(boxX, h * 0.18, boxW, h * 0.64, 16);
    else ctx.rect(boxX, h * 0.18, boxW, h * 0.64);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, s / 2, h / 2 + 1);
  });
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.6, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function limb(radiusTop, radiusBottom, length, material, segments) {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments || 8), material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  const end = new THREE.Group();
  end.position.y = -length;
  pivot.add(end);
  return { pivot, end };
}

function createFootballer(team, number, name, isMe, targetScene = scene) {
  const teamHex = TEAM_COLOR[team];
  const jersey = jerseyTextures(teamHex, number);
  const jerseyMat = new THREE.MeshStandardMaterial({ map: jersey.front, roughness: 0.75 });
  const jerseyBackMat = new THREE.MeshStandardMaterial({ map: jersey.back, roughness: 0.75 });
  const jerseyPlainMat = new THREE.MeshStandardMaterial({ map: jersey.plain, roughness: 0.75 });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: teamHex, roughness: 0.75 });
  const sockMat = new THREE.MeshStandardMaterial({ color: teamHex, roughness: 0.75 });

  // Root owns only world position/yaw. The body is a child so slide pitch is
  // always applied in the footballer's local forward direction, independent
  // of which way they are facing on the pitch.
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = 0.9;
  body.add(hips);

  function makeLeg(sideX) {
    const hip = new THREE.Group();
    hip.position.x = sideX;
    const thigh = limb(0.1, 0.09, 0.4, shortsMat);
    hip.add(thigh.pivot);
    const knee = thigh.end;
    const shin = limb(0.08, 0.06, 0.42, sockMat);
    knee.add(shin.pivot);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.24), bootMat);
    boot.position.set(0, -0.46, 0.05);
    boot.castShadow = true;
    shin.pivot.add(boot);
    hips.add(hip);
    return { hip, thigh: thigh.pivot, shin: shin.pivot };
  }
  const legL = makeLeg(-0.12);
  const legR = makeLeg(0.12);

  const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.3), shortsMat);
  shorts.position.y = 0.02;
  shorts.castShadow = true;
  hips.add(shorts);
  [-1, 1].forEach((s) => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.31), new THREE.MeshStandardMaterial({ color: teamHex }));
    stripe.position.set(s * 0.21, 0.02, 0);
    hips.add(stripe);
  });

  const torsoGeo = new THREE.BoxGeometry(0.46, 0.54, 0.28);
  const torso = new THREE.Mesh(torsoGeo, [sleeveMat, sleeveMat, jerseyPlainMat, jerseyPlainMat, jerseyMat, jerseyBackMat]);
  torso.position.y = 0.27 + 0.12;
  torso.castShadow = true;
  hips.add(torso);

  const shoulderY = 0.9 + 0.27 + 0.12 + 0.22;

  function makeArm(sideX) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, shoulderY, 0);
    const upper = limb(0.075, 0.065, 0.3, sleeveMat);
    shoulder.add(upper.pivot);
    const elbow = upper.end;
    const lower = limb(0.06, 0.05, 0.28, skinMat);
    elbow.add(lower.pivot);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
    hand.position.y = -0.28;
    lower.pivot.add(hand);
    body.add(shoulder);
    return { shoulder, upper: upper.pivot, lower: lower.pivot };
  }
  const armL = makeArm(-0.29);
  const armR = makeArm(0.29);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), skinMat);
  neck.position.y = shoulderY + 0.06;
  body.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 14), skinMat);
  head.position.y = shoulderY + 0.06 + 0.16;
  head.castShadow = true;
  body.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hair.position.copy(head.position);
  body.add(hair);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.56, 24),
    new THREE.MeshBasicMaterial({ color: teamHex, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  root.add(ring);

  // the wider camera makes it harder to tell who you are — a bright marker
  // under the controlled player's feet makes them easy to pick out at a glance
  let highlight = null;
  if (isMe) {
    highlight = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.72, 28),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    highlight.rotation.x = -Math.PI / 2;
    highlight.position.y = 0.025;
    root.add(highlight);
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(.18, .28, 3),
      new THREE.MeshBasicMaterial({ color: 0xffe066, depthTest: false })
    );
    marker.rotation.z = Math.PI;
    marker.position.y = head.position.y + .48;
    marker.renderOrder = 12;
    root.add(marker);
  }

  // name tag is added as a sibling (not scaled with the body) so its
  // on-screen size stays consistent regardless of PLAYER_VISUAL_SCALE —
  // its world position is updated manually each frame (see render loop)
  const tagOffsetY = (head.position.y + 0.34) * PLAYER_VISUAL_SCALE;
  const tag = nameSprite(name || 'Oyuncu');

  root.scale.setScalar(PLAYER_VISUAL_SCALE);
  targetScene.add(root);
  targetScene.add(tag);

  return {
    root, body, legL, legR, armL, armR, tag, tagOffsetY, highlight,
    gaitPhase: Math.random() * Math.PI * 2,
    kickTimer: 0,
  };
}

function animateFootballer(f, speed, kicking, sliding, sprinting, dt) {
  const poseBlend = 1 - Math.exp(-dt * 18);

  if (sliding) {
    // Feet-first slide tackle: right leg reaches the ball while the left
    // leg opens to the side and folds underneath the body.
    f.legR.hip.rotation.z = THREE.MathUtils.lerp(f.legR.hip.rotation.z, 0.08, poseBlend);
    f.legR.thigh.rotation.x = THREE.MathUtils.lerp(f.legR.thigh.rotation.x, -0.08, poseBlend);
    f.legR.shin.rotation.x = THREE.MathUtils.lerp(f.legR.shin.rotation.x, 0.06, poseBlend);

    f.legL.hip.rotation.z = THREE.MathUtils.lerp(f.legL.hip.rotation.z, -0.5, poseBlend);
    f.legL.thigh.rotation.x = THREE.MathUtils.lerp(f.legL.thigh.rotation.x, 0.88, poseBlend);
    f.legL.shin.rotation.x = THREE.MathUtils.lerp(f.legL.shin.rotation.x, 1.55, poseBlend);

    f.armL.shoulder.rotation.z = THREE.MathUtils.lerp(f.armL.shoulder.rotation.z, -0.78, poseBlend);
    f.armR.shoulder.rotation.z = THREE.MathUtils.lerp(f.armR.shoulder.rotation.z, 0.62, poseBlend);
    f.armL.upper.rotation.x = THREE.MathUtils.lerp(f.armL.upper.rotation.x, -0.35, poseBlend);
    f.armR.upper.rotation.x = THREE.MathUtils.lerp(f.armR.upper.rotation.x, 0.3, poseBlend);
    f.armL.lower.rotation.x = THREE.MathUtils.lerp(f.armL.lower.rotation.x, 0.48, poseBlend);
    f.armR.lower.rotation.x = THREE.MathUtils.lerp(f.armR.lower.rotation.x, 0.7, poseBlend);
    f.body.rotation.z = THREE.MathUtils.lerp(f.body.rotation.z, -0.08, poseBlend);
    f.kickTimer = 0;
    return;
  }

  const moving = speed > 0.35;
  const swingMax = THREE.MathUtils.clamp(speed / 8, 0, 1) * (sprinting ? 1.16 : .86);
  if (moving) f.gaitPhase += dt * (sprinting ? 8.2 + speed * .72 : 5.2 + speed * .54);
  const s = Math.sin(f.gaitPhase);
  const targetLegL = moving ? s * swingMax : 0;
  const targetLegR = moving ? -s * swingMax : 0;
  const kneeStrength = sprinting ? 1.58 : 1.25;
  const kneeL = moving ? Math.max(0, -Math.sin(f.gaitPhase + 0.6)) * swingMax * kneeStrength : 0;
  const kneeR = moving ? Math.max(0, -Math.sin(f.gaitPhase - Math.PI + 0.6)) * swingMax * kneeStrength : 0;

  f.legL.thigh.rotation.x = THREE.MathUtils.lerp(f.legL.thigh.rotation.x, targetLegL, 0.35);
  f.legR.thigh.rotation.x = THREE.MathUtils.lerp(f.legR.thigh.rotation.x, targetLegR, 0.35);
  f.legL.shin.rotation.x = THREE.MathUtils.lerp(f.legL.shin.rotation.x, kneeL, 0.35);
  f.legR.shin.rotation.x = THREE.MathUtils.lerp(f.legR.shin.rotation.x, kneeR, 0.35);
  f.legL.hip.rotation.z = THREE.MathUtils.lerp(f.legL.hip.rotation.z, 0, poseBlend);
  f.legR.hip.rotation.z = THREE.MathUtils.lerp(f.legR.hip.rotation.z, 0, poseBlend);

  const armStrength = sprinting ? .96 : .68;
  f.armL.upper.rotation.x = THREE.MathUtils.lerp(f.armL.upper.rotation.x, -targetLegL * armStrength, 0.35);
  f.armR.upper.rotation.x = THREE.MathUtils.lerp(f.armR.upper.rotation.x, -targetLegR * armStrength, 0.35);
  f.armL.lower.rotation.x = THREE.MathUtils.lerp(f.armL.lower.rotation.x, moving ? (sprinting ? .82 : .3) : .15, 0.35);
  f.armR.lower.rotation.x = THREE.MathUtils.lerp(f.armR.lower.rotation.x, moving ? (sprinting ? .82 : .3) : .15, 0.35);
  f.armL.shoulder.rotation.z = THREE.MathUtils.lerp(f.armL.shoulder.rotation.z, 0, poseBlend);
  f.armR.shoulder.rotation.z = THREE.MathUtils.lerp(f.armR.shoulder.rotation.z, 0, poseBlend);

  if (kicking && f.kickTimer <= 0) f.kickTimer = 0.38;
  if (f.kickTimer > 0) {
    f.kickTimer -= dt;
    const t = 1 - Math.max(f.kickTimer, 0) / 0.38;
    const kickAngle = Math.sin(t * Math.PI) * 1.5;
    f.legR.thigh.rotation.x = -kickAngle * 0.8;
    f.legR.shin.rotation.x = Math.max(0, kickAngle) * 0.9;
  }

  if (!moving) {
    f.body.rotation.z = Math.sin(performance.now() * 0.0015) * 0.03;
  } else {
    const runningLean = sprinting ? Math.sin(f.gaitPhase) * .045 : 0;
    f.body.rotation.z = THREE.MathUtils.lerp(f.body.rotation.z, runningLean, sprinting ? .22 : .1);
    const bounce = Math.abs(Math.sin(f.gaitPhase)) * (sprinting ? .065 : .024);
    f.body.position.y = THREE.MathUtils.damp(f.body.position.y, bounce, sprinting ? 22 : 16, dt);
  }
}

return { createFootballer, animateFootballer };
}
