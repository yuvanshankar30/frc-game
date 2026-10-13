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
  // Bleachers along both sides: aluminum bench and foot planks on open frames (instanced, a few draw calls).
  const plank = new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.6, roughness: 0.45 });
  const foot = new THREE.MeshStandardMaterial({ color: 0x8b9099, metalness: 0.6, roughness: 0.5 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x5b6069, metalness: 0.6, roughness: 0.5 });
  const ROWS = 9;
  const RISE = 0.42;
  const RUN = 0.8;
  const len = FIELD.length + 3;
  const benches = new THREE.InstancedMesh(new THREE.BoxGeometry(len, 0.05, 0.3), plank, ROWS * 2);
  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(len, 0.04, 0.42), foot, ROWS * 2);
  const nFrames = 9;
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 1, 0.06), frameMat, nFrames * 2 * (ROWS + 1));
  const stringers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.08, 1), frameMat, nFrames * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  let bi = 0;
  let li = 0;
  let si = 0;
  for (const sgn of [-1, 1]) {
    const z0 = sgn * (FIELD.width / 2 + 1.5);
    for (let r = 0; r < ROWS; r++) {
      const z = z0 + sgn * r * RUN;
      const y = 0.45 + r * RISE;
      benches.setMatrixAt(bi, m.compose(v.set(0, y, z + sgn * 0.18), q.identity(), new THREE.Vector3(1, 1, 1)));
      boards.setMatrixAt(bi++, m.compose(v.set(0, y - 0.25, z - sgn * 0.2), q.identity(), new THREE.Vector3(1, 1, 1)));
    }
    for (let f = 0; f < nFrames; f++) {
      const x = -len / 2 + 0.3 + (f * (len - 0.6)) / (nFrames - 1);
      // Vertical legs under each row, and a sloped stringer along the rows.
      for (let r = 0; r <= ROWS; r++) {
        const h = 0.2 + r * RISE;
        legs.setMatrixAt(li++, m.compose(v.set(x, h / 2, z0 + sgn * (r * RUN - 0.25)), q.identity(), new THREE.Vector3(1, h, 1)));
      }
      const run = ROWS * RUN;
      const rise = ROWS * RISE;
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -sgn * Math.atan2(rise, run));
      stringers.setMatrixAt(si++, m.compose(v.set(x, 0.25 + rise / 2, z0 + sgn * (run / 2 - 0.25)), q, new THREE.Vector3(1, 1, Math.hypot(run, rise))));
    }
  }
  for (const im of [benches, boards, legs, stringers]) {
    im.receiveShadow = true;
    scene.add(im);
  }
  return { sun };
}
