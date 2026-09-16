import { drawKitFabric } from './kitDesign.js';
import { TEAM_COLOR, PLAYER_VISUAL_SCALE } from '../core/config.js';
import { THREE } from '../engine/three.js';
import { makeCanvasTexture } from '../engine/assetLoader.js';
export function createPlayerFactory({ scene }) {
// Shared skin/hair palettes; each footballer picks one deterministically from its number.
const skinMats = [0xf0c8a4, 0xd9a47c, 0xb27a52, 0x8a5636, 0x5e3a24].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.62 }));
const hairMats = [0x17110c, 0x3a2617, 0x5c3d22, 0x0b0b0b, 0xa47a45].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
const bootMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.45 });
const soleMat = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.3 });

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
function limb(length) {
  const pivot = new THREE.Group();
  const end = new THREE.Group();
  end.position.y = -length;
  pivot.add(end);
  return { pivot, end };
}

// Smooth limb built from a capsule reshaped along a muscle profile. `profile`
// is a list of [t, radius] pairs from the joint (t = 0) down the limb (t = 1);
// the covered span runs from the first to the last t and hangs below the pivot.
// The rounded capsule ends overlap at the joints, so knees and elbows stay
// smooth without extra joint meshes. Cross-sections are slightly oval.
function muscleLimb(length, profile, material, depth = .9) {
  const t0 = profile[0][0], t1 = profile[profile.length - 1][0];
  const span = length * (t1 - t0);
  const rMax = Math.max(...profile.map((point) => point[1]));
  const radiusAt = (t) => {
    if (t <= profile[0][0]) return profile[0][1];
    for (let i = 1; i < profile.length; i++) {
      const [ta, ra] = profile[i - 1], [tb, rb] = profile[i];
      if (t <= tb) return ra + (rb - ra) * (t - ta) / (tb - ta);
    }
    return profile[profile.length - 1][1];
  };
  const geometry = new THREE.CapsuleGeometry(rMax, span, 8, 18);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const along = Math.min(1, Math.max(0, (span / 2 - y) / span)); // 0 at the joint end
    const radius = radiusAt(t0 + (t1 - t0) * along);
    const scale = radius / rMax;
    position.setX(i, position.getX(i) * scale);
    position.setZ(i, position.getZ(i) * scale);
    // Keep the end caps hemispherical at the local end radius.
    if (Math.abs(y) > span / 2) position.setY(i, Math.sign(y) * (span / 2 + (Math.abs(y) - span / 2) * scale));
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -length * (t0 + t1) / 2;
  mesh.scale.z = depth;
  mesh.castShadow = true;
  return mesh;
}

// Average normals of vertices that share a position (seams between separately
// UV-mapped halves) so lighting stays smooth across them.
function smoothSeams(geometry) {
  const position = geometry.attributes.position, normal = geometry.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  const sum = new THREE.Vector3();
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    sum.set(0, 0, 0);
    for (const i of indices) sum.x += normal.getX(i), sum.y += normal.getY(i), sum.z += normal.getZ(i);
    sum.normalize();
    for (const i of indices) normal.setXYZ(i, sum.x, sum.y, sum.z);
  }
}

