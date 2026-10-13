import * as THREE from 'three';
import { FIELD } from './dims';

/** Procedural carpet: dark slate with the bright and dark speckle of competition carpet, and faint seams. */
export function createCarpetTexture() {
  const W = 4096;
  const H = Math.round((W * FIELD.width) / FIELD.length);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#41464f';
  g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = Math.random();
    // Mostly fine grain, a sprinkle of light and dark flecks.
    const n = r < 0.035 ? 70 + Math.random() * 60 : r < 0.09 ? -38 : (Math.random() - 0.5) * 16;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 1.08;
  }
  g.putImageData(img, 0, 0);
  // Carpet seams every ~12ft.
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 3;
  const seams = 4;
  for (let k = 1; k < seams; k++) {
    const y = (k * H) / seams;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** An AprilTag-style marker (36h11 look: white border, black frame, random bit grid) on a white sign. */
export function aprilTagTexture(seed: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#0b0b0b';
  g.fillRect(16, 16, 96, 96);
  let x = seed * 2654435761;
  const rnd = () => {
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    return x / 4294967296;
  };
  g.fillStyle = '#f2f2f2';
  const cell = 96 / 8;
  for (let i = 1; i < 7; i++) for (let j = 1; j < 7; j++) if (rnd() < 0.5) g.fillRect(16 + i * cell, 16 + j * cell, cell, cell);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/** Black netting (diamond mesh) with transparent holes. */
export function netTexture(repeatX: number, repeatY: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#0a0a0c';
  g.lineWidth = 3;
  for (let k = -64; k <= 64; k += 16) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 64, 64);
    g.stroke();
    g.beginPath();
    g.moveTo(k + 64, 0);
    g.lineTo(k, 64);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}
