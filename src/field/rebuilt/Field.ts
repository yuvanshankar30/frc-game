import * as THREE from 'three';
import { type World, MATERIAL, GROUP } from '../../physics/world';
import { StaticBuilder, sideTransform } from '../builder';
import { FuelSystem } from '../fuel';
import {
  FIELD, HUB, BUMP, TRENCH, DEPOT, OUTPOST, TOWER, FUEL, LANE, NEUTRAL_FUEL,
} from './dims';
import type { Alliance } from '../../game/scoring';
import { createCarpetTexture } from './textures';
import { inches } from '../../util/units';

export const ALLIANCE_COLOR: Record<Alliance, number> = { blue: 0x1f5fff, red: 0xe02020 };
const ALLIANCE_DARK: Record<Alliance, number> = { blue: 0x0a2a8a, red: 0x7a0c0c };

const HL = FIELD.length / 2;
const HW = FIELD.width / 2;

/** Apothem of the HUB's hexagonal opening. */
const HEX_APOTHEM = HUB.openingDiameter / 2;
const HUB_FLOOR = HUB.openingHeight - 0.42;

export interface HubInfo {
  alliance: Alliance;
  center: THREE.Vector3; // floor center
  target: THREE.Vector3; // aim point (center of the opening)
  /** Direction (+1/-1 on X) from the HUB toward the NEUTRAL ZONE. */
  exitDir: number;
  /** Visual panels that light up when active. */
  glow: THREE.MeshStandardMaterial;
}

export interface TowerInfo {
  alliance: Alliance;
  /** Point on the floor in front of the rungs where a robot lines up to climb. */
  climbPoint: THREE.Vector3;
  /** Yaw a robot faces when climbing (toward the alliance wall). */
  climbYaw: number;
  rungX: number;
  rungZ: number;
}

export interface OutpostInfo {
  alliance: Alliance;
  /** Where FUEL rolls out of the CHUTE into the field. */
  feedPoint: THREE.Vector3;
  feedDir: THREE.Vector3;
  /** FUEL in the CHUTE / human player's hands. */
  count: number;
  /** Corral opening region (balls that roll in are returned to the human player). */
  corralZ: number;
}

export interface DepotInfo {
  alliance: Alliance;
  center: THREE.Vector3;
}

export class Field {
  readonly root = new THREE.Group();
  readonly builder: StaticBuilder;
  readonly fuel: FuelSystem;
  readonly hubs: Record<Alliance, HubInfo>;
  readonly towers: Record<Alliance, TowerInfo>;
  readonly outposts: Record<Alliance, OutpostInfo>;
  readonly depots: Record<Alliance, DepotInfo>;
  /** Balls waiting inside a HUB to be released into the NEUTRAL ZONE. */
  private hubQueue: { i: number; alliance: Alliance; at: number }[] = [];
  private time = 0;
  /** Called when a ball enters a HUB. */
  onHubEntry: (alliance: Alliance, ball: number) => void = () => {};
  /** Light state for hubs. */
  private hubActive: Record<Alliance, boolean> = { blue: true, red: true };

  constructor(
    readonly world: World,
    scene: THREE.Scene,
  ) {
    scene.add(this.root);
    this.builder = new StaticBuilder(world, this.root);
    this.buildCarpet();
    this.buildPerimeter();
    this.hubs = { blue: this.buildHub('blue'), red: this.buildHub('red') };
    for (const side of ['blue', 'red'] as const) {
      this.buildBumpsAndTrenches(side);
    }
    this.towers = { blue: this.buildTower('blue'), red: this.buildTower('red') };
    this.depots = { blue: this.buildDepot('blue'), red: this.buildDepot('red') };
    this.outposts = { blue: this.buildOutpost('blue'), red: this.buildOutpost('red') };
    this.fuel = new FuelSystem(world, 620, this.root);
  }

  // ---------------------------------------------------------------- building