// Body shell lofted through elliptical cross-sections. rings: [y, rx, rz, zShift].
// The front half (+Z) and back half each get UVs spanning the whole kit
// texture (u left→right as seen by a viewer facing that side, v bottom→top)
// and their own material group, so the shirt number sits on the chest and the
// name/number on the back. Pass one material for both halves (shorts).
function loftShell(rings, frontMaterial, backMaterial = frontMaterial, segmentsPerHalf = 12) {
  const positions = [], uvs = [], indices = [];
  const yMin = rings[0][0], yMax = rings[rings.length - 1][0];
  const shape = (value) => Math.sign(value) * Math.pow(Math.abs(value), .82); // slightly squared-off ellipse
  function half(startAngle, uFor) {
    const base = positions.length / 3;
    for (const [y, rx, rz, zShift = 0] of rings) {
      for (let s = 0; s <= segmentsPerHalf; s++) {
        const angle = startAngle + Math.PI * s / segmentsPerHalf;
        positions.push(rx * shape(Math.cos(angle)), y, rz * shape(Math.sin(angle)) + zShift);
        uvs.push(uFor(angle), (y - yMin) / (yMax - yMin));
      }
    }
    const row = segmentsPerHalf + 1;
    for (let r = 0; r < rings.length - 1; r++) {
      for (let s = 0; s < segmentsPerHalf; s++) {
        const a = base + r * row + s, b = a + 1, c = a + row, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    return (rings.length - 1) * segmentsPerHalf * 6;
  }
  const geometry = new THREE.BufferGeometry();
  const frontCount = half(0, (angle) => 1 - angle / Math.PI);
  const backCount = half(Math.PI, (angle) => (2 * Math.PI - angle) / Math.PI);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(0, frontCount, 0);
  geometry.addGroup(frontCount, backCount, 1);
  geometry.computeVertexNormals();
  smoothSeams(geometry);
  const mesh = new THREE.Mesh(geometry, [frontMaterial, backMaterial]);
  mesh.castShadow = true;
  return mesh;
}

// Anatomical proportions for a ~1.82 m footballer (metres, feet on the ground).
const BODY = { hipY: .93, hipX: .095, thigh: .43, shin: .42, shoulderY: 1.45, shoulderX: .195, upperArm: .29, forearm: .26, armSplay: .1 };
// [t, radius] muscle profiles.
const THIGH_PROFILE = [[0, .088], [.18, .092], [.42, .084], [.7, .068], [.9, .056], [1, .05]];
const SHORTS_LEG_PROFILE = [[.08, .094], [.26, .096], [.42, .09]];
const SHIN_PROFILE = [[0, .05], [.12, .054], [.32, .062], [.55, .05], [.82, .034], [1, .03]];
const SOCK_PROFILE = [[.12, .058], [.32, .066], [.55, .054], [.82, .038], [1, .036]];
const SLEEVE_PROFILE = [[0, .07], [.5, .064]];
const UPPER_ARM_PROFILE = [[0, .05], [.3, .053], [.62, .044], [.92, .036], [1, .034]];
const FOREARM_PROFILE = [[0, .036], [.2, .041], [.62, .031], [1, .025]];
// Torso rings relative to the hips: [y, rx, rz, zShift] — waist, lats, chest, shoulders, collar.
const TORSO_RINGS = [[.06, .148, .104], [.16, .142, .1], [.26, .152, .106, .004], [.36, .17, .116, .01], [.44, .184, .12, .012],
  [.5, .188, .114, .008], [.545, .172, .098], [.575, .115, .074, -.006], [.595, .06, .054, -.004]];
const SHORTS_RINGS = [[-.13, .165, .108], [-.07, .186, .12], [.02, .184, .12], [.14, .154, .106]];

function createFootballer(team, number, name, isMe, targetScene = scene) {
  const teamHex = TEAM_COLOR[team];
  const shortsMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .8 });
  const jersey = jerseyTextures(teamHex, number);
  const jerseyMat = new THREE.MeshStandardMaterial({ map: jersey.front, roughness: 0.78 });
  const jerseyBackMat = new THREE.MeshStandardMaterial({ map: jersey.back, roughness: 0.78 });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: teamHex, roughness: 0.78 });
  const sockMat = new THREE.MeshStandardMaterial({ color: teamHex, roughness: 0.85 });
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
    // Shorts cover the upper thigh; knee and lower thigh are bare skin.
    thigh.pivot.add(muscleLimb(BODY.thigh, SHORTS_LEG_PROFILE, shortsMat, .92));
    thigh.pivot.add(muscleLimb(BODY.thigh, THIGH_PROFILE, skinMat, .9));
    const shin = limb(BODY.shin);
    thigh.end.add(shin.pivot);
    shin.pivot.add(muscleLimb(BODY.shin, SHIN_PROFILE, skinMat, .92));
    // Socks pulled up over the shin pads to just below the knee.
    shin.pivot.add(muscleLimb(BODY.shin, SOCK_PROFILE, sockMat, .95));
    // Boot: rounded upper with a pointed toe, pale sole plate.
    const boot = new THREE.Group();
    boot.position.set(0, -BODY.shin - .035, .04);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(.043, .16, 6, 12), bootMat);
    upper.rotation.x = Math.PI / 2; upper.scale.set(1.02, 1, .74); upper.castShadow = true;
    const heel = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), bootMat);
    heel.position.set(0, .03, -.075); heel.scale.set(.95, 1.1, 1);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(.074, .012, .23), soleMat);
    sole.position.y = -.032;
    boot.add(upper, heel, sole);
    shin.pivot.add(boot);
    hips.add(hip);
    return { hip, thigh: thigh.pivot, shin: shin.pivot };
  }
  const legL = makeLeg(-BODY.hipX);
  const legR = makeLeg(BODY.hipX);

  hips.add(loftShell(SHORTS_RINGS, shortsMat));
  // Shirt: front half carries the number, back half the name and number.
  hips.add(loftShell(TORSO_RINGS, jerseyMat, jerseyBackMat));
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.056, .012, 8, 18), sleeveMat);
  collar.rotation.x = Math.PI / 2; collar.position.set(0, .592, -.004); collar.scale.y = .95;
  hips.add(collar);

  function makeArm(sideX) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideX, BODY.shoulderY, 0);
    // Deltoid under the sleeve, rounding the shoulder into the chest.
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(.058, 16, 12), sleeveMat);
    deltoid.scale.set(1, .92, 1.05); deltoid.position.y = -.01; deltoid.castShadow = true;
    shoulder.add(deltoid);
    // Arms hang slightly away from the body; animation rotates the shoulder on top.
    const splay = new THREE.Group();
    splay.rotation.z = Math.sign(sideX) * BODY.armSplay;
    shoulder.add(splay);
    const upper = limb(BODY.upperArm);
    splay.add(upper.pivot);
    upper.pivot.add(muscleLimb(.15, SLEEVE_PROFILE, sleeveMat, .95));
    upper.pivot.add(muscleLimb(BODY.upperArm, UPPER_ARM_PROFILE, skinMat, .92));
    const lower = limb(BODY.forearm);
    upper.end.add(lower.pivot);
    lower.pivot.add(muscleLimb(BODY.forearm, FOREARM_PROFILE, skinMat, .88));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), skinMat);
    hand.scale.set(.62, 1.25, .95); hand.position.y = -BODY.forearm - .045;
    lower.pivot.add(hand);
    body.add(shoulder);
    return { shoulder, upper: upper.pivot, lower: lower.pivot };
  }
  const armL = makeArm(-BODY.shoulderX);
  const armR = makeArm(BODY.shoulderX);

  // Neck, head and face: skull, jaw, ears, nose, eyes and hair.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.047, .056, .13, 14), skinMat);
  neck.position.set(0, BODY.shoulderY + .07, -.004);
  body.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.1, 24, 18), skinMat);
  head.scale.set(.8, 1.02, .94);
  head.position.set(0, BODY.shoulderY + .215, 0);
  head.castShadow = true;
  body.add(head);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(.062, 18, 12), skinMat);
  jaw.scale.set(.9, .74, .88);
  jaw.position.set(0, head.position.y - .054, .012);
  body.add(jaw);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.022, 10, 8), skinMat);
    ear.scale.set(.45, 1.05, .8); ear.position.set(side * .079, head.position.y - .006, -.005);
    body.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.0105, 8, 6), eyeMat);
    eye.position.set(side * .03, head.position.y + .006, .086);
    body.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(.03, .007, .01), hairMat);
    brow.position.set(side * .031, head.position.y + .026, .087); brow.rotation.z = -side * .12;
    body.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.016, 10, 8), skinMat);
  nose.scale.set(.72, 1.35, .9); nose.position.set(0, head.position.y - .012, .092);
  body.add(nose);
  const hairStyle = number % 3; // short crop, fuller top, or buzz cut
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.104, 24, 12, 0, Math.PI * 2, 0, Math.PI * (hairStyle === 2 ? .42 : .52)), hairMat);
  hair.scale.set(.83, hairStyle === 1 ? 1.12 : 1.02, .98);
  hair.position.set(0, head.position.y + (hairStyle === 1 ? .014 : .006), -.008);
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

