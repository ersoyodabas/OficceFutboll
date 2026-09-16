import { drawKitFabric } from './kitDesign.js';
import { TEAM_COLOR, PLAYER_VISUAL_SCALE } from '../core/config.js';
import { THREE } from '../engine/three.js';
import { makeCanvasTexture } from '../engine/assetLoader.js';
export function createPlayerFactory({ scene }) {
// Shared skin/hair palettes; each footballer picks one deterministically from its number.
const skinMats = [0xf0c8a4, 0xd9a47c, 0xb27a52, 0x8a5636, 0x5e3a24].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.62 }));
const hairMats = [0x17110c, 0x3a2617, 0x5c3d22, 0x0b0b0b, 0xa47a45].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
const bootMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.45 });
const soleMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });

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

// Mesh hanging below a joint pivot; `end` is the next joint.
function segment(parent, mesh, length) {
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  parent.add(mesh);
}
function limb(length) {
  const pivot = new THREE.Group();
  const end = new THREE.Group();
  end.position.y = -length;
  pivot.add(end);
  return { pivot, end };
}
// Capsule tapered from rTop to rBottom along its length.
function taperedCapsule(rTop, rBottom, length, material) {
  const radius = Math.max(rTop, rBottom);
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(.01, length - radius * 2), 4, 10);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const t = THREE.MathUtils.clamp(.5 - position.getY(i) / length, 0, 1); // 0 top → 1 bottom
    const scale = THREE.MathUtils.lerp(rTop, rBottom, t) / radius;
    position.setX(i, position.getX(i) * scale);
    position.setZ(i, position.getZ(i) * scale);
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

// Anatomical proportions for a ~1.83 m footballer (metres, feet on the ground).
const BODY = { hipY: .93, thigh: .43, shin: .42, shoulderY: 1.45, shoulderX: .2, upperArm: .3, forearm: .27 };

