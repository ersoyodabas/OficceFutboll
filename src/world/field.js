import { THREE } from '../engine/three.js';
import { FIELD, HALF_W, HALF_L } from '../../shared/field.js';
import { makeCanvasTexture, loadTexture } from '../engine/assetLoader.js';

// Grass continues past the lines (as on a real pitch) so the touchlines and
// goal lines sit on turf rather than on the stadium floor.
const RUNOFF = 8;
const TURF_SIZE_X = HALF_W * 2 + RUNOFF * 2; // across the pitch (world X)
const TURF_SIZE_Z = HALF_L * 2 + RUNOFF * 2; // along the pitch (world Z)

// ---------- saha.png grass surface ----------
// saha.png (1536 × 1024) is a grass photo whose ~7.1 mowing bands vary along
// the image width; the left/right edges meet on a dark→light band edge.
// The image is tiled at its native aspect ratio (never stretched): the image
// width runs along the pitch length so the bands appear as straight vertical
// stripes from the main-stand camera, and every tile has the same orientation
// (no texture rotation or mirroring). Exactly GRASS_TILES_ALONG_PITCH tiles
// cover the goal-line-to-goal-line length; with 3, each tile is 21.2 m and the
// in-pitch tile seams fall exactly under the goal lines and the dotted offside
// lines (one third of the length). The stripes are part of the photo, so more
// tiles means sharper blades but narrower stripes (3 tiles: ~3 m stripes,
// 72 texels per metre, sharp at 1080p broadcast density).
const GRASS_TILES_ALONG_PITCH = 3;
const GRASS_IMAGE_WIDTH = 1536, GRASS_IMAGE_HEIGHT = 1024;
const GRASS_TILE_LENGTH = (HALF_L * 2) / GRASS_TILES_ALONG_PITCH;                   // metres per image width (world Z)
const GRASS_TILE_WIDTH = GRASS_TILE_LENGTH * GRASS_IMAGE_HEIGHT / GRASS_IMAGE_WIDTH; // metres per image height (world X)
export const grassTextureRepeatX = TURF_SIZE_Z / GRASS_TILE_LENGTH; // ≈ 3.75 image widths along the turf
export const grassTextureRepeatY = TURF_SIZE_X / GRASS_TILE_WIDTH;  // ≈ 4.42 image heights across the turf
// Linear RGB multiplier: the photo is a saturated yellow-green; measured on the
// broadcast view this brings the turf to a deeper natural green (~sRGB 67,125,38).
const GRASS_TINT_RGB = [.62, .6, 1.15];
// Height of the markings above the turf; with polygon offset this keeps them
// from z-fighting at the long, shallow broadcast view without visibly floating.
const MARKINGS_LIFT = .008;

export function createField({ scene, renderer }) {
// Grazing broadcast angle: use the highest anisotropy the GPU offers.
const anisotropy = renderer.capabilities.getMaxAnisotropy();

const grassTexture = loadTexture('textures/pitch/saha.png', {
  onError: () => { grassMat.map = null; grassMat.color.set(0x3f7a2c); grassMat.needsUpdate = true; },
});
grassTexture.colorSpace = THREE.SRGBColorSpace;
grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.generateMipmaps = true;
grassTexture.minFilter = THREE.LinearMipmapLinearFilter;
grassTexture.magFilter = THREE.LinearFilter;
grassTexture.anisotropy = anisotropy;
grassTexture.repeat.set(grassTextureRepeatX, grassTextureRepeatY);
// Put a tile edge on the +Z goal line and the +X touchline (see createGrassGeometry
// for the UV layout); the other in-pitch Z seams then land under white lines too.
grassTexture.offset.set(
  -(((HALF_L + TURF_SIZE_Z / 2) / GRASS_TILE_LENGTH) % 1),
  -(((HALF_W + TURF_SIZE_X / 2) / GRASS_TILE_WIDTH) % 1),
);

const grassNormal = loadTexture('textures/pitch/grass_normal.png', {
  onError: () => { grassMat.normalMap = null; grassMat.needsUpdate = true; },
});
grassNormal.wrapS = grassNormal.wrapT = THREE.RepeatWrapping;
grassNormal.repeat.set(TURF_SIZE_Z / 4, TURF_SIZE_X / 4);
grassNormal.anisotropy = anisotropy;

// Matte natural turf: high roughness, no metalness, a faint normal map for
// light variation. No emissive, so the grass never looks self-lit.
const grassMat = new THREE.MeshStandardMaterial({
  map: grassTexture,
  color: new THREE.Color().setRGB(...GRASS_TINT_RGB),
  roughness: .92,
  metalness: 0,
  normalMap: grassNormal,
  normalScale: new THREE.Vector2(.15, .15),
});

// A turf-textured plane of any size centred on the pitch, lying flat once
// rotated -90° about X. UVs are laid out in world space: u follows world Z (the
// pitch length, the image's band axis) and v follows world X, both normalised
// to the full turf, so every surface using grassMat samples the same continuous
// pattern (the lobby pitch reuses this with the same material and texture).
function createGrassGeometry(width, depth) {
  const geometry = new THREE.PlaneGeometry(width, depth);
  const position = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const worldX = position.getX(i), worldZ = -position.getY(i); // plane Y maps to world -Z after the rotation
    uv.setXY(i, .5 + worldZ / TURF_SIZE_Z, .5 + worldX / TURF_SIZE_X);
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
