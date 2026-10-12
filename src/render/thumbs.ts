import * as THREE from 'three';
import { loadRobot } from '../robots/registry';
import { robotVisual } from './preview';
import { applyEnvironment } from './environment';

/** Renders small transparent PNG thumbnails of robots (cached per id) with one shared renderer. */
let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, Promise<string>>();
/** Thumbnails render one at a time so opening a robot list doesn't stall the UI. */
let queue: Promise<unknown> = Promise.resolve();

/** Drop cached thumbnails for a robot (after it's edited/saved). */
export function invalidateThumb(id: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(`${id}|`)) cache.delete(k);
}

function disposeScene(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat?.dispose();
    }
  });
}

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
    const job = async () => {
      await new Promise((r) => setTimeout(r, 16)); // yield a frame between thumbnails
      const { def, model } = await loadRobot(id);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xeef3ff, 0x30343e, 1.3));
      applyEnvironment(getRenderer(), scene, 0.85);
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
      const url = r.domElement.toDataURL('image/png');
      disposeScene(scene);
      return url;
    };
    p = queue.then(job, job);
    queue = p.catch(() => undefined);
    // Don't keep failures cached.
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
