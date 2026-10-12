import * as THREE from 'three';
import { FIELD } from './dims';

/** Procedural carpet: grey with subtle noise and faint seams. */
export function createCarpetTexture() {
  const W = 2048;
  const H = Math.round((W * FIELD.width) / FIELD.length);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5d6066';
  g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // Carpet seams every ~12ft.
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 2;
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
