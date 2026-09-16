import { THREE } from '../engine/three.js';
import { FIELD, HALF_W, HALF_L } from '../../shared/field.js';
import { makeCanvasTexture } from '../engine/assetLoader.js';
import { assetUrl } from '../engine/assetLoader.js';
export function createField({ scene, renderer }) {
const grassLoader = new THREE.TextureLoader();
function loadLocalTexture(url, onError) {
  return grassLoader.load(url, undefined, undefined, onError);
}
const grassTex = loadLocalTexture(assetUrl('textures/pitch/grass_diffuse.png'), () => {
  grassMat.map = null; grassMat.color.set(0x31854a); grassMat.needsUpdate = true;
});
const grassNormal = loadLocalTexture(assetUrl('textures/pitch/grass_normal.png'), () => {
  grassMat.normalMap = null; grassMat.needsUpdate = true;
});
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
grassNormal.wrapS = grassNormal.wrapT = THREE.RepeatWrapping;
grassTex.repeat.set(10, 16);
grassNormal.repeat.copy(grassTex.repeat);
grassTex.colorSpace = THREE.SRGBColorSpace;
grassTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
grassNormal.anisotropy = grassTex.anisotropy;
const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, normalMap: grassNormal, normalScale: new THREE.Vector2(.2, .2), color: 0xe9ffe9, roughness: .92 });
const pitch = new THREE.Mesh(
  new THREE.PlaneGeometry(HALF_W * 2, HALF_L * 2),
  grassMat
);
pitch.rotation.x = -Math.PI / 2;
pitch.receiveShadow = true;
scene.add(pitch);

// Full FIFA-style pitch markings: touchlines/goal lines, halfway line, center
// circle + spot, both penalty areas + six-yard boxes + spots + arcs, corner
// arcs. Proportions are scaled from real pitch ratios (105x68m) onto our
// gameplay-sized field, then drawn as one transparent overlay texture.
function createPitchMarkings(ctx, s) {
  const scaleX = s / (HALF_W * 2);
  const scaleZ = s / (HALF_L * 2);
  const toPx = (x, z) => [s / 2 + x * scaleX, s / 2 + z * scaleZ];
  // draws a box given world-space X half-width and a Z range [z0, z1]
  const strokeBoxXZ = (halfW, z0, z1) => {
    const [xLeft] = toPx(-halfW, 0);
    const [xRight] = toPx(halfW, 0);
    const [, yTop] = toPx(0, Math.min(z0, z1));
    const [, yBottom] = toPx(0, Math.max(z0, z1));
    ctx.strokeRect(xLeft, yTop, xRight - xLeft, yBottom - yTop);
  };

  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 4;

  // touchlines + goal lines
  ctx.strokeRect(6, 6, s - 12, s - 12);
  // halfway line
  ctx.beginPath(); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
  // center circle + spot
  const centerRadiusX = FIELD.CENTER_CIRCLE_R * scaleX;
  const centerRadiusZ = FIELD.CENTER_CIRCLE_R * scaleZ;
  ctx.beginPath(); ctx.ellipse(s / 2, s / 2, centerRadiusX, centerRadiusZ, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(s / 2, s / 2, 4, 0, Math.PI * 2); ctx.fill();

  // penalty area, six-yard box, spot and arc — mirrored for both ends
  const penaltyHalfW = FIELD.PENALTY_HALF_W, penaltyDepth = FIELD.PENALTY_DEPTH;
  const sixYardHalfW = FIELD.SIX_YARD_HALF_W, sixYardDepth = FIELD.SIX_YARD_DEPTH;
  const penaltySpotDist = FIELD.PENALTY_SPOT_DISTANCE;
  const arcRadiusX = FIELD.CENTER_CIRCLE_R * scaleX;
  const arcRadiusZ = FIELD.CENTER_CIRCLE_R * scaleZ;

  [1, -1].forEach((sign) => {
    // sign === 1: goal at +Z (blue's own goal), sign === -1: goal at -Z (red's own goal)
    const goalLineZ = sign * HALF_L;
    const inward = -sign; // direction from the goal line toward the pitch center

    strokeBoxXZ(penaltyHalfW, goalLineZ, goalLineZ + inward * penaltyDepth);
    strokeBoxXZ(sixYardHalfW, goalLineZ, goalLineZ + inward * sixYardDepth);

    const [spotX, spotZ] = toPx(0, goalLineZ + inward * penaltySpotDist);
    ctx.beginPath(); ctx.arc(spotX, spotZ, 4, 0, Math.PI * 2); ctx.fill();

    // penalty arc: the portion of the circle around the spot that bulges
    // toward the pitch center (away from the goal line). Canvas angles: 0 =
    // +x (right), increasing clockwise since Y grows downward, so "toward
    // center" is 270°/-90° when the goal is at the bottom edge (sign===1)
    // and 90° when the goal is at the top edge (sign===-1).
    const centerAngle = sign === 1 ? Math.PI * 1.5 : Math.PI * 0.5;
    const spread = Math.PI * 0.23;
    ctx.beginPath();
    ctx.ellipse(spotX, spotZ, arcRadiusX, arcRadiusZ, 0, centerAngle - spread, centerAngle + spread);
    ctx.stroke();
  });

  // corner arcs
  const cornerRX = FIELD.CORNER_ARC_R * scaleX;
  const cornerRZ = FIELD.CORNER_ARC_R * scaleZ;
  [[-HALF_W, -HALF_L, 0, Math.PI / 2], [HALF_W, -HALF_L, Math.PI / 2, Math.PI],
    [-HALF_W, HALF_L, -Math.PI / 2, 0], [HALF_W, HALF_L, Math.PI, Math.PI * 1.5]]
    .forEach(([x, z, a0, a1]) => {
      const [cx, cz] = toPx(x, z);
      ctx.beginPath(); ctx.ellipse(cx, cz, cornerRX, cornerRZ, 0, a0, a1); ctx.stroke();
    });
}
const linesTex = makeCanvasTexture(1024, 1024, createPitchMarkings);
const lines = new THREE.Mesh(
  new THREE.PlaneGeometry(HALF_W * 2, HALF_L * 2),
  new THREE.MeshBasicMaterial({ map: linesTex, transparent: true, depthWrite: false })
);
lines.rotation.x = -Math.PI / 2;
lines.position.y = 0.006;
scene.add(lines);

// Subtle alternating mowing stripes (bands across the width, repeating along
// the length) — a low-opacity light/dark overlay, cheap and gameplay-neutral.
function createGrassStripes() {
  const stripeCount = 12;
  const tex = makeCanvasTexture(64, 1024, (ctx, w, h) => {
    for (let y = 0; y < h; y++) {
      const shade = Math.cos(y / h * stripeCount * Math.PI);
      ctx.fillStyle = shade >= 0 ? `rgba(255,255,255,${shade * .025})` : `rgba(0,0,0,${-shade * .025})`;
      ctx.fillRect(0, y, w, 1);
    }
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_W * 2, HALF_L * 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.003;
  return mesh;
}
scene.add(createGrassStripes());

return { grassMat, createPitchMarkings };
}
