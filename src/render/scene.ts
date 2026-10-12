import * as THREE from 'three';
import { FIELD } from '../field/rebuilt/dims';

export interface Graphics {
  shadows: boolean;
  pixelRatio: number;
  antialias: boolean;
}

export function createRenderer(canvas: HTMLCanvasElement, g: Graphics) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: g.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, g.pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = g.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

/** Arena: background, lights, truss and a few set pieces. */
export function createArena(scene: THREE.Scene, g: Graphics) {
  scene.background = new THREE.Color(0x0d0f14);
  scene.fog = new THREE.Fog(0x0d0f14, 30, 70);
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2a2a30, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(-4, 14, 6);
  sun.castShadow = g.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera as THREE.OrthographicCamera;
  s.left = -FIELD.length / 2 - 1;
  s.right = FIELD.length / 2 + 1;
  s.top = FIELD.width / 2 + 1;
  s.bottom = -FIELD.width / 2 - 1;
  s.near = 1;
  s.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xbcd0ff, 0.5);
  fill.position.set(6, 8, -6);
  scene.add(fill);

  // Lighting truss over the field.
  const truss = new THREE.MeshStandardMaterial({ color: 0x30333a, metalness: 0.6, roughness: 0.5 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 });
  for (const z of [-FIELD.width / 2 - 1.5, FIELD.width / 2 + 1.5]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(FIELD.length + 6, 0.35, 0.35), truss);
    beam.position.set(0, 7.5, z);
    scene.add(beam);
    for (let k = -3; k <= 3; k++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.4), lamp);
      l.position.set(k * 2.6, 7.25, z);
      scene.add(l);
    }
    for (const x of [-FIELD.length / 2 - 3, FIELD.length / 2 + 3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.5, 0.35), truss);
      post.position.set(x, 3.75, z);
      scene.add(post);
    }
  }
  // Field scoreboard screens at each end.
  for (const sgn of [-1, 1]) {
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 4.2), new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0x112244, emissiveIntensity: 0.6 }));
    screen.position.set(sgn * (FIELD.length / 2 + 4.5), 4.2, 0);
    scene.add(screen);
  }
  // Stands.
  const stand = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 1 });
  for (const sgn of [-1, 1]) {
    for (let r = 0; r < 6; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(FIELD.length + 4, 0.45, 0.9), stand);
      step.position.set(0, 0.22 + r * 0.45, sgn * (FIELD.width / 2 + 3 + r * 0.9));
      step.receiveShadow = true;
      scene.add(step);
    }
  }
  return { sun };
}
