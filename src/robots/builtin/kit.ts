import * as THREE from 'three';
import { inches } from '../../util/units';

/**
 * Procedural FRC-part kit used to model the built-in robots.
 * Everything is in the robot frame: +X forward, +Y up, +Z right, meters.
 * Every helper names its meshes so the robot definition can map them to joints.
 */

type V3 = [number, number, number];
const matCache = new Map<string, THREE.Material>();

export function mat(color: number, opts: { metal?: number; rough?: number; opacity?: number; emissive?: number; map?: THREE.Texture } = {}) {
  const key = `${color}|${opts.metal ?? 0}|${opts.rough ?? 0.6}|${opts.opacity ?? 1}|${opts.emissive ?? 0}|${opts.map?.uuid ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      map: opts.map ?? null,
      metalness: opts.metal ?? 0,
      roughness: opts.rough ?? 0.6,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
      depthWrite: (opts.opacity ?? 1) >= 1,
      emissive: opts.emissive ?? 0,
      emissiveIntensity: opts.emissive ? 1.2 : 0,
      side: (opts.opacity ?? 1) < 1 ? THREE.DoubleSide : THREE.FrontSide,
    });
    matCache.set(key, m);
  }
  return m;
}

// ------------------------------------------------------------------ textures

const texCache = new Map<string, THREE.Texture>();
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  let t = texCache.get(key);
  if (t) return t;
  if (typeof document === 'undefined') {
    // Headless (unit tests): no canvas available, use a blank texture.
    t = new THREE.Texture();
    texCache.set(key, t);
    return t;
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  texCache.set(key, t);
  return t;
}

/** Pre-drilled aluminum tube (WCP / TTB style hole pattern every 0.5in). */
function tubeTex() {
  return canvasTex(
    'tube',
    128,
    32,
    (g) => {
      g.fillStyle = '#c9ced4';
      g.fillRect(0, 0, 128, 32);
      g.fillStyle = 'rgba(0,0,0,0.04)';
      for (let i = 0; i < 128; i += 2) g.fillRect(i, 0, 1, 32);
      g.fillStyle = '#4a4f57';
      for (let x = 8; x < 128; x += 16) {
        g.beginPath();
        g.arc(x, 16, 4, 0, Math.PI * 2);
        g.fill();
      }
    },
    [6, 1],
  );
}

/** See-through knotted net. */
function netTex() {
  return canvasTex(
    'net',
    64,
    64,
    (g) => {
      g.strokeStyle = 'rgba(25,25,28,1)';
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
    },
    [10, 10],
  );
}

/** Sticker / decal texture with text lines (sponsor panels, team name plates). */
export function decalTex(lines: string[], opts: { bg?: string; fg?: string; w?: number; h?: number; font?: string } = {}) {
  const key = `decal|${lines.join('|')}|${opts.bg}|${opts.fg}`;
  return canvasTex(key, opts.w ?? 512, opts.h ?? 256, (g) => {
    const W = opts.w ?? 512;
    const H = opts.h ?? 256;
    if (opts.bg) {
      g.fillStyle = opts.bg;
      g.fillRect(0, 0, W, H);
    } else g.clearRect(0, 0, W, H);
    g.fillStyle = opts.fg ?? '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((l, i) => {
      const size = i === 0 ? Math.min(H / (n + 0.5), (W / Math.max(4, l.length)) * 1.7) : Math.min(H / (n + 2), (W / Math.max(6, l.length)) * 1.4);
      g.font = `${i === 0 ? 800 : 600} ${size}px ${opts.font ?? 'Inter, Arial, sans-serif'}`;
      g.fillText(l, W / 2, (H * (i + 0.5)) / n);
    });
  });
}

export const M = {
  alu: () => mat(0xc4c9cf, { metal: 0.8, rough: 0.35 }),
  tube: () => mat(0xffffff, { metal: 0.6, rough: 0.4, map: tubeTex() }),
  aluDark: () => mat(0x6d737b, { metal: 0.7, rough: 0.4 }),
  black: () => mat(0x1b1c1f, { rough: 0.7 }),
  anodBlack: () => mat(0x26282d, { metal: 0.5, rough: 0.45 }),
  rubber: () => mat(0x141414, { rough: 0.95 }),
  polycarb: () => mat(0xe6f0fa, { opacity: 0.18, rough: 0.05 }),
  smoke: () => mat(0x2a3038, { opacity: 0.55, rough: 0.1 }),
  smokeDark: () => mat(0x15181d, { opacity: 0.78, rough: 0.1 }),
  orange: () => mat(0xff7a1a, { rough: 0.5 }),
  green: () => mat(0x30c050, { rough: 0.5 }),
  copper: () => mat(0xb87333, { metal: 0.8, rough: 0.3 }),
  kraken: () => mat(0x2a2d33, { metal: 0.5, rough: 0.35 }),
  net: () => mat(0xffffff, { opacity: 0.999, rough: 0.9, map: netTex() }),
  grip: () => mat(0x26282b, { rough: 1 }),
  silicone: (c = 0x2a62ff) => mat(c, { rough: 0.85 }),
  belt: () => mat(0x111111, { rough: 0.9 }),
  steel: () => mat(0x9da3aa, { metal: 0.9, rough: 0.25 }),
};

// ------------------------------------------------------------------ shapes

/** Rectangle outline with a grid of triangular pockets (classic FRC lightening). */
function pocketedRectShape(w: number, h: number, rib: number, cell: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.closePath();
  const nx = Math.max(1, Math.floor((w - rib) / cell));
  const ny = Math.max(1, Math.floor((h - rib) / cell));
  const cw = (w - rib) / nx;
  const ch = (h - rib) / ny;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const x0 = -w / 2 + rib / 2 + i * cw;
      const y0 = -h / 2 + rib / 2 + j * ch;
      const r = rib / 2;
      // Two triangles per cell, separated by a diagonal rib.
      const a = new THREE.Path();
      a.moveTo(x0 + r * 1.4, y0 + r);
      a.lineTo(x0 + cw - r * 2.4, y0 + r);
      a.lineTo(x0 + r * 1.4, y0 + ch - r * 2.4);
      a.closePath();
      s.holes.push(a);
      const b = new THREE.Path();
      b.moveTo(x0 + cw - r, y0 + r * 2.4);
      b.lineTo(x0 + cw - r, y0 + ch - r);
      b.lineTo(x0 + r * 2.4, y0 + ch - r);
      b.closePath();
      s.holes.push(b);
    }
  return s;
}

/** Hood sector gear: pie slice with teeth on the arc and pocketed interior. */
function sectorShape(r: number, a0: number, a1: number, teeth: number) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  const steps = teeth * 2;
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps;
    const rr = k % 2 === 0 ? r : r * 0.965;
    s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  // Pockets: ring of triangles.
  const n = Math.max(2, Math.round((a1 - a0) / 0.35));
  for (let k = 0; k < n; k++) {
    const b0 = a0 + ((a1 - a0) * (k + 0.12)) / n;
    const b1 = a0 + ((a1 - a0) * (k + 0.88)) / n;
    const p = new THREE.Path();
    p.moveTo(Math.cos(b0) * r * 0.22, Math.sin(b0) * r * 0.22);
    p.lineTo(Math.cos(b0) * r * 0.82, Math.sin(b0) * r * 0.82);
    p.lineTo(Math.cos(b1) * r * 0.82, Math.sin(b1) * r * 0.82);
    p.lineTo(Math.cos(b1) * r * 0.22, Math.sin(b1) * r * 0.22);
    p.closePath();
    s.holes.push(p);
  }
  return s;
}

/** Lightened wheel/pulley disc. */
function spokedDiscShape(r: number, spokes: number) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  for (let k = 0; k < spokes; k++) {
    const a0 = (k / spokes) * Math.PI * 2 + 0.18;
    const a1 = ((k + 1) / spokes) * Math.PI * 2 - 0.18;
    const p = new THREE.Path();
    p.absarc(0, 0, r * 0.78, a0, a1, false);
    p.lineTo(Math.cos(a1) * r * 0.3, Math.sin(a1) * r * 0.3);
    p.absarc(0, 0, r * 0.3, a1, a0, true);
    p.closePath();
    s.holes.push(p);
  }
  return s;
}

export class Kit {
  readonly root = new THREE.Group();
  private n = 0;
  constructor(name: string) {
    this.root.name = name;
  }

  private uid(name: string) {
    return `${name}#${this.n++}`;
  }

  /** Add a mesh; `name` becomes a unique node name (returned). */
  add(mesh: THREE.Object3D, name: string, parent: THREE.Object3D = this.root) {
    mesh.name = name.includes('#') ? name : this.uid(name);
    parent.add(mesh);
    return mesh;
  }

  /** Named empty group (useful to map several meshes to a joint at once). */
  group(name: string, parent: THREE.Object3D = this.root) {
    const g = new THREE.Group();
    g.name = name; // groups keep exact names so definitions can reference them
    parent.add(g);
    return g;
  }

  box(name: string, c: V3, s: V3, material: THREE.Material | THREE.Material[], parent?: THREE.Object3D, rot?: V3) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), material);
    m.position.set(c[0], c[1], c[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    return this.add(m, name, parent) as THREE.Mesh;
  }

  /** Cylinder with axis along 'x' | 'y' | 'z'. */
  cyl(name: string, c: V3, r: number, len: number, axis: 'x' | 'y' | 'z', material: THREE.Material, parent?: THREE.Object3D, seg = 20) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), material);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    m.position.set(c[0], c[1], c[2]);
    return this.add(m, name, parent) as THREE.Mesh;
  }

  /** Extrude a 2D shape (drawn in the plane's local XY) into a plate of thickness `t`. */
  private extrude(name: string, shape: THREE.Shape, t: number, material: THREE.Material, plane: 'xy' | 'zy' | 'xz', c: V3, parent?: THREE.Object3D, flip = false) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 10 });
    geo.translate(0, 0, -t / 2);
    const m = new THREE.Mesh(geo, material);
    // Plate normals: 'xy' plate faces Z (side plates), 'zy' faces X (front/back), 'xz' faces Y (horizontal).
    if (plane === 'zy') m.rotation.y = Math.PI / 2;
    if (plane === 'xz') m.rotation.x = -Math.PI / 2;
    if (flip) m.rotation.y += Math.PI;
    m.position.set(c[0], c[1], c[2]);
    return this.add(m, name, parent) as THREE.Mesh;
  }

  /** Pocketed side plate standing in the XY plane (normal along Z). */
  pocketPlate(name: string, c: V3, w: number, h: number, opts: { t?: number; color?: number; plane?: 'xy' | 'zy' | 'xz'; rib?: number; cell?: number; parent?: THREE.Object3D } = {}) {
    const shape = pocketedRectShape(w, h, opts.rib ?? inches(0.5), opts.cell ?? inches(3));
    return this.extrude(name, shape, opts.t ?? inches(0.25), mat(opts.color ?? 0x24272d, { metal: 0.45, rough: 0.45 }), opts.plane ?? 'xy', c, opts.parent);
  }

  /** Hood / climber sector gear plate in the XY plane, pivot at c. Angles in radians. */
  sectorPlate(name: string, c: V3, r: number, a0: number, a1: number, opts: { t?: number; color?: number; parent?: THREE.Object3D; teeth?: number } = {}) {
    return this.extrude(name, sectorShape(r, a0, a1, opts.teeth ?? 24), opts.t ?? inches(0.25), mat(opts.color ?? 0x24272d, { metal: 0.5, rough: 0.4 }), 'xy', c, opts.parent);
  }

  /** Spoked pulley / sprocket disc (XY plane, axis along Z). */
  pulley(name: string, c: V3, r: number, opts: { t?: number; color?: number; parent?: THREE.Object3D; spokes?: number } = {}) {
    return this.extrude(name, spokedDiscShape(r, opts.spokes ?? 5), opts.t ?? inches(0.375), mat(opts.color ?? 0x8a9099, { metal: 0.7, rough: 0.35 }), 'xy', c, opts.parent);
  }

  /** 2x1 pre-drilled aluminum tube between two points (axis-aligned). */
  tube(name: string, a: V3, b: V3, size: [number, number] = [inches(2), inches(1)], parent?: THREE.Object3D, material?: THREE.Material) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const c: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const ax = Math.abs(d.x) >= Math.abs(d.y) && Math.abs(d.x) >= Math.abs(d.z) ? 'x' : Math.abs(d.y) >= Math.abs(d.z) ? 'y' : 'z';
    const s: V3 = ax === 'x' ? [len, size[1], size[0]] : ax === 'y' ? [size[0], len, size[1]] : [size[0], size[1], len];
    return this.box(name, c, s, material ?? M.tube(), parent);
  }

  /** Frame perimeter of 2x1 tube with a bellypan and cross members. Returns the rail top height. */
  frame(L: number, W: number, y0 = inches(1.6)) {
    const t = inches(2);
    const h = inches(1);
    const y = y0 + h / 2;
    const g = this.group('frame');
    this.box('frame_rail_front', [L / 2 - t / 2, y, 0], [t, h, W], M.tube(), g);
    this.box('frame_rail_back', [-L / 2 + t / 2, y, 0], [t, h, W], M.tube(), g);
    this.box('frame_rail_left', [0, y, -W / 2 + t / 2], [L - 2 * t, h, t], M.tube(), g);
    this.box('frame_rail_right', [0, y, W / 2 - t / 2], [L - 2 * t, h, t], M.tube(), g);
    this.box('frame_cross', [0, y, 0], [L - 2 * t, h, inches(1)], M.tube(), g);
    this.box('bellypan', [0, y0 - 0.002, 0], [L - 0.01, 0.004, W - 0.01], mat(0x3a3f46, { metal: 0.6, rough: 0.5 }), g);
    // Corner gussets.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) this.box('gusset', [sx * (L / 2 - inches(3)), y0 + h + 0.002, sz * (W / 2 - inches(3))], [inches(4), 0.003, inches(4)], M.aluDark(), g);
    return y0 + h;
  }

  /**
   * SDS MK5n-style swerve module. The steering assembly (fork + wheel) is a named group so a
   * 'steer' joint can turn it; the wheel is its own group for a 'wheel' spin joint.
   */
  swerveModule(name: string, x: number, z: number, wheelR = inches(2), railTop = inches(2.6)) {
    const g = this.group(`${name}_module`);
    const plate = inches(5.4);
    this.box(`${name}_plate`, [x, railTop + 0.004, z], [plate, 0.008, plate], M.anodBlack(), g);
    this.cyl(`${name}_bearing`, [x, railTop + 0.01, z], inches(2), 0.012, 'y', M.aluDark(), g, 24);
    this.cyl(`${name}_drive_motor`, [x + inches(1.2), railTop + 0.05, z - inches(0.8)], inches(1.2), inches(2.3), 'y', M.kraken(), g);
    this.cyl(`${name}_drive_cap`, [x + inches(1.2), railTop + 0.08, z - inches(0.8)], inches(1.15), 0.005, 'y', M.orange(), g);
    this.cyl(`${name}_steer_motor`, [x - inches(1.2), railTop + 0.045, z + inches(0.9)], inches(1.0), inches(1.9), 'y', M.kraken(), g);
    this.cyl(`${name}_steer_cap`, [x - inches(1.2), railTop + 0.07, z + inches(0.9)], inches(0.95), 0.005, 'y', M.orange(), g);
    this.cyl(`${name}_encoder`, [x, railTop + 0.025, z], inches(0.7), 0.015, 'y', mat(0x1e64d0), g, 16);
    const steerName = `${name}_steer`;
    const steer = this.group(steerName, g);
    this.box(`${name}_fork_a`, [x, wheelR + 0.015, z - inches(1.05)], [inches(2.8), wheelR * 2 + 0.02, 0.006], M.aluDark(), steer);
    this.box(`${name}_fork_b`, [x, wheelR + 0.015, z + inches(1.05)], [inches(2.8), wheelR * 2 + 0.02, 0.006], M.aluDark(), steer);
    this.box(`${name}_bevel`, [x, wheelR, z + inches(1.25)], [inches(1.4), inches(1.4), inches(0.4)], M.anodBlack(), steer);
    const wheelName = `${name}_wheel`;
    const w = this.group(wheelName, steer);
    this.cyl(`${name}_tread`, [x, wheelR, z], wheelR, inches(1.5), 'z', M.rubber(), w, 28);
    this.cyl(`${name}_hub`, [x, wheelR, z], wheelR * 0.65, inches(1.55), 'z', M.aluDark(), w, 14);
    this.box(`${name}_spoke`, [x, wheelR, z], [wheelR * 1.25, 0.01, inches(1.56)], M.alu(), w);
    this.box(`${name}_spoke2`, [x, wheelR, z], [0.01, wheelR * 1.25, inches(1.56)], M.alu(), w);
    return { steer: steerName, wheel: wheelName };
  }

  /** Battery + PDH + roboRIO + radio cluster. */
  electronics(x: number, z: number, y: number) {
    const g = this.group('electronics');
    this.box('battery', [x, y + inches(3.5), z], [inches(7), inches(7), inches(3)], M.black(), g);
    this.box('battery_label', [x, y + inches(5), z + inches(1.52)], [inches(5), inches(2.5), 0.002], mat(0xe0b020), g);
    this.box('battery_lead_r', [x + inches(2), y + inches(7.2), z], [inches(0.5), inches(0.6), inches(0.5)], mat(0xc81e1e), g);
    this.box('pdh', [x + inches(6.5), y + 0.02, z], [inches(4), inches(1.6), inches(8)], mat(0xd02020), g);
    this.box('rio', [x - inches(6.5), y + 0.015, z], [inches(5.5), inches(1.2), inches(4)], mat(0xe9e9ee, { rough: 0.4 }), g);
    this.box('radio', [x - inches(6.5), y + 0.04, z - inches(3.5)], [inches(3.5), inches(1), inches(2.5)], mat(0xf2f2f2), g);
  }

  /** Roller across Z (or X) with compliant wheels on a hex shaft. */
  roller(name: string, x: number, y: number, z0: number, z1: number, r: number, parent?: THREE.Object3D, wheelColor = 0x2a62ff, spacing = inches(2.2)) {
    const g = this.group(name, parent);
    const len = Math.abs(z1 - z0);
    const zc = (z0 + z1) / 2;
    this.cyl(`${name}_shaft`, [x, y, zc], inches(0.25), len + 0.02, 'z', M.steel(), g, 6);
    const n = Math.max(2, Math.round(len / spacing));
    for (let k = 0; k < n; k++) {
      const z = z0 + ((k + 0.5) * len) / n;
      this.cyl(`${name}_w${k}`, [x, y, z], r, inches(0.9), 'z', M.silicone(wheelColor), g, 14);
    }
    return g;
  }

  /** Full-length silicone/grip roller (tube roller) across Z. */
  tubeRoller(name: string, x: number, y: number, z0: number, z1: number, r: number, color = 0x2a2d33, parent?: THREE.Object3D) {
    const g = this.group(name, parent);
    const len = Math.abs(z1 - z0);
    this.cyl(`${name}_body`, [x, y, (z0 + z1) / 2], r, len, 'z', mat(color, { rough: 0.85 }), g, 18);
    this.box(`${name}_stripe`, [x, y + r, (z0 + z1) / 2], [inches(0.3), 0.004, len], mat(0xffffff, { rough: 0.6 }), g);
    return g;
  }

  /** Drum (single long cylinder) across Z. */
  drum(name: string, x: number, y: number, len: number, r: number, parent?: THREE.Object3D, material = M.grip()) {
    const g = this.group(name, parent);
    this.cyl(`${name}_body`, [x, y, 0], r, len, 'z', material, g, 32);
    for (let k = 0; k <= 4; k++) this.cyl(`${name}_band${k}`, [x, y, -len / 2 + (k * len) / 4], r * 1.025, 0.006, 'z', M.alu(), g, 32);
    this.box(`${name}_mark`, [x, y + r * 1.01, 0], [inches(0.4), 0.004, len * 0.98], M.orange(), g);
    return g;
  }

  /** Kraken X60 motor (visual) along an axis. */
  motor(name: string, c: V3, axis: 'x' | 'y' | 'z', parent?: THREE.Object3D, small = false) {
    const g = this.group(name, parent);
    const r = small ? inches(1.0) : inches(1.2);
    this.cyl(`${name}_can`, c, r, small ? inches(1.9) : inches(2.3), axis, M.kraken(), g);
    const cap: V3 = [...c];
    const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    cap[k] += small ? inches(0.97) : inches(1.17);
    this.cyl(`${name}_cap`, cap, r * 0.96, 0.006, axis, M.orange(), g);
    return g;
  }

  /** Plain plate (solid). */
  plate(name: string, c: V3, s: V3, parent?: THREE.Object3D, color = 0x2b2f36) {
    return this.box(name, c, s, mat(color, { metal: 0.3, rough: 0.5 }), parent);
  }

  /**
   * Polycarbonate hopper box with aluminum angle edges. `open` omits a face ('top', 'front', 'back').
   * `decals` puts sticker text on the side panels.
   */
  polyBox(
    name: string,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    opts: { smoked?: boolean | 'dark'; open?: ('top' | 'front' | 'back')[]; decals?: string[]; decalColor?: string; parent?: THREE.Object3D; edge?: THREE.Material } = {},
  ) {
    const g = this.group(name, opts.parent);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const L = Math.abs(x1 - x0);
    const W = Math.abs(z1 - z0);
    const H = y1 - y0;
    const panel = opts.smoked === 'dark' ? M.smokeDark() : opts.smoked ? M.smoke() : M.polycarb();
    const open = new Set(opts.open ?? ['top']);
    this.box(`${name}_side_l`, [cx, (y0 + y1) / 2, z0], [L, H, 0.003], panel, g);
    this.box(`${name}_side_r`, [cx, (y0 + y1) / 2, z1], [L, H, 0.003], panel, g);
    if (!open.has('front')) this.box(`${name}_front`, [x1, (y0 + y1) / 2, cz], [0.003, H, W], panel, g);
    if (!open.has('back')) this.box(`${name}_back`, [x0, (y0 + y1) / 2, cz], [0.003, H, W], panel, g);
    if (!open.has('top')) this.box(`${name}_roof`, [cx, y1, cz], [L, 0.003, W], panel, g);
    const edge = opts.edge ?? M.alu();
    for (const x of [x0, x1]) for (const z of [z0, z1]) this.box(`${name}_post`, [x, (y0 + y1) / 2, z], [inches(0.75), H, inches(0.75)], edge, g);
    for (const z of [z0, z1]) this.box(`${name}_rim`, [cx, y1, z], [L, inches(0.75), inches(0.75)], edge, g);
    for (const x of [x0, x1]) this.box(`${name}_rimx`, [x, y1, cz], [inches(0.75), inches(0.75), W], edge, g);
    if (opts.decals?.length) {
      const tex = decalTex(opts.decals, { fg: opts.decalColor ?? '#ffffff' });
      const dm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      for (const [z, flip] of [
        [z0 - 0.003, true],
        [z1 + 0.003, false],
      ] as const) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.8, H * 0.55), dm);
        p.position.set(cx, (y0 + y1) / 2, z);
        if (flip) p.rotation.y = Math.PI;
        this.add(p, `${name}_decal`, g);
      }
    }
    return g;
  }

  /** Net hopper: posts + see-through net walls. */
  netHopper(name: string, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, parent?: THREE.Object3D, top = true) {
    const g = this.group(name, parent);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const L = Math.abs(x1 - x0);
    const W = Math.abs(z1 - z0);
    const H = y1 - y0;
    for (const x of [x0, x1]) for (const z of [z0, z1]) this.box(`${name}_post`, [x, (y0 + y1) / 2, z], [0.02, H, 0.02], M.alu(), g);
    this.box(`${name}_net_l`, [cx, (y0 + y1) / 2, z0], [L, H, 0.003], M.net(), g);
    this.box(`${name}_net_r`, [cx, (y0 + y1) / 2, z1], [L, H, 0.003], M.net(), g);
    this.box(`${name}_net_f`, [x1, (y0 + y1) / 2, cz], [0.003, H, W], M.net(), g);
    this.box(`${name}_net_b`, [x0, (y0 + y1) / 2, cz], [0.003, H, W], M.net(), g);
    if (top) this.box(`${name}_net_top`, [cx, y1, cz], [L, 0.003, W], M.net(), g);
    this.box(`${name}_rim_l`, [cx, y1, z0], [L, 0.012, 0.012], M.alu(), g);
    this.box(`${name}_rim_r`, [cx, y1, z1], [L, 0.012, 0.012], M.alu(), g);
    return g;
  }

  /** Limelight 4 camera. */
  limelight(c: V3, yaw = 0, parent?: THREE.Object3D) {
    const g = this.group('limelight', parent);
    const b = this.box('ll_body', c, [inches(1.5), inches(2.3), inches(3.8)], M.black(), g);
    b.rotation.y = yaw;
    this.box('ll_lens', [c[0] + Math.cos(yaw) * inches(0.78), c[1], c[2] - Math.sin(yaw) * inches(0.78)], [0.003, inches(0.8), inches(0.8)], mat(0x22ff66, { emissive: 0x22ff66 }), g);
    return g;
  }

  /** Small global-shutter camera (AprilTag cameras). */
  camera(name: string, c: V3, yaw = 0, parent?: THREE.Object3D) {
    const b = this.box(name, c, [inches(1), inches(1), inches(1.4)], M.black(), parent);
    b.rotation.y = yaw;
    return b;
  }

  /** LED strip. */
  led(name: string, c: V3, s: V3, color = 0x8844ff, parent?: THREE.Object3D) {
    return this.box(name, c, s, mat(color, { emissive: color }), parent);
  }

  /** Belt or chain run between two pulleys in the XY plane at depth z (visual). */
  belt(name: string, a: [number, number], b: [number, number], z: number, parent?: THREE.Object3D) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const m = this.box(name, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z], [len, inches(0.15), inches(0.375)], M.belt(), parent);
    m.rotation.z = Math.atan2(dy, dx);
    return m;
  }
}