function animateFootballer(f, speed, kicking, sliding, sprinting, dt, { charging = false, shooting = false } = {}) {
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

  // Shot wind-up while S is held: kicking leg drawn back with the knee bent,
  // standing leg planted, arms opened for balance.
  if (charging && f.kickTimer <= 0) {
    const windBlend = 1 - Math.exp(-dt * 10);
    f.legR.thigh.rotation.x = THREE.MathUtils.lerp(f.legR.thigh.rotation.x, .62, windBlend);
    f.legR.shin.rotation.x = THREE.MathUtils.lerp(f.legR.shin.rotation.x, 1.25, windBlend);
    f.legL.thigh.rotation.x = THREE.MathUtils.lerp(f.legL.thigh.rotation.x, -.18, windBlend);
    f.legL.shin.rotation.x = THREE.MathUtils.lerp(f.legL.shin.rotation.x, .2, windBlend);
    f.armL.shoulder.rotation.z = THREE.MathUtils.lerp(f.armL.shoulder.rotation.z, -.55, windBlend);
    f.armR.shoulder.rotation.z = THREE.MathUtils.lerp(f.armR.shoulder.rotation.z, .4, windBlend);
    f.armL.upper.rotation.x = THREE.MathUtils.lerp(f.armL.upper.rotation.x, -.45, windBlend);
    f.armR.upper.rotation.x = THREE.MathUtils.lerp(f.armR.upper.rotation.x, .5, windBlend);
  }

  // Strike: a quick forward swing through the ball with follow-through; shots
  // swing harder and higher than passes and crosses.
  const kickDuration = shooting ? .42 : .38;
  if (kicking && f.kickTimer <= 0) f.kickTimer = kickDuration;
  if (f.kickTimer > 0) {
    f.kickTimer -= dt;
    const t = 1 - Math.max(f.kickTimer, 0) / kickDuration;
    const swing = shooting ? 1.35 : 1.05;
    // Starts from the drawn-back leg, peaks past the ball, then settles.
    const kickAngle = t < .35 ? THREE.MathUtils.lerp(-.55, swing, t / .35) : swing * (1 - (t - .35) / .65);
    f.legR.thigh.rotation.x = -kickAngle;
    f.legR.shin.rotation.x = t < .35 ? THREE.MathUtils.lerp(1.2, .1, t / .35) : .1 + (t - .35) * .6;
    if (shooting) {
      f.armL.shoulder.rotation.z = -.6 * (1 - t);
      f.armR.upper.rotation.x = -.6 * Math.sin(t * Math.PI);
    }
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
