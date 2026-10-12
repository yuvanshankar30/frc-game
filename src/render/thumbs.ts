import * as THREE from 'three';
import { loadRobot } from '../robots/registry';
import { robotVisual } from './preview';

/** Renders small transparent PNG thumbnails of robots (cached per id) with one shared renderer. */
let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, Promise<string>>();

function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(480, 300, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  return renderer;
}

export function robotThumb(id: string, alliance: 'blue' | 'red' = 'blue'): Promise<string> {
  const key = `${id}|${alliance}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const { def, model } = await loadRobot(id);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xeef3ff, 0x30343e, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(2, 3, 2.5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x9fbaff, 1.0);
      rim.position.set(-2.5, 1.5, -2);
      scene.add(rim);
      const { group } = robotVisual(def, model, alliance);
      scene.add(group);
      const box = new THREE.Box3().setFromObject(group);
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      const cam = new THREE.PerspectiveCamera(30, 480 / 300, 0.05, 50);
      cam.position.copy(c).add(new THREE.Vector3(1.1, 0.62, 0.9).normalize().multiplyScalar(size * 1.75));
      cam.lookAt(c);
      const r = getRenderer();
      r.setClearColor(0x000000, 0);
      r.render(scene, cam);
      return r.domElement.toDataURL('image/png');
    })();
    cache.set(key, p);
  }
  return p;
}
