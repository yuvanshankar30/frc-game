import * as THREE from 'three';
import type { RobotDefinition } from './schema';

const texCache = new Map<string, THREE.Texture>();

/** Fabric (cordura) texture in the alliance color. */
function fabricTex(color: number) {
  const key = `fabric|${color}`;
  let t = texCache.get(key);
  if (t) return t;
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#' + color.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.05})`;
    g.fillRect(0, y, 128, 1);
  }
  for (let x = 0; x < 128; x += 2) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    g.fillRect(x, 0, 1, 128);
  }
  t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** Team number decal (white, outlined). */
function numberTex(label: string) {
  const key = `num|${label}`;
  let t = texCache.get(key);
  if (t) return t;
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 160);
  g.font = 'italic 800 132px "Barlow Condensed", "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.strokeText(label, 256, 86);
  g.fillStyle = '#f4f6f8';
  g.fillText(label, 256, 86);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** Rounded-rectangle outline shape centered at the origin. */
function roundRect(w: number, h: number, r: number, hole = false) {
  const s = hole ? new THREE.Path() : new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/**
 * Bumpers: one continuous ring with rounded outer corners and a soft bevel (foam under cordura),
 * a darker seam stripe, and the team number on all four sides.
 */
export function makeBumpers(def: RobotDefinition, color: number, label: string) {
  const g = new THREE.Group();
  g.name = 'bumpers';
  const f = def.frame;
  const t = f.bumperThickness;
  const h = f.bumperHeight;
  const L = f.length;
  const W = f.width;
  const outer = roundRect(L + 2 * t, W + 2 * t, Math.min(t * 0.9, 0.06)) as THREE.Shape;
  outer.holes.push(roundRect(L, W, 0.004, true) as THREE.Path);
  const bevel = Math.min(h * 0.22, t * 0.3);
  const geo = new THREE.ExtrudeGeometry(outer, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 4, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, f.bumperBottom + bevel, 0);
  // Planar UVs around the ring so the fabric weave runs horizontally.
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uv[i * 2] = (Math.atan2(z, x) / (Math.PI * 2)) * 6 + 0.5;
    uv[i * 2 + 1] = (pos.getY(i) - f.bumperBottom) / h;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const fabric = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, map: fabricTex(color), roughness: 0.95, metalness: 0 });
  const ring = new THREE.Mesh(geo, fabric);
  ring.name = 'bumper_ring';
  g.add(ring);
  // Seam: thin darker band at mid-height.
  const seamGeo = new THREE.ExtrudeGeometry(roundRect(L + 2 * t + 0.004, W + 2 * t + 0.004, Math.min(t * 0.9, 0.06)) as THREE.Shape, { depth: 0.004, bevelEnabled: false, curveSegments: 10 });
  (seamGeo as THREE.ExtrudeGeometry).rotateX(-Math.PI / 2);
  seamGeo.translate(0, f.bumperBottom + h * 0.5, 0);
  const seam = new THREE.Mesh(seamGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.9 }));
  seam.scale.set(1, 1, 1);
  seam.name = 'bumper_seam';
  g.add(seam);
  // Team numbers on each face.
  const num = new THREE.MeshBasicMaterial({ map: numberTex(label), transparent: true, depthWrite: false });
  const y = f.bumperBottom + h / 2;
  const nh = h * 0.86;
  const out = bevel * 0.9 + 0.004; // numbers sit just outside the bevel bulge
  const place = (px: number, pz: number, ry: number, span: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(span * 0.75, nh * 3.2), nh), num);
    p.position.set(px, y, pz);
    p.rotation.y = ry;
    p.name = 'bumper_number';
    p.renderOrder = 3;
    g.add(p);
  };
  place(0, W / 2 + t + out, 0, L);
  place(0, -(W / 2 + t + out), Math.PI, L);
  place(L / 2 + t + out, 0, Math.PI / 2, W);
  place(-(L / 2 + t + out), 0, -Math.PI / 2, W);
  return g;
}