  private buildCarpet() {
    const b = this.builder;
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.length, FIELD.width),
      new THREE.MeshStandardMaterial({ map: createCarpetTexture(), roughness: 0.95 }),
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.receiveShadow = true;
    this.root.add(carpet);

    // Surrounding floor outside the field.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.length + 14, FIELD.width + 14),
      new THREE.MeshStandardMaterial({ color: 0x1c1d21, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    floor.receiveShadow = true;
    this.root.add(floor);

    b.box({ x: 0, y: -0.25, z: 0 }, { x: FIELD.length + 14, y: 0.5, z: FIELD.width + 14 }, { visible: false, phys: MATERIAL.carpet });
  }

  private buildPerimeter() {
    const b = this.builder;
    const rail = b.material(0xdfe6ee, { opacity: 0.22, roughness: 0.1 });
    const steel = b.material(0x9aa1a9, { metalness: 0.7, roughness: 0.35 });
    const t = 0.05;
    const h = FIELD.guardrailHeight;
    // Long-side guardrails (polycarbonate panel + top rail), plus an invisible taller barrier for FUEL.
    for (const s of [-1, 1]) {
      b.box({ x: 0, y: h / 2, z: s * (HW + t / 2) }, { x: FIELD.length, y: h, z: t }, { material: rail, phys: MATERIAL.polycarb, castShadow: false });
      b.box({ x: 0, y: h + 0.02, z: s * (HW + t / 2) }, { x: FIELD.length, y: 0.04, z: 0.05 }, { material: steel, phys: null });
      b.box({ x: 0, y: 0.04, z: s * (HW + t / 2) }, { x: FIELD.length, y: 0.08, z: 0.06 }, { material: steel, phys: null });
      // Spectator-side containment so FUEL doesn't leave the arena entirely.
      b.box({ x: 0, y: 1.5, z: s * (HW + 0.6) }, { x: FIELD.length + 4, y: 3, z: 0.1 }, { visible: false, phys: MATERIAL.polycarb, group: GROUP.NET });
    }
    // Alliance walls with a gap at the CORRAL opening (bottom) of the OUTPOST.
    for (const side of ['blue', 'red'] as const) {
      const sg = side === 'blue' ? -1 : 1;
      const x = sg * (HL + t / 2);
      const wallH = FIELD.allianceWallHeight;
      const oz = sideTransform(side).sign * OUTPOST.centerZ;
      const gapHalf = OUTPOST.corralWidth / 2;
      const zMin = -HW;
      const zMax = HW;
      const segs: [number, number][] = [
        [zMin, oz - gapHalf],
        [oz + gapHalf, zMax],
      ];
      const wallMat = b.material(0xdfe6ee, { opacity: 0.18, roughness: 0.1 });
      for (const [a, c] of segs) {
        if (c - a <= 0.01) continue;
        b.box({ x, y: wallH / 2, z: (a + c) / 2 }, { x: t, y: wallH, z: c - a }, { material: wallMat, phys: MATERIAL.polycarb, castShadow: false });
      }
      // Above and below the corral opening.
      const top = OUTPOST.corralBottom + OUTPOST.feedHeight;
      b.box({ x, y: OUTPOST.corralBottom / 2, z: oz }, { x: t, y: OUTPOST.corralBottom, z: OUTPOST.corralWidth }, { material: steel, phys: MATERIAL.steel });
      b.box({ x, y: (top + wallH) / 2, z: oz }, { x: t, y: wallH - top, z: OUTPOST.corralWidth }, { material: wallMat, phys: MATERIAL.polycarb, castShadow: false });
      // Driver station base (alliance colored kick plate) and frame.
      b.box({ x: x + sg * 0.03, y: 0.45, z: 0 }, { x: 0.02, y: 0.9, z: FIELD.width }, { color: ALLIANCE_DARK[side], phys: null, castShadow: false });
      b.box({ x: x, y: wallH, z: 0 }, { x: 0.06, y: 0.06, z: FIELD.width }, { material: steel, phys: null });
      // Driver station shelf.
      b.box({ x: x + sg * 0.45, y: 0.95, z: 0 }, { x: 0.8, y: 0.05, z: FIELD.width - 2 }, { color: 0x3a3d44, phys: null });
      // Tall invisible barrier behind the alliance wall for FUEL.
      b.box({ x: sg * (HL + 1.6), y: 2, z: 0 }, { x: 0.1, y: 4, z: FIELD.width + 2 }, { visible: false, phys: MATERIAL.polycarb, group: GROUP.NET });
    }
    // Tape: alliance zone lines and center line.
    const tape = (x: number, color: number, w = FIELD.tapeWidth) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, FIELD.width), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.002, 0);
      m.receiveShadow = true;
      this.root.add(m);
    };
    tape(-HL + FIELD.allianceZoneDepth, ALLIANCE_COLOR.blue);
    tape(HL - FIELD.allianceZoneDepth, ALLIANCE_COLOR.red);
    tape(0, 0xeeeeee);
  }

  private buildHub(side: Alliance): HubInfo {
    const b = this.builder;
    const T = sideTransform(side);
    const cx = T.sign * HUB.centerX;
    const fp = HUB.footprint;
    const exitDir = T.sign; // toward the neutral zone (field center): +X for blue, -X for red

    // Base structure (solid up to the funnel floor).
    b.box({ x: cx, y: HUB_FLOOR / 2, z: 0 }, { x: fp, y: HUB_FLOOR, z: fp }, { color: 0x4a505c, phys: MATERIAL.steel });
    // Alliance colored skirts.
    for (const s of [-1, 1]) {
      b.box({ x: cx, y: 0.5, z: s * (fp / 2 + 0.005) }, { x: fp * 0.9, y: 0.6, z: 0.01 }, { color: ALLIANCE_COLOR[side], phys: null, castShadow: false });
    }
    // FUEL exit slot on the neutral face (visual).
    b.box(
      { x: cx + exitDir * (fp / 2 + 0.006), y: HUB.exitHeight + 0.09, z: 0 },
      { x: 0.012, y: 0.18, z: HUB.exitWidth },
      { color: 0x08090b, phys: null, castShadow: false },
    );

    // Hexagonal funnel: six wall slabs from the floor to the opening height.
    const glow = new THREE.MeshStandardMaterial({
      color: ALLIANCE_COLOR[side],
      emissive: ALLIANCE_COLOR[side],
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.55,
      roughness: 0.3,
    });
    const wallH = HUB.openingHeight - HUB_FLOOR;
    const side6 = (2 * HEX_APOTHEM) / Math.sqrt(3);
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3 + Math.PI / 6;
      const r = HEX_APOTHEM + 0.02;
      const pos = { x: cx + Math.cos(a) * r, y: HUB_FLOOR + wallH / 2, z: Math.sin(a) * r };
      b.box(pos, { x: 0.04, y: wallH, z: side6 + 0.02 }, { yaw: -a, material: glow, phys: MATERIAL.polycarb, castShadow: false });
    }
    // Top frame ring between the hexagon and the square footprint (slanted look approximated by a lip).
    const steel = b.material(0xb8bec6, { metalness: 0.7, roughness: 0.3 });
    for (const s of [-1, 1]) {
      b.box({ x: cx, y: HUB.openingHeight, z: s * (fp / 2 - 0.03) }, { x: fp, y: 0.05, z: 0.06 }, { material: steel, phys: MATERIAL.steel });
      b.box({ x: cx + s * (fp / 2 - 0.03), y: HUB.openingHeight, z: 0 }, { x: 0.06, y: 0.05, z: fp }, { material: steel, phys: MATERIAL.steel });
    }
    // Corner posts.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        b.box({ x: cx + sx * (fp / 2 - 0.03), y: HUB.openingHeight / 2, z: sz * (fp / 2 - 0.03) }, { x: 0.05, y: HUB.openingHeight, z: 0.05 }, { material: steel, phys: null });

    // Net behind the HUB on the NEUTRAL ZONE side.
    const netX = cx + exitDir * (fp / 2 + HUB.netOffset);
    const netMat = new THREE.MeshStandardMaterial({ color: 0x111111, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    b.box({ x: netX, y: HUB.openingHeight + 0.55, z: 0 }, { x: 0.01, y: 1.4, z: HUB.netWidth }, { material: netMat, phys: MATERIAL.polycarb, group: GROUP.NET, castShadow: false });
    for (const s of [-1, 1])
      b.box({ x: netX, y: (HUB.openingHeight + 1.25) / 2, z: s * HUB.netWidth / 2 }, { x: 0.04, y: HUB.openingHeight + 1.25, z: 0.04 }, { material: steel, phys: MATERIAL.steel });

    return {
      alliance: side,
      center: new THREE.Vector3(cx, 0, 0),
      target: new THREE.Vector3(cx, HUB.openingHeight, 0),
      exitDir,
      glow,
    };
  }

  private buildBumpsAndTrenches(side: Alliance) {
    const b = this.builder;
    const T = sideTransform(side);
    const cx = T.sign * HUB.centerX;
    const color = ALLIANCE_COLOR[side];
    const d = BUMP.depth / 2;
    const h = BUMP.height;
    const flat = 0.05;
    for (const s of [-1, 1]) {
      const zc = s * LANE.bumpCenterZ;
      const hw = BUMP.width / 2;
      // Collider: convex hull of a trapezoid prism.
      const pts: THREE.Vector3[] = [];
      for (const z of [zc - hw, zc + hw]) {
        pts.push(new THREE.Vector3(cx - d, 0, z), new THREE.Vector3(cx + d, 0, z));
        pts.push(new THREE.Vector3(cx - flat, h, z), new THREE.Vector3(cx + flat, h, z));
      }
      b.hull(pts, color, MATERIAL.carpet);
      // Visual: extruded profile.
      const shape = new THREE.Shape();
      shape.moveTo(-d, 0);
      shape.lineTo(-flat, h);
      shape.lineTo(flat, h);
      shape.lineTo(d, 0);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: BUMP.width, bevelEnabled: false });
      geo.translate(0, 0, -hw);
      const mesh = new THREE.Mesh(geo, b.material(color, { roughness: 0.6 }));
      mesh.position.set(cx, 0, zc);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      // Diamond-plate strip on top.
      b.box({ x: cx, y: h + 0.002, z: zc }, { x: flat * 2, y: 0.004, z: BUMP.width }, { color: 0x999999, phys: null, castShadow: false });

      // TRENCH: an overhead arm across the underpass (between the guardrail and the bump),
      // standing on two legs. Robots taller than 22.25in hit the arm.
      const zGuard = s * HW;
      const zInner = s * LANE.trenchPostInner;
      const zOuter = s * LANE.trenchPostOuter;
      const tColor = b.material(color, { roughness: 0.5 });
      const steel = b.material(0x9aa1a9, { metalness: 0.7, roughness: 0.35 });
      const armDepth = inches(6);
      const beamH = TRENCH.height - TRENCH.clearHeight;
      const zArmEnd = zOuter;
      b.box(
        { x: cx, y: TRENCH.clearHeight + beamH / 2, z: (zGuard + zArmEnd) / 2 },
        { x: armDepth, y: beamH, z: Math.abs(zGuard - zArmEnd) },
        { material: tColor, phys: MATERIAL.steel },
      );
      // Inner leg (between the underpass and the bump) and its foot.
      const legW = Math.abs(zInner - zOuter);
      b.box({ x: cx, y: TRENCH.clearHeight / 2, z: (zInner + zOuter) / 2 }, { x: armDepth, y: TRENCH.clearHeight, z: legW }, { material: steel, phys: MATERIAL.steel });
      b.box({ x: cx, y: 0.01, z: (zInner + zOuter) / 2 }, { x: TRENCH.depth, y: 0.02, z: legW }, { material: steel, phys: MATERIAL.steel });
      // Guardrail-side leg.
      b.box({ x: cx, y: TRENCH.clearHeight / 2, z: zGuard - s * 0.02 }, { x: armDepth, y: TRENCH.clearHeight, z: 0.04 }, { material: steel, phys: MATERIAL.steel });
    }
  }

  private buildTower(side: Alliance): TowerInfo {
    const b = this.builder;
    const T = sideTransform(side);
    const wallX = -HL; // blue frame
    const z0 = TOWER.centerZ;
    const steel = b.material(0xa9b0b8, { metalness: 0.75, roughness: 0.3 });
    const color = ALLIANCE_COLOR[side];
    const p = (x: number, y: number, z: number) => T.p(x, y, z);

    // Base plate.
    const base = p(wallX + TOWER.baseDepth / 2, TOWER.baseHeight / 2, z0);
    b.box(base, { x: TOWER.baseDepth, y: TOWER.baseHeight, z: TOWER.baseWidth }, { color: 0x2a2c31, phys: MATERIAL.steel });
    // Uprights at the front of the tower.
    const rungX = wallX + TOWER.rungX;
    for (const s of [-1, 1]) {
      const uz = z0 + s * (TOWER.uprightSpacing / 2 + TOWER.uprightThickness / 2);
      b.box(p(rungX, TOWER.uprightHeight / 2, uz), { x: TOWER.uprightDepth, y: TOWER.uprightHeight, z: TOWER.uprightThickness }, { material: steel, phys: MATERIAL.steel });
      // Back frame to the wall.
      b.box(p(wallX + TOWER.rungX / 2, TOWER.height - 0.03, uz), { x: TOWER.rungX, y: 0.05, z: 0.05 }, { material: steel, phys: MATERIAL.steel });
      b.box(p(wallX + 0.05, TOWER.height / 2, uz), { x: 0.05, y: TOWER.height, z: 0.05 }, { material: steel, phys: MATERIAL.steel });
      // Supporting structure between 28.40in and 43.38in.
      b.box(p(wallX + TOWER.rungX / 2, 0.92, uz), { x: TOWER.rungX - 0.06, y: 0.38, z: 0.04 }, { color, phys: MATERIAL.steel });
    }
    // Top cap.
    b.box(p(wallX + TOWER.rungX / 2, TOWER.height, z0), { x: TOWER.rungX + 0.1, y: 0.04, z: TOWER.width }, { color, phys: MATERIAL.steel });
    // Rungs.
    const rungLen = TOWER.uprightSpacing + 2 * TOWER.uprightThickness + 2 * TOWER.rungOverhang;
    for (const y of TOWER.rungHeights) {
      b.cylinder(p(rungX, y, z0), TOWER.rungDiameter / 2, rungLen, 'z', { phys: MATERIAL.steel });
    }
    // Level markers (colored bands on uprights).
    const climb = p(rungX + 0.55, 0, z0);
    return {
      alliance: side,
      climbPoint: climb,
      climbYaw: T.yaw(Math.PI), // facing the alliance wall (-X for blue)
      rungX: T.sign * rungX,
      rungZ: T.sign * z0,
    };
  }

  private buildDepot(side: Alliance): DepotInfo {
    const b = this.builder;
    const T = sideTransform(side);
    const wallX = -HL;
    const z0 = DEPOT.centerZ;
    const bw = DEPOT.barrierWidth;
    const bh = DEPOT.barrierHeight;
    const color = ALLIANCE_COLOR[side];
    // Floor pad (hook fastener) and barriers on the three open sides.
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(DEPOT.depth, DEPOT.width), b.material(0x2d2f33));
    pad.rotation.x = -Math.PI / 2;
    pad.position.copy(T.p(wallX + DEPOT.depth / 2, 0.004, z0));
    pad.receiveShadow = true;
    this.root.add(pad);
    b.box(T.p(wallX + DEPOT.depth - bw / 2, bh / 2, z0), { x: bw, y: bh, z: DEPOT.width }, { color, phys: MATERIAL.steel });
    for (const s of [-1, 1]) {
      b.box(T.p(wallX + DEPOT.depth / 2, bh / 2, z0 + s * (DEPOT.width / 2 - bw / 2)), { x: DEPOT.depth, y: bh, z: bw }, { color, phys: MATERIAL.steel });
    }
    return { alliance: side, center: T.p(wallX + DEPOT.depth / 2, 0, z0) };
  }

  private buildOutpost(side: Alliance): OutpostInfo {
    const b = this.builder;
    const T = sideTransform(side);
    const wallX = -HL;
    const z0 = OUTPOST.centerZ;
    const color = ALLIANCE_COLOR[side];
    const dark = b.material(0x24262b);
    // Chute (behind the wall, sloped) and corral box — visual only, outside the field.
    const chute = b.box(T.p(wallX - 0.45, OUTPOST.feedBottom + 0.25, z0), { x: 0.9, y: 0.06, z: OUTPOST.feedWidth + 0.1 }, { material: dark, phys: null });
    if (chute) chute.rotation.z = T.sign * -0.26;
    b.box(T.p(wallX - 0.48, 0.1, z0), { x: 0.95, y: 0.2, z: 0.91 }, { color, opacity: 0.6, phys: null, castShadow: false });
    // Feed opening frame on the wall.
    b.box(T.p(wallX + 0.01, OUTPOST.feedBottom + OUTPOST.feedHeight + 0.02, z0), { x: 0.03, y: 0.04, z: OUTPOST.feedWidth }, { color, phys: null });
    b.box(T.p(wallX + 0.01, OUTPOST.feedBottom - 0.02, z0), { x: 0.03, y: 0.04, z: OUTPOST.feedWidth }, { color, phys: null });
    // Human player figure (simple capsule) for flavour.
    const hp = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.0, 4, 10), b.material(0x30343c));
    hp.position.copy(T.p(wallX - 1.2, 0.7, z0));
    hp.castShadow = true;
    this.root.add(hp);
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), b.material(color));
    hat.position.copy(T.p(wallX - 1.2, 1.4, z0));
    this.root.add(hat);

    return {
      alliance: side,
      feedPoint: T.p(wallX + 0.12, OUTPOST.feedBottom + OUTPOST.feedHeight / 2, z0),
      feedDir: new THREE.Vector3(T.sign, 0, 0),
      count: OUTPOST.chuteFuel,
      corralZ: T.sign * z0,
    };
  }

  // ---------------------------------------------------------------- gameplay

  /** Stage all FUEL for the start of a match (neutral zone grid, depots, outposts). */
  stageFuel(opts: { neutral?: boolean; depots?: boolean; outposts?: boolean } = {}) {
    this.fuel.reset();
    this.hubQueue = [];
    const { cols, rows, spacing } = NEUTRAL_FUEL;
    if (opts.neutral !== false) {
      for (let c = 0; c < cols; c++)
        for (let r = 0; r < rows; r++) {
          const x = (c - (cols - 1) / 2) * spacing;
          const z = (r - (rows - 1) / 2) * spacing;
          this.fuel.spawn({ x, y: FUEL.radius + 0.001, z });
        }
    }
    if (opts.depots !== false) {
      for (const side of ['blue', 'red'] as const) {
        const T = sideTransform(side);
        const nx = 4;
        const nz = 6;
        const sx = (DEPOT.depth - 0.1) / nx;
        const sz = (DEPOT.width - 0.12) / nz;
        for (let i = 0; i < nx; i++)
          for (let j = 0; j < nz; j++) {
            const x = -HL + 0.06 + sx * (i + 0.5);
            const z = DEPOT.centerZ + (j - (nz - 1) / 2) * sz;
            this.fuel.spawn(T.p(x, FUEL.radius + 0.005, z));
          }
      }
    }
    for (const side of ['blue', 'red'] as const) {
      const o = this.outposts[side];
      o.count = 0;
      if (opts.outposts !== false) {
        for (let k = 0; k < OUTPOST.chuteFuel; k++) {
          if (this.fuel.spawnHeld('outpost') >= 0) o.count++;
        }
      }
    }
  }

  /** Human player rolls one FUEL out of the CHUTE. Returns true if a ball was released. */
  feedFromOutpost(side: Alliance, aimZ = 0) {
    const o = this.outposts[side];
    if (o.count <= 0) return false;
    const i = this.fuel.findIn('outpost');
    if (i < 0) return false;
    o.count--;
    const v = o.feedDir.clone().multiplyScalar(2.2 + Math.random() * 0.4);
    v.z += aimZ * 0.4 + (Math.random() - 0.5) * 0.3;
    this.fuel.place(i, o.feedPoint, v);
    return true;
  }

  setHubActive(a: Alliance, active: boolean) {
    this.hubActive[a] = active;
    const g = this.hubs[a].glow;
    g.emissiveIntensity = active ? 0.9 : 0.05;
    g.opacity = active ? 0.6 : 0.25;
    g.color.setHex(active ? ALLIANCE_COLOR[a] : 0x444444);
  }

  isHubLit(a: Alliance) {
    return this.hubActive[a];
  }

  /** Physics-step update: HUB detection and release, out-of-bounds recovery. */
  step(dt: number) {
    this.time += dt;
    this.fuel.step(dt);
    const f = this.fuel;
    for (let i = 0; i < f.capacity; i++) {
      if (f.state[i] !== 'field') continue;
      const p = f.position(i);
      // HUB entry: inside the hexagon near the funnel floor.
      if (p.y < HUB.openingHeight - 0.02 && p.y > HUB_FLOOR - 0.05) {
        for (const a of ['blue', 'red'] as const) {
          const h = this.hubs[a].center;
          const dx = p.x - h.x;
          const dz = p.z;
          if (dx * dx + dz * dz < HEX_APOTHEM * HEX_APOTHEM * 0.95) {
            f.hold(i, 'hub');
            this.hubQueue.push({ i, alliance: a, at: this.time + 0.6 + Math.random() * 0.9 });
            this.onHubEntry(a, i);
            break;
          }
        }
        if (f.state[i] !== 'field') continue;
      }
      // Corral: balls that roll through the bottom opening go back to the human player.
      if (Math.abs(p.x) > HL + 0.03 && p.y < 0.4) {
        const side: Alliance = p.x < 0 ? 'blue' : 'red';
        const o = this.outposts[side];
        if (Math.abs(p.z - o.corralZ) < OUTPOST.corralWidth) {
          f.hold(i, 'outpost');
          o.count++;
          continue;
        }
      }
      // Out of bounds: give it to the nearest human player.
      if (p.y < -1 || Math.abs(p.x) > HL + 1.5 || Math.abs(p.z) > HW + 0.55) {
        const side: Alliance = p.x < 0 ? 'blue' : 'red';
        f.hold(i, 'outpost');
        this.outposts[side].count++;
      }
    }
    // Release scored FUEL out of the HUB exit into the NEUTRAL ZONE.
    for (let k = this.hubQueue.length - 1; k >= 0; k--) {
      const q = this.hubQueue[k];
      if (this.time < q.at) continue;
      this.hubQueue.splice(k, 1);
      const hub = this.hubs[q.alliance];
      const z = (Math.random() - 0.5) * (HUB.exitWidth - FUEL.diameter);
      const pos = { x: hub.center.x + hub.exitDir * (HUB.footprint / 2 + FUEL.radius + 0.02), y: HUB.exitHeight + 0.08, z };
      const vel = { x: hub.exitDir * (2.2 + Math.random() * 1.6), y: 0.4 + Math.random() * 0.6, z: z * 1.5 + (Math.random() - 0.5) * 1.2 };
      f.place(q.i, pos, vel);
    }
  }

  sync() {
    this.fuel.sync();
  }
}
