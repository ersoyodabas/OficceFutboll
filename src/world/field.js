import { THREE } from '../engine/three.js';
import { FIELD, HALF_W, HALF_L } from '../../shared/field.js';
import { makeCanvasTexture, loadTexture } from '../engine/assetLoader.js';

// Grass continues past the lines (as on a real pitch) so the touchlines and
// goal lines sit on turf rather than on the stadium floor.
const RUNOFF = 8;
const TURF_SIZE_X = HALF_W * 2 + RUNOFF * 2; // across the pitch (world X)
const TURF_SIZE_Z = HALF_L * 2 + RUNOFF * 2; // along the pitch (world Z)

// ---------- saha.png grass surface ----------
// saha.png (1536 × 1024) is a grass photo with seven mowing bands running
// across its long side; its left/right edges fall on a dark→light band edge,
// so it repeats cleanly along the band axis. One tile spans a third of the
// pitch length, which gives ~3 m bands and puts both goal lines and the
// halfway line on band edges. Texels stay square (~7 px per 10 cm), fine
// enough to keep blade detail at the broadcast camera distance.
const GRASS_TILE_LENGTH = (HALF_L * 2) / 3;            // metres of pitch per image width (band axis)
const GRASS_TILE_WIDTH = GRASS_TILE_LENGTH * 1024 / 1536; // metres per image height
export const grassTextureRepeatX = TURF_SIZE_X / GRASS_TILE_WIDTH;  // ≈ 4.42 tiles across the turf
export const grassTextureRepeatY = TURF_SIZE_Z / GRASS_TILE_LENGTH; // ≈ 3.75 tiles along the turf
// The photo's natural colour is a saturated yellow-green; this linear multiply
// pulls it toward a deeper natural turf green under stadium lighting.
// Measured on the broadcast view: untinted-ish output averaged sRGB (74,133,36);
// this brings it to roughly (65,122,42).
const GRASS_TINT = new THREE.Color().setRGB(.62, .6, 1.15);
const GRASS_ANISOTROPY_CAP = 8;
// Height of the markings above the turf; with polygon offset this keeps them
// from z-fighting at the long, shallow broadcast view without visibly floating.
const MARKINGS_LIFT = .008;

export function createField({ scene, renderer }) {
const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), GRASS_ANISOTROPY_CAP);

const grassTexture = loadTexture('textures/pitch/saha.png', {
  onError: () => { grassMat.map = null; grassMat.color.set(0x3f7a2c); grassMat.needsUpdate = true; },
});
grassTexture.colorSpace = THREE.SRGBColorSpace;
grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.anisotropy = anisotropy;
// Rotate a quarter turn so the bands run across the pitch (they vary along its
// length, like the stripes seen from the main-stand camera). With the rotation
// about the centre, repeat.x scales the turf's length axis and repeat.y its width.
grassTexture.center.set(.5, .5);
grassTexture.rotation = Math.PI / 2;
grassTexture.repeat.set(grassTextureRepeatY, grassTextureRepeatX);
// Along the band axis the texture coordinate is .5 + offset - z / GRASS_TILE_LENGTH;
// shift it so a tile edge (a band edge) lands on each goal line.
grassTexture.offset.set((1 - (.5 + HALF_L / GRASS_TILE_LENGTH) % 1) % 1, 0);

const grassNormal = loadTexture('textures/pitch/grass_normal.png', {
  onError: () => { grassMat.normalMap = null; grassMat.needsUpdate = true; },
});
grassNormal.wrapS = grassNormal.wrapT = THREE.RepeatWrapping;
grassNormal.repeat.set(TURF_SIZE_X / 4, TURF_SIZE_Z / 4);
grassNormal.anisotropy = anisotropy;

// Matte natural turf: high roughness, no metalness, a faint normal map for
// light variation. No emissive, so the grass never looks self-lit.
const grassMat = new THREE.MeshStandardMaterial({
  map: grassTexture,
  color: GRASS_TINT,
  roughness: .92,
  metalness: 0,
  normalMap: grassNormal,
  normalScale: new THREE.Vector2(.15, .15),
});

