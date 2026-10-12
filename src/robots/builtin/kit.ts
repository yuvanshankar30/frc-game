import * as THREE from 'three';
import { inches } from '../../util/units';

/**
 * Procedural FRC-part kit used to model the built-in robots.
 * Everything is in the robot frame: +X forward, +Y up, +Z right, meters.
 * Every helper names its meshes so the robot definition can map them to joints.
 */

const matCache = new Map<string, THREE.Material>();

export function mat(color: number, opts: { metal?: number; rough?: number; opacity?: number; emissive?: number } = {}) {
  const key = `${color}|${opts.metal ?? 0}|${opts.rough ?? 0.6}|${opts.opacity ?? 1}|${opts.emissive ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
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

export const M = {
  alu: () => mat(0xc4c9cf, { metal: 0.8, rough: 0.35 }),
  aluDark: () => mat(0x6d737b, { metal: 0.7, rough: 0.4 }),
  black: () => mat(0x1b1c1f, { rough: 0.7 }),
  rubber: () => mat(0x141414, { rough: 0.95 }),
  polycarb: () => mat(0xdfeaf5, { opacity: 0.28, rough: 0.1 }),
  smoke: () => mat(0x404850, { opacity: 0.45, rough: 0.15 }),
  orange: () => mat(0xff7a1a, { rough: 0.5 }),
  green: () => mat(0x30c050, { rough: 0.5 }),
  copper: () => mat(0xb87333, { metal: 0.8, rough: 0.3 }),
  kraken: () => mat(0x2a2d33, { metal: 0.5, rough: 0.35 }),
  net: () => netMaterial(),
  grip: () => mat(0x26282b, { rough: 1 }),
};

let netMat: THREE.Material | null = null;
/** See-through knotted net (hopper netting). */
function netMaterial() {
  if (netMat) return netMat;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(30,30,34,1)';
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
  tex.repeat.set(10, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  netMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.9 });
  return netMat;
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

  box(name: string, c: [number, number, number], s: [number, number, number], material: THREE.Material, parent?: THREE.Object3D, rot?: [number, number, number]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), material);
    m.position.set(c[0], c[1], c[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    return this.add(m, name, parent) as THREE.Mesh;
  }

  /** Cylinder with axis along 'x' | 'y' | 'z'. */
  cyl(name: string, c: [number, number, number], r: number, len: number, axis: 'x' | 'y' | 'z', material: THREE.Material, parent?: THREE.Object3D, seg = 20) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), material);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    m.position.set(c[0], c[1], c[2]);
    return this.add(m, name, parent) as THREE.Mesh;
  }

  /** 2x1 aluminum tube between two points (axis-aligned). */
  tube(name: string, a: [number, number, number], b: [number, number, number], size: [number, number] = [inches(2), inches(1)], parent?: THREE.Object3D) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const c: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const ax = Math.abs(d.x) >= Math.abs(d.y) && Math.abs(d.x) >= Math.abs(d.z) ? 'x' : Math.abs(d.y) >= Math.abs(d.z) ? 'y' : 'z';
    const s: [number, number, number] = ax === 'x' ? [len, size[1], size[0]] : ax === 'y' ? [size[0], len, size[1]] : [size[0], size[1], len];
    return this.box(name, c, s, M.alu(), parent);
  }

  /**
   * Frame perimeter of 2x1 tube with a bellypan. Returns the rail height (top).
   * length along X, width along Z.
   */
  frame(L: number, W: number, y0 = inches(1.6)) {
    const t = inches(2);
    const h = inches(1);
    const y = y0 + h / 2;
    const g = this.group('frame');
    this.box('frame_rail_front', [L / 2 - t / 2, y, 0], [t, h, W], M.alu(), g);
    this.box('frame_rail_back', [-L / 2 + t / 2, y, 0], [t, h, W], M.alu(), g);
    this.box('frame_rail_left', [0, y, -W / 2 + t / 2], [L - 2 * t, h, t], M.alu(), g);
    this.box('frame_rail_right', [0, y, W / 2 - t / 2], [L - 2 * t, h, t], M.alu(), g);
    this.box('bellypan', [0, y0 - 0.002, 0], [L - 0.01, 0.004, W - 0.01], M.aluDark(), g);
    return y0 + h;
  }

  /**
   * MK5n/MK4i-style swerve module at a frame corner. The wheel is put in its own named
   * group so a 'wheel' joint can spin it. Returns the wheel group name.
   */
  swerveModule(name: string, x: number, z: number, wheelR = inches(2), railTop = inches(2.6)) {
    const g = this.group(`${name}_module`);
    // Top plate + motors.
    const plate = inches(5.2);
    this.box(`${name}_plate`, [x, railTop + 0.004, z], [plate, 0.008, plate], M.aluDark(), g);
    this.cyl(`${name}_drive_motor`, [x + 0.025, railTop + 0.05, z - 0.018], inches(1.2), inches(2.3), 'y', M.kraken(), g);
    this.cyl(`${name}_steer_motor`, [x - 0.025, railTop + 0.045, z + 0.02], inches(1.0), inches(1.9), 'y', M.kraken(), g);
    this.cyl(`${name}_motor_cap`, [x + 0.025, railTop + 0.083, z - 0.018], inches(1.2), 0.006, 'y', M.orange(), g);
    // Fork + wheel (wheel spins about Z).
    this.box(`${name}_fork_a`, [x, wheelR + 0.02, z - inches(1.1)], [inches(2.6), wheelR * 2 + 0.03, 0.006], M.alu(), g);
    this.box(`${name}_fork_b`, [x, wheelR + 0.02, z + inches(1.1)], [inches(2.6), wheelR * 2 + 0.03, 0.006], M.alu(), g);
    const wheelName = `${name}_wheel`;
    const w = this.group(wheelName, g);
    this.cyl(`${name}_tread`, [x, wheelR, z], wheelR, inches(1.5), 'z', M.rubber(), w, 24);
    this.cyl(`${name}_hub`, [x, wheelR, z], wheelR * 0.62, inches(1.55), 'z', M.alu(), w, 12);
    this.box(`${name}_spoke`, [x, wheelR, z], [wheelR * 1.3, 0.008, inches(1.56)], M.aluDark(), w);
    return wheelName;
  }

  /** FRC battery + PDH + roboRIO cluster for visual detail. */
  electronics(x: number, z: number, y: number) {
    const g = this.group('electronics');
    this.box('battery', [x, y + inches(3.5), z], [inches(7), inches(7), inches(3)], M.black(), g);
    this.box('battery_label', [x, y + inches(5), z + inches(1.52)], [inches(5), inches(2.5), 0.002], mat(0xe0b020), g);
    this.box('pdh', [x + inches(6.5), y + 0.02, z], [inches(4), inches(1.6), inches(8)], mat(0xd02020), g);
    this.box('rio', [x - inches(6.5), y + 0.015, z], [inches(5.5), inches(1.2), inches(4)], mat(0xe9e9ee, { rough: 0.4 }), g);
    this.box('radio', [x - inches(6.5), y + 0.04, z - inches(3.5)], [inches(3.5), inches(1), inches(2.5)], mat(0xf2f2f2), g);
  }

  /** Roller across Z with compliant wheels. */
  roller(name: string, x: number, y: number, z0: number, z1: number, r: number, parent?: THREE.Object3D, wheelColor = 0x2a62ff) {
    const g = this.group(name, parent);
    const len = Math.abs(z1 - z0);
    const zc = (z0 + z1) / 2;
    this.cyl(`${name}_shaft`, [x, y, zc], inches(0.25), len + 0.02, 'z', M.aluDark(), g, 8);
    const n = Math.max(2, Math.round(len / inches(2.2)));
    for (let k = 0; k < n; k++) {
      const z = z0 + ((k + 0.5) * len) / n;
      this.cyl(`${name}_w${k}`, [x, y, z], r, inches(0.9), 'z', mat(wheelColor, { rough: 0.8 }), g, 14);
    }
    return g;
  }

  /** Drum (single long cylinder) across Z. */
  drum(name: string, x: number, y: number, len: number, r: number, parent?: THREE.Object3D, material = M.grip()) {
    const g = this.group(name, parent);
    this.cyl(`${name}_body`, [x, y, 0], r, len, 'z', material, g, 28);
    for (let k = 0; k <= 4; k++) {
      this.cyl(`${name}_band${k}`, [x, y, -len / 2 + (k * len) / 4], r * 1.02, 0.006, 'z', M.alu(), g, 28);
    }
    return g;
  }

  /** Kraken X60 motor (visual) along an axis. */
  motor(name: string, c: [number, number, number], axis: 'x' | 'y' | 'z', parent?: THREE.Object3D) {
    const g = this.group(name, parent);
    this.cyl(`${name}_can`, c, inches(1.2), inches(2.3), axis, M.kraken(), g);
    const cap: [number, number, number] = [...c];
    const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    cap[k] += inches(1.2);
    this.cyl(`${name}_cap`, cap, inches(1.2), 0.006, axis, M.orange(), g);
    return g;
  }

  /** Vertical side plates with lightening pattern (just plates). */
  plate(name: string, c: [number, number, number], s: [number, number, number], parent?: THREE.Object3D, color = 0x2b2f36) {
    return this.box(name, c, s, mat(color, { metal: 0.3, rough: 0.5 }), parent);
  }

  /** Netted hopper: posts + translucent net walls. */
  netHopper(name: string, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, parent?: THREE.Object3D) {
    const g = this.group(name, parent);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const L = Math.abs(x1 - x0);
    const W = Math.abs(z1 - z0);
    const H = y1 - y0;
    for (const x of [x0, x1])
      for (const z of [z0, z1]) this.box(`${name}_post`, [x, (y0 + y1) / 2, z], [0.02, H, 0.02], M.alu(), g);
    this.box(`${name}_net_l`, [cx, (y0 + y1) / 2, z0], [L, H, 0.004], M.net(), g);
    this.box(`${name}_net_r`, [cx, (y0 + y1) / 2, z1], [L, H, 0.004], M.net(), g);
    this.box(`${name}_net_f`, [x1, (y0 + y1) / 2, cz], [0.004, H, W], M.net(), g);
    this.box(`${name}_net_b`, [x0, (y0 + y1) / 2, cz], [0.004, H, W], M.net(), g);
    this.box(`${name}_rim_l`, [cx, y1, z0], [L, 0.012, 0.012], M.alu(), g);
    this.box(`${name}_rim_r`, [cx, y1, z1], [L, 0.012, 0.012], M.alu(), g);
    return g;
  }

  /** Polycarbonate walled hopper. */
  polyHopper(name: string, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, parent?: THREE.Object3D, roof = false) {
    const g = this.group(name, parent);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const L = Math.abs(x1 - x0);
    const W = Math.abs(z1 - z0);
    const H = y1 - y0;
    this.box(`${name}_wall_l`, [cx, (y0 + y1) / 2, z0], [L, H, 0.003], M.polycarb(), g);
    this.box(`${name}_wall_r`, [cx, (y0 + y1) / 2, z1], [L, H, 0.003], M.polycarb(), g);
    this.box(`${name}_wall_f`, [x1, (y0 + y1) / 2, cz], [0.003, H, W], M.polycarb(), g);
    if (roof) this.box(`${name}_roof`, [cx, y1, cz], [L, 0.003, W], M.polycarb(), g);
    for (const x of [x0, x1]) for (const z of [z0, z1]) this.box(`${name}_edge`, [x, (y0 + y1) / 2, z], [0.012, H, 0.012], M.alu(), g);
    return g;
  }

  /** Limelight camera. */
  limelight(c: [number, number, number], yaw = 0) {
    const g = this.group('limelight');
    const b = this.box('ll_body', c, [inches(1.5), inches(2.3), inches(3.8)], M.black(), g);
    b.rotation.y = yaw;
    this.box('ll_lens', [c[0] + Math.cos(yaw) * inches(0.78), c[1], c[2] - Math.sin(yaw) * inches(0.78)], [0.003, inches(0.8), inches(0.8)], mat(0x22ff66, { emissive: 0x22ff66 }), g);
  }

  /** LED strip. */
  led(name: string, c: [number, number, number], s: [number, number, number], color = 0x8844ff) {
    return this.box(name, c, s, mat(color, { emissive: color }));
  }
}
