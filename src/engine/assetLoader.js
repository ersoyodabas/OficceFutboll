import { THREE } from '../engine/three.js';
export function makeCanvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}


export const assetUrl = (file) => new URL('../../assets/' + file, import.meta.url).href;

// One shared loader and one texture per asset file; callers share the returned
// texture (and its sampling settings) instead of loading the image again.
let textureLoader = null;
const textures = new Map();
export function loadTexture(file, { onError } = {}) {
  textureLoader ??= new THREE.TextureLoader();
  if (!textures.has(file)) textures.set(file, textureLoader.load(assetUrl(file), undefined, undefined, onError));
  return textures.get(file);
}