// A turf-textured plane of any size centred on the pitch; UVs are remapped so
// every surface using grassMat samples the same world-space pattern (the lobby
// pitch reuses this with the same material and texture).
function createGrassGeometry(width, depth) {
  const geometry = new THREE.PlaneGeometry(width, depth);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, .5 + (uv.getX(i) - .5) * width / TURF_SIZE_X, .5 + (uv.getY(i) - .5) * depth / TURF_SIZE_Z);
  }
  return geometry;
}
const turf = new THREE.Mesh(createGrassGeometry(TURF_SIZE_X, TURF_SIZE_Z), grassMat);
turf.rotation.x = -Math.PI / 2;
turf.receiveShadow = true;
scene.add(turf);

// Markings overlay: a tiny lift plus polygon offset and a later render order.
function overlay(texture, width, depth, order) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order * 4,
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = MARKINGS_LIFT;
  mesh.renderOrder = order;
  scene.add(mesh);
  return mesh;
}

// Rush pitch markings drawn in metres: touchlines/goal lines, halfway line,
// centre circle and spot, penalty areas with arcs, corner arcs and the dotted
// offside lines one third of the length from each goal line. The canvas maps
// x ∈ [-HALF_W, HALF_W] and z ∈ [-HALF_L, HALF_L] onto [0, s].
function createPitchMarkings(ctx, s) {
  const lw = FIELD.LINE_WIDTH;
  ctx.setTransform(s / (HALF_W * 2), 0, 0, s / (HALF_L * 2), s / 2, s / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';
  const line = (x0, z0, x1, z1) => { ctx.beginPath(); ctx.moveTo(x0, z0); ctx.lineTo(x1, z1); ctx.stroke(); };

  // Lines belong to the area they bound, so the boundary sits inside the pitch.
  ctx.strokeRect(-HALF_W + lw / 2, -HALF_L + lw / 2, HALF_W * 2 - lw, HALF_L * 2 - lw);
  line(-HALF_W, 0, HALF_W, 0);
  ctx.beginPath(); ctx.arc(0, 0, FIELD.CENTER_CIRCLE_R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, .16, 0, Math.PI * 2); ctx.fill();

  for (const sign of [1, -1]) {
    const goalLine = sign * (HALF_L - lw / 2);
    const boxLine = sign * (HALF_L - FIELD.PENALTY_DEPTH);
    const halfW = FIELD.PENALTY_HALF_W;
    ctx.beginPath();
    ctx.moveTo(-halfW, goalLine); ctx.lineTo(-halfW, boxLine); ctx.lineTo(halfW, boxLine); ctx.lineTo(halfW, goalLine);
    ctx.stroke();

    // Penalty arc: the part of the circle around the (unmarked) spot outside the area.
    const spotZ = sign * (HALF_L - FIELD.PENALTY_SPOT_DISTANCE);
    const spread = Math.acos((FIELD.PENALTY_DEPTH - FIELD.PENALTY_SPOT_DISTANCE) / FIELD.CENTER_CIRCLE_R);
    const towardCentre = -sign * Math.PI / 2;
    ctx.beginPath(); ctx.arc(0, spotZ, FIELD.CENTER_CIRCLE_R, towardCentre - spread, towardCentre + spread); ctx.stroke();

    // Dotted offside line with short solid ends at the touchlines.
    const offsideZ = sign * (HALF_L - FIELD.OFFSIDE_LINE_DISTANCE);
    const solidEnd = 2.5;
    line(-HALF_W, offsideZ, -HALF_W + solidEnd, offsideZ);
    line(HALF_W - solidEnd, offsideZ, HALF_W, offsideZ);
    ctx.setLineDash([.9, .75]);
    line(-HALF_W + solidEnd + .6, offsideZ, HALF_W - solidEnd - .6, offsideZ);
    ctx.setLineDash([]);
  }

  const r = FIELD.CORNER_ARC_R;
  for (const [x, z, a0, a1] of [[-HALF_W, -HALF_L, 0, Math.PI / 2], [HALF_W, -HALF_L, Math.PI / 2, Math.PI],
    [-HALF_W, HALF_L, -Math.PI / 2, 0], [HALF_W, HALF_L, Math.PI, Math.PI * 1.5]]) {
    ctx.beginPath(); ctx.arc(x, z, r, a0, a1); ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
const linesTex = makeCanvasTexture(2048, 2048, createPitchMarkings);
linesTex.anisotropy = anisotropy; // keeps thin lines crisp at the shallow broadcast angle
overlay(linesTex, HALF_W * 2, HALF_L * 2, 2);

return { grassMat, createGrassGeometry, createPitchMarkings };
}
