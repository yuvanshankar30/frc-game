import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const cache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

/** Image-based lighting so metal, anodized parts and polycarbonate pick up reflections. */
export function applyEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, intensity = 0.6) {
  let tex = cache.get(renderer);
  if (!tex) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    cache.set(renderer, tex);
  }
  scene.environment = tex;
  scene.environmentIntensity = intensity;
}
