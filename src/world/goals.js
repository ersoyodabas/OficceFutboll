import { THREE } from '../engine/three.js';
import { FIELD, HALF_L, GOAL_HALF_W } from '../../shared/field.js';
import { makeCanvasTexture } from '../engine/assetLoader.js';

// Regulation goals (7.32 m × 2.44 m inside the posts, 12 cm frame) with a deep
// box net: the top net runs back 1.5 m, the back net slopes down to 2 m behind
// the goal line, held by thin rear stanchions and ground bars.
const POST_R = 0.06;
const SUPPORT_R = 0.022;
const TOP_DEPTH = 1.5;
const BOTTOM_DEPTH = 2.0;
const MESH_CELLS_PER_METRE = 8;

export function createGoals({ scene }) {
const H = FIELD.GOAL_HEIGHT;
const halfW = GOAL_HALF_W + POST_R;

// One texture tile is one square metre of diamond netting; mipmaps fade it to
// a soft translucent white at broadcast distance, like a real net on TV.
const netTex = makeCanvasTexture(256, 256, (ctx, s) => {
  ctx.clearRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 2.4;
  const cell = s / MESH_CELLS_PER_METRE;
  ctx.beginPath();
  for (let i = -MESH_CELLS_PER_METRE; i <= MESH_CELLS_PER_METRE * 2; i++) {
    ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell + s, s);
    ctx.moveTo(i * cell, s); ctx.lineTo(i * cell + s, 0);
  }
  ctx.stroke();
});
netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
netTex.anisotropy = 8;
const netMat = new THREE.MeshBasicMaterial({ color: 0xf4f6f6, map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.05 });
const supportMat = new THREE.MeshStandardMaterial({ color: 0xe8ecec, roughness: 0.5 });

// Quad from four corners (in order) with UVs in metres so the mesh stays square.
function netPanel(a, b, c, d) {
  const geometry = new THREE.BufferGeometry();
  const corners = [a, b, c, d];
  const uDir = new THREE.Vector3().subVectors(b, a).normalize();
  const v = new THREE.Vector3().subVectors(d, a);
  const vDir = v.sub(uDir.clone().multiplyScalar(v.dot(uDir))).normalize();
  const uv = corners.map((corner) => { const rel = corner.clone().sub(a); return [rel.dot(uDir), rel.dot(vDir)]; });
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((corner) => [corner.x, corner.y, corner.z]), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv.flat(), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, netMat);
  mesh.renderOrder = 5;
  return mesh;
}

// Cylinder between two points.
function bar(from, to, radius, material, castShadow = true) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 12), material);
  mesh.position.copy(from).addScaledVector(direction, .5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = castShadow;
  return mesh;
}

function createGoal(sign) {
  const group = new THREE.Group();
  const z = sign * (HALF_L + POST_R);
  const back = (depth) => z + sign * depth;
  const p = (x, y, zz) => new THREE.Vector3(x, y, zz);

  // Frame: posts and crossbar with rounded joints.
  for (const side of [-1, 1]) group.add(bar(p(side * halfW, 0, z), p(side * halfW, H + POST_R, z), POST_R, frameMat));
  group.add(bar(p(-halfW - POST_R, H + POST_R, z), p(halfW + POST_R, H + POST_R, z), POST_R, frameMat));

  // Net surfaces.
  const topY = H + POST_R;
  group.add(netPanel(p(-halfW, topY, z), p(halfW, topY, z), p(halfW, topY, back(TOP_DEPTH)), p(-halfW, topY, back(TOP_DEPTH))));
  group.add(netPanel(p(-halfW, 0, back(BOTTOM_DEPTH)), p(halfW, 0, back(BOTTOM_DEPTH)), p(halfW, topY, back(TOP_DEPTH)), p(-halfW, topY, back(TOP_DEPTH))));
  for (const side of [-1, 1]) {
    const x = side * halfW;
    group.add(netPanel(p(x, 0, z), p(x, 0, back(BOTTOM_DEPTH)), p(x, topY, back(TOP_DEPTH)), p(x, topY, z)));
  }

  // Support frame: top side bars, rear stanchions, ground bars.
  for (const side of [-1, 1]) {
    const x = side * halfW;
    group.add(bar(p(x, topY, z), p(x, topY, back(TOP_DEPTH)), SUPPORT_R, supportMat, false));
    group.add(bar(p(x, topY, back(TOP_DEPTH)), p(x, 0, back(BOTTOM_DEPTH)), SUPPORT_R, supportMat));
    group.add(bar(p(x, SUPPORT_R, z), p(x, SUPPORT_R, back(BOTTOM_DEPTH)), SUPPORT_R, supportMat, false));
  }
  group.add(bar(p(-halfW, topY, back(TOP_DEPTH)), p(halfW, topY, back(TOP_DEPTH)), SUPPORT_R, supportMat, false));
  group.add(bar(p(-halfW, SUPPORT_R, back(BOTTOM_DEPTH)), p(halfW, SUPPORT_R, back(BOTTOM_DEPTH)), SUPPORT_R, supportMat, false));

  scene.add(group);
  return group;
}

createGoal(1);
createGoal(-1);
}
