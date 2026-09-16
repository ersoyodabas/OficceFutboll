import { THREE } from '../engine/three.js';
export function initializeLighting(scene) {
scene.add(new THREE.HemisphereLight(0xe5f4ff, 0x365a38, 1.15));
const sun = new THREE.DirectionalLight(0xfff5df, 2.25);
sun.position.set(-25, 55, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -55;
sun.shadow.camera.far = 130;
sun.shadow.bias = -0.0015;
scene.add(sun);

}
