import { THREE } from '../engine/three.js';
export function createScene() {
const scene = new THREE.Scene();
// Dark evening stadium; fog only softens the far stands behind the camera's view.
scene.background = new THREE.Color(0x070b0a);
scene.fog = new THREE.Fog(0x070b0a, 150, 320);
return scene;
}
