import * as THREE from 'three';
import type { RobotDefinition } from './schema';

/** Team number texture for the bumper side. */
function numberTexture(label: string, color: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.fillRect(0, 0, c.width, c.height);
  // Fabric texture noise.
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 512, Math.random() * 128, 2, 2);
  }
  g.fillStyle = '#ffffff';
  g.font = 'bold 96px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Alliance-colored bumpers around the frame perimeter, with the team number on each side. */
export function makeBumpers(def: RobotDefinition, color: number, label: string) {
  const g = new THREE.Group();
  g.name = 'bumpers';
  const f = def.frame;
  const t = f.bumperThickness;
  const h = f.bumperHeight;
  const y = f.bumperBottom + h / 2;
  const L = f.length;
  const W = f.width;
  const plain = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const numbered = new THREE.MeshStandardMaterial({ map: numberTexture(label, color), roughness: 0.85 });
  const mats = (sideHasNumber: 'x' | 'z') => {
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    const arr: THREE.Material[] = [plain, plain, plain, plain, plain, plain];
    if (sideHasNumber === 'x') {
      arr[0] = numbered;
      arr[1] = numbered;
    } else {
      arr[4] = numbered;
      arr[5] = numbered;
    }
    return arr;
  };
  // Front/back (along Z, numbers face ±X)
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(t, h, W + 2 * t), mats('x'));
    m.position.set(s * (L / 2 + t / 2), y, 0);
    g.add(m);
  }
  // Sides (along X, numbers face ±Z)
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(L, h, t), mats('z'));
    m.position.set(0, y, s * (W / 2 + t / 2));
    g.add(m);
  }
  // Rounded corner caps look nicer.
  const capGeo = new THREE.CylinderGeometry(t / 2, t / 2, h, 10);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(capGeo, plain);
      m.position.set(sx * (L / 2 + t / 2), y, sz * (W / 2 + t / 2));
      g.add(m);
    }
  return g;
}
