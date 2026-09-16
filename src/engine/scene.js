import { THREE } from '../engine/three.js';
export function createScene() {
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x829fa4);
scene.fog = new THREE.Fog(0x829fa4, 115, 220);


return scene;
}