function createFootballer(team, number, name, isMe, targetScene = scene) {
  const teamHex = TEAM_COLOR[team];
  const shortsMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .75 });
  const jersey = jerseyTextures(teamHex, number);
  const jerseyMat = new THREE.MeshStandardMaterial({ map: jersey.front, roughness: 0.75 });
  const jerseyBackMat = new THREE.MeshStandardMaterial({ map: jersey.back, roughness: 0.75 });
  const jerseyPlainMat = new THREE.MeshStandardMaterial({ map: jersey.plain, roughness: 0.75 });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: teamHex, roughness: 0.75 });
  const sockMat = new THREE.MeshStandardMaterial({ color: teamHex, roughness: 0.75 });
  const skinMat = skinMats[number % skinMats.length];
  const hairMat = hairMats[(number * 7) % hairMats.length];

  // Root owns only world position/yaw. The body is a child so slide pitch is
  // always applied in the footballer's local forward direction, independent
  // of which way they are facing on the pitch.
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const hips = new THREE.Group();
  hips.position.y = BODY.hipY;
  body.add(hips);

  function makeLeg(sideX) {
    const hip = new THREE.Group();
    hip.position.x = sideX;
    const thigh = limb(BODY.thigh);
    hip.add(thigh.pivot);
    // Shorts cover the top of the thigh; the knee and lower thigh are bare.
    const shortsLeg = new THREE.Mesh(new THREE.CylinderGeometry(.1, .098, .2, 12), shortsMat);
    shortsLeg.position.y = -.07; shortsLeg.castShadow = true;
    thigh.pivot.add(shortsLeg);
    segment(thigh.pivot, taperedCapsule(.082, .058, BODY.thigh, skinMat), BODY.thigh);
    const shin = limb(BODY.shin);
    thigh.end.add(shin.pivot);
    // Socks pulled up to just below the knee, over a slightly fuller calf.
    const sock = taperedCapsule(.058, .04, BODY.shin * .86, sockMat);
    sock.position.y = -BODY.shin * .55; sock.castShadow = true;
    shin.pivot.add(sock);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(.058, 10, 8), skinMat);
    shin.pivot.add(knee);
    const boot = new THREE.Group();
    boot.position.set(0, -BODY.shin - .02, .045);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(.045, .17, 4, 8), bootMat);
    upper.rotation.x = Math.PI / 2; upper.scale.set(1.05, 1, .8); upper.castShadow = true;
    const sole = new THREE.Mesh(new THREE.BoxGeometry(.095, .018, .26), soleMat);
    sole.position.y = -.04;
    boot.add(upper, sole);
    shin.pivot.add(boot);
    hips.add(hip);
    return { hip, thigh: thigh.pivot, shin: shin.pivot };
  }
  const legL = makeLeg(-0.1);
  const legR = makeLeg(0.1);

  // Shorts: an oval, slightly flared waistband section.
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(.175, .2, .2, 16), shortsMat);
  shorts.scale.z = .72; shorts.position.y = .03; shorts.castShadow = true;
  hips.add(shorts);

  // Torso: V-shaped (broad chest, narrow waist) box so the kit texture keeps its
  // front/back faces; shoulder caps and a rounded waist hide the hard edges.
  const torsoGeo = new THREE.BoxGeometry(0.38, 0.46, 0.22, 1, 4, 1);
  const tp = torsoGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const t = THREE.MathUtils.clamp((tp.getY(i) + .23) / .46, 0, 1); // 0 waist → 1 shoulders
    tp.setX(i, tp.getX(i) * THREE.MathUtils.lerp(.8, 1.02, Math.pow(t, .8)));
    tp.setZ(i, tp.getZ(i) * THREE.MathUtils.lerp(.82, 1, Math.sin(t * Math.PI * .65)));
  }
  torsoGeo.computeVertexNormals();
  const torso = new THREE.Mesh(torsoGeo, [sleeveMat, sleeveMat, jerseyPlainMat, jerseyPlainMat, jerseyMat, jerseyBackMat]);
  torso.position.y = 0.33;
  torso.castShadow = true;
  hips.add(torso);
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(.16, .165, .08, 16), jerseyPlainMat);
  waist.scale.z = .72; waist.position.y = .12;
  hips.add(waist);

  function makeArm(sideX) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, BODY.shoulderY, 0);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 10), sleeveMat);
    cap.scale.set(1, .9, .95); cap.castShadow = true;
    shoulder.add(cap);
    const upper = limb(BODY.upperArm);
    shoulder.add(upper.pivot);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.068, .062, .16, 12), sleeveMat);
    sleeve.position.y = -.07; sleeve.castShadow = true;
    upper.pivot.add(sleeve);
    segment(upper.pivot, taperedCapsule(.05, .04, BODY.upperArm, skinMat), BODY.upperArm);
    const lower = limb(BODY.forearm);
    upper.end.add(lower.pivot);
    segment(lower.pivot, taperedCapsule(.042, .032, BODY.forearm, skinMat), BODY.forearm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skinMat);
    hand.scale.set(.8, 1.2, .9); hand.position.y = -BODY.forearm - .03;
    lower.pivot.add(hand);
    body.add(shoulder);
    return { shoulder, upper: upper.pivot, lower: lower.pivot };
  }
  const armL = makeArm(-BODY.shoulderX);
  const armR = makeArm(BODY.shoulderX);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), skinMat);
  neck.position.y = BODY.shoulderY + 0.05;
  body.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), skinMat);
  head.scale.set(.84, 1.12, .98);
  head.position.y = BODY.shoulderY + 0.2;
  head.castShadow = true;
  body.add(head);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.018, 8, 6), skinMat);
  nose.position.set(0, head.position.y - .01, .098);
  body.add(nose);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.104, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
  hair.scale.set(.86, 1.08, 1.02);
  hair.position.set(0, head.position.y + .012, -.008);
  body.add(hair);

  // A small marker above the controlled player's head (as in TV-style games)
  // plus a thin ring at the feet keeps them easy to pick out from afar.
  let highlight = null;
  if (isMe) {
    highlight = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.58, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
    );
    highlight.rotation.x = -Math.PI / 2;
    highlight.position.y = 0.02;
    root.add(highlight);
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(.14, .26, 3),
      new THREE.MeshBasicMaterial({ color: 0xff4d4d, depthTest: false })
    );
    marker.rotation.z = Math.PI;
    marker.position.y = head.position.y + .42;
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

  let appliedKit = null;
  function applyKit(kit) {
    if (appliedKit === kit) return;
    appliedKit = kit;
    for (const [tex, back] of [[jersey.front, false], [jersey.back, true]]) {
      const canvas = tex.image;
      drawKitFabric(canvas.getContext('2d'), canvas.width, kit, number, back ? name : '');
      tex.needsUpdate = true;
    }
    const plain = jersey.plain.image.getContext('2d'); plain.fillStyle = kit.primaryColor;
    plain.fillRect(0, 0, jersey.plain.image.width, jersey.plain.image.height); jersey.plain.needsUpdate = true;
    sleeveMat.color.set(kit.secondaryColor); shortsMat.color.set(kit.shortsColor);
    sockMat.color.set(kit.socksColor);
    root.userData.kit = kit.id; root.userData.shirtColor = kit.primaryColor;
  }
  return {
    root, body, legL, legR, armL, armR, tag, tagOffsetY, highlight, applyKit,
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
