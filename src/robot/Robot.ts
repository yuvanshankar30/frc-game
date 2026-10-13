import * as THREE from 'three';
import { RAPIER, type World, GROUP, groups, ALL, MATERIAL } from '../physics/world';
import type { RobotDefinition } from './schema';
import { assemble, stepJoint, jointProgress, type Assembly, type JointRT } from './assemble';
import { desiredSpeeds, limitSpeeds, referenceToRobot, swerveModuleStates, type ChassisSpeeds } from './drivetrains/kinematics';
import { solveShot, flightTime, type ShotSolution } from './ballistics';
import type { Field } from '../field/rebuilt/Field';
import type { Alliance } from '../game/scoring';
import { ALLIANCE_COLOR } from '../field/rebuilt/Field';
import { TOWER, FUEL, FIELD } from '../field/rebuilt/dims';
import { DEG, clamp, wrapAngle, approach } from '../util/units';
import { makeBumpers } from './bumpers';
import type { FuelSystem } from '../field/fuel';

export interface RobotCommand {
  /** Translation in the reference frame, -1..1 (x = forward from the reference, z = right). */
  x: number;
  z: number;
  /** Rotation -1..1, positive = CCW (left). */
  rot: number;
  /** Yaw of the reference frame (camera / driver station), CCW about +Y. */
  refYaw: number;
  intake: boolean;
  shoot: boolean;
  eject: boolean;
  /** Edge-triggered: start / reverse a climb. */
  climb: boolean;
}

export const idleCommand = (): RobotCommand => ({ x: 0, z: 0, rot: 0, refYaw: 0, intake: false, shoot: false, eject: false, climb: false });

export interface RobotContext {
  field: Field;
  /** True during AUTO (climbs are limited to LEVEL 1). */
  auto: boolean;
  /** Aim assist (turret tracking + auto-rotate for fixed shooters + SOTM lead). */
  assist: boolean;
  /** Hold heading when not rotating (swerve / mecanum). */
  headingHold?: boolean;
}

export type ClimbState = 'none' | 'aligning' | 'lifting' | 'hanging' | 'lowering';

export interface RobotStats {
  shots: number;
  scored: number;
  intaked: number;
}

/** Lift (m) of the robot's floor reference to reach each TOWER level. */
function levelLift(level: number, bumperBottom: number) {
  const rungTop = (i: number) => TOWER.rungHeights[i] + TOWER.rungDiameter / 2;
  if (level <= 0) return 0;
  if (level === 1) return 0.12;
  // LEVEL 2/3: BUMPERS completely above the LOW/MID rung.
  return rungTop(level - 2) + 0.04 - bumperBottom;
}

export class Robot {
  readonly body: RAPIER.RigidBody;
  readonly visual = new THREE.Group();
  readonly assembly: Assembly;
  readonly stored: number[] = [];
  readonly stats: RobotStats = { shots: 0, scored: 0, intaked: 0 };
  speeds: ChassisSpeeds = { vx: 0, vz: 0, omega: 0 };
  climb: ClimbState = 'none';
  /** Heading being held while the driver isn't rotating (null = not holding yet). */
  private holdYaw: number | null = null;
  /** Driver station slot (0..2) this robot starts in front of. */
  station = 1;
  /** TOWER level currently achieved (0 if not hanging). */
  climbLevel = 0;
  private climbTarget = 0;
  private climbT = 0;
  private climbFrom = new THREE.Vector3();
  private climbFromYaw = 0;
  private climbPose = new THREE.Vector3();
  private climbYaw = 0;
  private intakeTokens = 0;
  private fireTimer = 0;
  private barrel = 0;
  /** Shooter wheel spin-up 0..1. */
  spin = 0;
  /** Intake activity 0..1. */
  intakeOn = 0;
  /** True while the shooter is spun up, aimed and allowed to fire. */
  shotReady = false;
  /** Indexer is feeding the shooter (rotor / floor running). */
  feeding = false;
  /** Latched intakes stay deployed after their first deploy. */
  intakeLatched = false;
  turretYaw: number[] = [];
  hoodAngle = 0;
  /** Last computed shot (for HUD / debug). */
  aimOk = false;
  aimDistance = 0;
  private wheelPositions: { x: number; z: number }[] = [];
  /** Swerve module steer angles (rad), for visuals. */
  readonly swerveAngles: number[] = [];
  readonly halfLength: number;
  readonly halfWidth: number;
  private tmpV = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpM = new THREE.Matrix4();
  private invM = new THREE.Matrix4();

  constructor(
    readonly def: RobotDefinition,
    model: THREE.Object3D,
    readonly alliance: Alliance,
    readonly world: World,
    scene: THREE.Object3D,
    readonly id: string,
    readonly label: string,
  ) {
    const f = def.frame;
    this.halfLength = f.length / 2 + f.bumperThickness;
    this.halfWidth = f.width / 2 + f.bumperThickness;

    this.assembly = assemble(def, model);
    this.visual.add(this.assembly.root);
    this.visual.add(makeBumpers(def, ALLIANCE_COLOR[alliance], label));
    this.visual.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.hopper = this.resolveHopper();
    if (def.storage.net) this.net = new HopperNet(this.hopper.center, this.hopper.size, def.storage.net.stretch, def.storage.net.color, this.visual);
    scene.add(this.visual);

    // ---- physics body
    const wheelR = f.wheelRadius;
    const wx = f.length / 2 - f.wheelInset;
    const wz = f.width / 2 - f.wheelInset;
    this.wheelPositions = [
      { x: wx, z: -wz },
      { x: wx, z: wz },
      { x: -wx, z: -wz },
      { x: -wx, z: wz },
    ];
    this.swerveAngles.push(...this.wheelPositions.map(() => 0));
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setLinearDamping(0.05)
      .setAngularDamping(3)
      .setCanSleep(false)
      .setAdditionalMassProperties(
        f.mass,
        { x: 0, y: f.comHeight, z: 0 },
        {
          x: (f.mass * (f.width ** 2 + 0.3 ** 2)) / 12,
          y: (f.mass * (f.length ** 2 + f.width ** 2)) / 12,
          z: (f.mass * (f.length ** 2 + 0.3 ** 2)) / 12,
        },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    desc.setCcdEnabled(true);
    // Robots dominate FUEL: a 0.2 kg ball can push other balls but can never lift, tilt or slow a 50+ kg robot,
    // so FUEL wedged under the frame is squeezed out instead of beaching it. Robot↔robot/field contacts are unchanged.
    desc.setDominanceGroup(10);
    this.body = world.createRigidBody(desc);
    // Collider layout (anti-beaching):
    //  - a low bumper ring around the perimeter that pushes FUEL and other robots,
    //  - a raised belly/superstructure box that clears the 6.5in BUMP peak when straddling it.
    const bb = Math.max(0.05, f.bumperBottom - 0.008);
    const bt = f.bumperBottom + f.bumperHeight;
    const belly = Math.max(0.1, wheelR + 0.05);
    // Collider top sits a little under the declared height so legal robots don't snag the TRENCH arm when pitching.
    const h = Math.max(f.height - 0.015, belly + 0.1);
    const ringMat = (d: RAPIER.ColliderDesc) =>
      d.setDensity(0).setFriction(0.25).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(MATERIAL.bumper.restitution).setCollisionGroups(groups(GROUP.ROBOT, ALL));
    const t = f.bumperThickness;
    const hy = (bt - bb) / 2;
    const cy = (bt + bb) / 2;
    const r = Math.min(0.02, hy * 0.6);
    // Front / back bumpers (full width incl. corners) and sides.
    for (const sx of [-1, 1])
      world.createCollider(ringMat(RAPIER.ColliderDesc.roundCuboid(t / 2 - r, hy - r, this.halfWidth - r, r).setTranslation(sx * (this.halfLength - t / 2), cy, 0)), this.body);
    for (const sz of [-1, 1])
      world.createCollider(ringMat(RAPIER.ColliderDesc.roundCuboid(f.length / 2 - r, hy - r, t / 2 - r, r).setTranslation(0, cy, sz * (this.halfWidth - t / 2))), this.body);
    // FUEL skirt: a vertical face from just above the carpet up into the bumper, hit only by loose FUEL,
    // so balls are always pushed horizontally instead of being run over (no beaching on FUEL).
    const skirtTop = bb + 0.03;
    const sy = (skirtTop + 0.012) / 2;
    const shy = (skirtTop - 0.012) / 2;
    const skirt = (d: RAPIER.ColliderDesc) => d.setDensity(0).setFriction(0.15).setRestitution(0.05).setCollisionGroups(groups(GROUP.SKIRT, GROUP.FUEL));
    // Thick (6cm) so a fast robot can't tunnel a ball through it in one step.
    const st = 0.03;
    for (const sx of [-1, 1]) world.createCollider(skirt(RAPIER.ColliderDesc.cuboid(st, shy, this.halfWidth).setTranslation(sx * (this.halfLength - st), sy, 0)), this.body);
    for (const sz of [-1, 1]) world.createCollider(skirt(RAPIER.ColliderDesc.cuboid(this.halfLength, shy, st).setTranslation(0, sy, sz * (this.halfWidth - st))), this.body);
    // Belly + superstructure: inside the bumpers, raised off the floor.
    world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(this.halfLength - 0.03, (h - belly) / 2 - 0.03, this.halfWidth - 0.03, 0.03)
        .setTranslation(0, (h + belly) / 2, 0)
        .setDensity(0)
        .setFriction(0.2)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(MATERIAL.bumper.restitution)
        .setCollisionGroups(groups(GROUP.ROBOT, ALL)),
      this.body,
    );
    // Frictionless wheel spheres carry the robot; traction is modeled explicitly in stepDrive().
    for (const w of this.wheelPositions) {
      world.createCollider(
        RAPIER.ColliderDesc.ball(wheelR)
          .setTranslation(w.x, wheelR, w.z)
          .setDensity(0)
          .setFriction(0)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setRestitution(0)
          .setCollisionGroups(groups(GROUP.WHEEL, ALL & ~GROUP.FUEL)),
        this.body,
      );
    }
    this.buildHopperColliders();
    this.turretYaw = (def.shooter?.barrels ?? []).map(() => 0);
    if (def.shooter?.hoodMin != null) this.hoodAngle = def.shooter.hoodMin;
    else if (def.shooter) this.hoodAngle = def.shooter.angle;
  }

  /** Hopper volume in the robot frame (always set; derived from the frame if the def has none). */
  readonly hopper: { center: THREE.Vector3; size: THREE.Vector3; entrySide: 1 | -1 };
  /** Height of the open slot at the top of the entry wall that intaken FUEL flies through. */
  static readonly ENTRY_GAP = 0.2;

  private resolveHopper() {
    const f = this.def.frame;
    const box = this.def.storage.box ?? {
      center: [0, f.height * 0.5, 0] as [number, number, number],
      size: [f.length * 0.75, f.height * 0.55, f.width * 0.8] as [number, number, number],
    };
    const zone = this.def.intake?.zones[0];
    const entrySide: 1 | -1 = zone && zone.center[0] < box.center[0] ? -1 : 1;
    return { center: new THREE.Vector3().fromArray(box.center), size: new THREE.Vector3().fromArray(box.size), entrySide };
  }

  /** Invisible walls around the hopper box that only carried FUEL collides with. */
  private buildHopperColliders() {
    const { center: c, size: s, entrySide } = this.hopper;
    // Thick walls (they only touch carried FUEL, extending outward) so a pile shoved by a fast-spinning
    // robot can't tunnel through in a single step.
    const t = 0.15;
    const g = groups(GROUP.HOPPER, GROUP.STORED);
    const add = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) =>
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setDensity(0).setFriction(0.35).setRestitution(0.2).setCollisionGroups(g),
        this.body,
      );
    const hx = s.x / 2;
    const hy = s.y / 2;
    const hz = s.z / 2;
    add(c.x, c.y - hy - t / 2, c.z, hx + t, t / 2, hz + t); // floor
    const netStretch = this.def.storage.net?.stretch ?? 0;
    add(c.x, c.y + hy + netStretch + t / 2, c.z, hx + t, t / 2, hz + t); // roof (or the net at full stretch)
    if (netStretch > 0) {
      // Net sides above the walls.
      add(c.x, c.y + hy + netStretch / 2, c.z - hz - t / 2, hx + t, netStretch / 2, t / 2);
      add(c.x, c.y + hy + netStretch / 2, c.z + hz + t / 2, hx + t, netStretch / 2, t / 2);
      add(c.x + hx + t / 2, c.y + hy + netStretch / 2, c.z, t / 2, netStretch / 2, hz);
      add(c.x - hx - t / 2, c.y + hy + netStretch / 2, c.z, t / 2, netStretch / 2, hz);
    }
    add(c.x, c.y, c.z - hz - t / 2, hx + t, hy, t / 2); // left
    add(c.x, c.y, c.z + hz + t / 2, hx + t, hy, t / 2); // right
    // Entry wall is closed: intaken FUEL passes through it during its short entry arc (collisions off),
    // so carried FUEL can't slosh back out the front.
    add(c.x + entrySide * (hx + t / 2), c.y, c.z, t / 2, hy, hz);
    add(c.x - entrySide * (hx + t / 2), c.y, c.z, t / 2, hy, hz); // back
  }

  /** Robot-frame point just inside the entry slot. */
  private entryPoint(z: number) {
    const { center: c, size: s, entrySide } = this.hopper;
    const r = FUEL.radius;
    return new THREE.Vector3(
      c.x + entrySide * (s.x / 2 - r - 0.03),
      c.y + s.y / 2 - Math.min(Robot.ENTRY_GAP, s.y * 0.6) / 2,
      clamp(z, c.z - s.z / 2 + r, c.z + s.z / 2 - r),
    );
  }

  /** Add a ball to the hopper. With `from` (world) it arcs in from there; otherwise it drops in place. */
  addToHopper(fuel: FuelSystem, i: number, from?: THREE.Vector3) {
    const lv = this.body.linvel();
    if (from) {
      const local = this.toLocal(from);
      const target = this.entryPoint(local.z);
      target.x -= this.hopper.entrySide * 0.12;
      const tw = this.toWorld(target, new THREE.Vector3());
      const T = 0.22;
      const v = new THREE.Vector3((tw.x - from.x) / T + lv.x, (tw.y - from.y) / T + 0.5 * 9.81 * T, (tw.z - from.z) / T + lv.z);
      fuel.store(i, from, v);
      // Fly through the intake/bumper (no collisions) until it's inside the hopper volume.
      fuel.colliders[i].setCollisionGroups(groups(GROUP.STORED, 0));
      this.entering.set(i, 0);
      this.enterTarget.set(i, target.clone());
    } else {
      fuel.store(i, this.toWorld(this.entryPoint(0)), { x: lv.x, y: 0, z: lv.z });
    }
    this.stored.push(i);
  }

  /** Fill the hopper with `n` balls packed on its floor (preloads / refills). */
  preload(fuel: FuelSystem, n: number) {
    const { center: c, size: s } = this.hopper;
    const d = FUEL.diameter * 1.04;
    const nx = Math.max(1, Math.floor(s.x / d));
    const nz = Math.max(1, Math.floor(s.z / d));
    for (let k = 0; k < n; k++) {
      const i = fuel.alloc();
      if (i < 0) return;
      const layer = Math.floor(k / (nx * nz));
      const m = k % (nx * nz);
      const off = layer % 2 ? d / 2 : 0;
      const local = new THREE.Vector3(
        c.x - s.x / 2 + d / 2 + (m % nx) * d + off * 0.5,
        c.y - s.y / 2 + FUEL.radius + 0.005 + layer * d * 0.9,
        c.z - s.z / 2 + d / 2 + Math.floor(m / nx) * d + off * 0.5,
      );
      fuel.store(i, this.toWorld(local), { x: 0, y: 0, z: 0 });
      this.stored.push(i);
    }
  }

  /** Remove the stored ball closest to a robot-frame point (e.g. a shooter's feeder). */
  private takeStored(fuel: FuelSystem, near: THREE.Vector3Like): number {
    const w = this.toWorld(near, new THREE.Vector3());
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < this.stored.length; k++) {
      const p = fuel.position(this.stored[k]);
      const dd = (p.x - w.x) ** 2 + (p.y - w.y) ** 2 * 0.3 + (p.z - w.z) ** 2;
      if (dd < bestD) {
        bestD = dd;
        best = k;
      }
    }
    if (best < 0) return -1;
    const i = this.stored[best];
    this.stored.splice(best, 1);
    this.entering.delete(i);
    return i;
  }

  /** FUEL in flight from the intake into the hopper → time since capture. */
  private entering = new Map<number, number>();
  /** Robot-frame point each entering ball is flying to. */
  private enterTarget = new Map<number, THREE.Vector3>();

  /** Forget everything carried (the field re-stages FUEL on reset). */
  clearHopper() {
    this.stored.length = 0;
    this.entering.clear();
    this.enterTarget.clear();
  }

  /** Balls that bounced out of the hopper become loose FUEL on the field. */
  private checkSpills(fuel: FuelSystem, dt: number) {
    const { center: c, size: s } = this.hopper;
    const m = 0.2;
    const r = FUEL.radius;
    for (const [i, t] of this.entering) {
      const lp = this.toLocal(fuel.position(i));
      const inside = Math.abs(lp.x - c.x) < s.x / 2 - r && Math.abs(lp.y - c.y) < s.y / 2 - r && Math.abs(lp.z - c.z) < s.z / 2 - r;
      if (inside || t > 0.6 || fuel.state[i] !== 'stored') {
        if (fuel.state[i] === 'stored') {
          if (inside) fuel.colliders[i].setCollisionGroups(groups(GROUP.STORED, GROUP.HOPPER | GROUP.STORED));
          else {
            // No room / didn't make it in: it bounces back out onto the field.
            const k = this.stored.indexOf(i);
            if (k >= 0) this.stored.splice(k, 1);
            this.releaseOutside(fuel, i);
          }
        }
        this.entering.delete(i);
        this.enterTarget.delete(i);
      } else {
        this.entering.set(i, t + dt);
        // Home in on the (moving, rotating) entry point so the ball still lands in the hopper.
        const tgt = this.enterTarget.get(i);
        if (tgt && fuel.state[i] === 'stored') {
          const tw = this.toWorld(tgt, new THREE.Vector3());
          const p = fuel.position(i);
          const left = Math.max(0.06, 0.22 - t);
          const pv = this.pointVelocity(tw);
          fuel.bodies[i].setLinvel({ x: (tw.x - p.x) / left + pv.x, y: (tw.y - p.y) / left + pv.y + 4.9 * left, z: (tw.z - p.z) / left + pv.z }, true);
        }
      }
    }
    for (let k = this.stored.length - 1; k >= 0; k--) {
      const i = this.stored[k];
      if (this.entering.has(i)) continue;
      const lp = this.toLocal(fuel.position(i));
      const top = s.y / 2 + (this.def.storage.net?.stretch ?? 0);
      if (Math.abs(lp.x - c.x) > s.x / 2 + m || lp.y - c.y > top + m || lp.y - c.y < -s.y / 2 - m || Math.abs(lp.z - c.z) > s.z / 2 + m) {
        this.releaseOutside(fuel, i);
        this.stored.splice(k, 1);
      }
    }
  }

  /**
   * Put a ball that left the hopper back on the field OUTSIDE the robot: just beyond the bumper on the
   * side it was heading for, at bumper-top height, rolling away. Releasing it where it is (inside the
   * robot's colliders) would make the solver shove it underneath and beach the robot.
   */
  private releaseOutside(fuel: FuelSystem, i: number) {
    const lp = this.toLocal(fuel.position(i));
    const c = this.hopper.center;
    const dx = lp.x - c.x;
    const dz = lp.z - c.z;
    const R = FUEL.radius;
    const top = this.def.frame.bumperBottom + this.def.frame.bumperHeight + R + 0.01;
    let local: THREE.Vector3;
    let dir: THREE.Vector3;
    if (Math.abs(dx) / this.halfLength > Math.abs(dz) / this.halfWidth) {
      const sx = Math.sign(dx || 1);
      local = new THREE.Vector3(sx * (this.halfLength + R + 0.02), Math.max(top, lp.y), clamp(lp.z, -this.halfWidth + R, this.halfWidth - R));
      dir = new THREE.Vector3(sx, 0, 0);
    } else {
      const sz = Math.sign(dz || 1);
      local = new THREE.Vector3(clamp(lp.x, -this.halfLength + R, this.halfLength - R), Math.max(top, lp.y), sz * (this.halfWidth + R + 0.02));
      dir = new THREE.Vector3(0, 0, sz);
    }
    const w = this.toWorld(local, new THREE.Vector3());
    const r = this.body.rotation();
    dir.applyQuaternion(this.tmpQ.set(r.x, r.y, r.z, r.w));
    const lv = this.body.linvel();
    fuel.place(i, w, { x: lv.x + dir.x * 0.8, y: 0.3, z: lv.z + dir.z * 0.8 });
  }

  /**
   * Hard anti-beaching guarantee: a loose ball can never sit under the frame. Any FIELD ball whose center ends up
   * inside the bumper footprint below the bumper top is moved just outside the nearest bumper face, on the carpet,
   * rolling away. (The skirt and robot dominance make this rare; this catches every remaining case.)
   */
  private clearUnderside(fuel: FuelSystem) {
    const t = this.body.translation();
    const R = FUEL.radius;
    const top = this.def.frame.bumperBottom + this.def.frame.bumperHeight;
    const reach = Math.hypot(this.halfLength, this.halfWidth);
    const r = this.body.rotation();
    const q = this.tmpQ.set(r.x, r.y, r.z, r.w);
    for (let i = 0; i < fuel.bodies.length; i++) {
      if (fuel.state[i] !== 'field') continue;
      const b = fuel.bodies[i].translation();
      const dx = b.x - t.x;
      const dz = b.z - t.z;
      if (Math.abs(dx) > reach || Math.abs(dz) > reach || b.y - t.y > top) continue;
      const lp = this.toLocal(b);
      const mx = this.halfLength - 0.02 - Math.abs(lp.x);
      const mz = this.halfWidth - 0.02 - Math.abs(lp.z);
      if (mx <= 0 || mz <= 0 || lp.y > top) continue;
      const local = new THREE.Vector3(lp.x, R + 0.003, lp.z);
      const dir = new THREE.Vector3();
      if (mx / this.halfLength < mz / this.halfWidth) {
        const sx = Math.sign(lp.x || 1);
        local.x = sx * (this.halfLength + R + 0.01);
        dir.set(sx, 0, 0);
      } else {
        const sz = Math.sign(lp.z || 1);
        local.z = sz * (this.halfWidth + R + 0.01);
        dir.set(0, 0, sz);
      }
      const w = this.toWorld(local, new THREE.Vector3());
      dir.applyQuaternion(q);
      const pv = this.pointVelocity(w);
      fuel.place(i, w, { x: pv.x + dir.x * 0.6, y: 0, z: pv.z + dir.z * 0.6 });
    }
  }

  /**
   * While feeding, the indexer moves the carried FUEL: a rotor swirls it around its axis (toward the single-stream
   * feed), a roller / belt floor drives it toward the shooter.
   */
  private agitate(fuel: FuelSystem, dt: number) {
    const ix = this.def.storage.indexer;
    const sh = this.def.shooter!;
    const feed = sh.barrels[0].exit;
    const r = this.body.rotation();
    const q = this.tmpQ.set(r.x, r.y, r.z, r.w);
    const blend = Math.min(1, dt * 8);
    for (const i of this.stored) {
      if (this.entering.has(i)) continue;
      const lp = this.toLocal(fuel.position(i));
      let vx: number;
      let vz: number;
      if (ix?.mode === 'rotor') {
        const dx = lp.x - ix.center[0];
        const dz = lp.z - ix.center[1];
        const rad = Math.max(0.05, Math.hypot(dx, dz));
        const w = ix.rps * Math.PI * 2;
        const tang = Math.min(1.6, w * rad);
        vx = (-dz / rad) * tang;
        vz = (dx / rad) * tang;
      } else {
        const dx = feed[0] - lp.x;
        const dz = feed[2] - lp.z;
        const d = Math.max(0.05, Math.hypot(dx, dz));
        vx = (dx / d) * 1.2;
        vz = (dz / d) * 1.2;
      }
      const target = new THREE.Vector3(vx, 0, vz).applyQuaternion(q);
      const pv = this.pointVelocity(fuel.position(i));
      const cur = fuel.velocity(i);
      fuel.bodies[i].setLinvel(
        { x: cur.x + (pv.x + target.x - cur.x) * blend, y: cur.y, z: cur.z + (pv.z + target.z - cur.z) * blend },
        true,
      );
    }
  }

  private entryCheckT = 0;
  private entryBlockedCache = false;
  /** True when several carried balls already sit at the entry slot (checked a few times a second). */
  private entryBlocked(fuel: FuelSystem) {
    if (--this.entryCheckT > 0) return this.entryBlockedCache;
    this.entryCheckT = 12;
    const e = this.entryPoint(0);
    const R = FUEL.diameter * 1.1;
    let n = 0;
    for (const i of this.stored) {
      const lp = this.toLocal(fuel.position(i));
      if (Math.abs(lp.x - e.x) < R && Math.abs(lp.y - e.y) < R * 1.2) n++;
    }
    const lanes = Math.max(1, Math.floor(this.hopper.size.z / FUEL.diameter));
    this.entryBlockedCache = n >= lanes;
    return this.entryBlockedCache;
  }

  /** World → robot frame. */
  toLocal(p: THREE.Vector3Like, out = new THREE.Vector3()) {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.tmpQ.set(r.x, r.y, r.z, r.w).invert();
    return out.set(p.x - t.x, p.y - t.y, p.z - t.z).applyQuaternion(this.tmpQ);
  }

  // ---------------------------------------------------------------- pose

  get yaw() {
    const r = this.body.rotation();
    this.tmpQ.set(r.x, r.y, r.z, r.w);
    const fwd = this.tmpV.set(1, 0, 0).applyQuaternion(this.tmpQ);
    return Math.atan2(-fwd.z, fwd.x);
  }

  get position() {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  /** Draped net over the hopper (visual), if the robot has one. */
  private net: HopperNet | null = null;

  /** Field FUEL system (set by the game so teleports can carry the hopper's contents). */
  fuel: FuelSystem | null = null;

  /** Place the robot on the floor at (x, z) facing `yaw`. Carried FUEL moves with it. */
  teleport(x: number, z: number, yaw: number) {
    if (this.climb !== 'none') this.endClimb();
    const carried = this.fuel ? this.stored.map((i) => this.toLocal(this.fuel!.position(i))) : [];
    this.body.setTranslation({ x, y: 0.005, z }, true);
    this.tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setRotation({ x: this.tmpQ.x, y: this.tmpQ.y, z: this.tmpQ.z, w: this.tmpQ.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.speeds = { vx: 0, vz: 0, omega: 0 };
    this.holdYaw = yaw;
    if (this.fuel) {
      this.stored.forEach((i, k) => {
        const w = this.toWorld(carried[k], new THREE.Vector3());
        this.fuel!.bodies[i].setTranslation({ x: w.x, y: w.y, z: w.z }, true);
        this.fuel!.bodies[i].setLinvel({ x: 0, y: 0, z: 0 }, true);
      });
    }
  }

  /** Robot-frame point → world. */
  toWorld(p: THREE.Vector3Like, out = new THREE.Vector3()) {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.tmpQ.set(r.x, r.y, r.z, r.w);
    return out.set(p.x, p.y, p.z).applyQuaternion(this.tmpQ).add(this.tmpV.set(t.x, t.y, t.z));
  }

  // ---------------------------------------------------------------- update

  step(cmd: RobotCommand, ctx: RobotContext, dt: number) {
    if (cmd.climb) this.toggleClimb(ctx);
    if (this.climb !== 'none') {
      this.stepClimb(dt);
    } else {
      this.stepDrive(cmd, ctx, dt);
    }
    this.stepMechanisms(cmd, ctx, dt);
  }

  private stepDrive(cmd: RobotCommand, ctx: RobotContext, dt: number) {
    const d = this.def.drivetrain;
    const heading = this.yaw;
    const limits = { maxSpeed: d.maxSpeed, maxAccel: d.maxAccel, maxOmega: d.maxOmega, maxAlpha: d.maxAlpha };
    const target = desiredSpeeds(d.type, { x: cmd.x, z: cmd.z, rot: cmd.rot }, heading - cmd.refYaw, limits, true);

    // Aim assist for fixed shooters (and turrets at their limit): rotate the robot toward the HUB.
    let assisted = false;
    if (ctx.assist && cmd.shoot && this.def.shooter && this.stored.length > 0) {
      const err = this.robotAimError(ctx);
      if (err !== null && Math.abs(cmd.rot) < 0.2) {
        target.omega = clamp(err * 8, -limits.maxOmega, limits.maxOmega);
        assisted = true;
      }
    }
    // Heading hold: when the driver isn't rotating, keep the current heading (resists bumps / pushes).
    const holonomic = d.type !== 'tank';
    if (ctx.headingHold && holonomic && !assisted && Math.abs(cmd.rot) < 0.02) {
      if (this.holdYaw === null) {
        if (Math.abs(this.body.angvel().y) < 0.6) this.holdYaw = heading;
      } else {
        const e = wrapAngle(this.holdYaw - heading);
        target.omega = clamp(e * 7, -limits.maxOmega * 0.6, limits.maxOmega * 0.6);
      }
    } else {
      this.holdYaw = null;
    }

    // Measure current robot-relative velocity (post-collision) and accelerate toward target.
    const lv = this.body.linvel();
    const cur = referenceToRobot(lv.x, lv.z, heading);
    const av = this.body.angvel();
    const current: ChassisSpeeds = { vx: cur.vx, vz: cur.vz, omega: av.y };
    const next = limitSpeeds(current, target, limits, dt);
    // Tank / mecanum wheels resist sideways sliding (scrub).
    if (d.type === 'tank') next.vz = approach(current.vz, 0, 30 * dt);
    this.speeds = next;

    // Traction model: the wheels can only apply as much force as friction on their normal load
    // allows (μ·m·g shared by grounded wheels) and as much as the motors make, which fades with speed.
    const grounded = this.groundedWheels();
    this.grounded = grounded;
    if (grounded === 0) return;
    const m = this.def.frame.mass;
    const MU = 1.15; // treaded wheels on carpet
    const share = grounded / this.wheelPositions.length;
    const speed = Math.hypot(cur.vx, cur.vz);
    const motor = d.maxAccel * Math.max(0.2, 1 - speed / (d.maxSpeed * 1.15));
    const aMax = Math.min(MU * 9.81, motor) * share;
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const dvx = next.vx - cur.vx;
    const dvz = next.vz - cur.vz;
    const dv = Math.hypot(dvx, dvz);
    const k = dv > aMax * dt ? (aMax * dt) / dv : 1;
    // Robot-frame Δv → world impulse.
    const ix = (dvx * c + dvz * s) * k * m;
    const iz = (-dvx * s + dvz * c) * k * m;
    this.body.applyImpulse({ x: ix, y: 0, z: iz }, true);
    // Yaw: torque limited by friction at the wheel radius from center.
    const Iy = (m * (this.def.frame.length ** 2 + this.def.frame.width ** 2)) / 12;
    const rw = Math.hypot(this.wheelPositions[0].x, this.wheelPositions[0].z);
    const alphaMax = Math.min(d.maxAlpha, (MU * 9.81 * m * rw) / Iy) * share;
    const dw = clamp(next.omega - av.y, -alphaMax * dt, alphaMax * dt);
    this.body.applyTorqueImpulse({ x: 0, y: Iy * dw, z: 0 }, true);
  }

  /** Number of wheels touching something (field or another robot) below them. */
  grounded = 4;
  private groundedWheels() {
    let n = 0;
    const filter = groups(GROUP.WHEEL, GROUP.FIELD | GROUP.ROBOT);
    const down = { x: 0, y: -1, z: 0 };
    for (const w of this.wheelPositions) {
      const o = this.toWorld({ x: w.x, y: this.def.frame.wheelRadius, z: w.z }, this.rayTmp);
      const ray = new RAPIER.Ray({ x: o.x, y: o.y, z: o.z }, down);
      const hit = this.world.castRay(ray, this.def.frame.wheelRadius + 0.03, true, undefined, filter, undefined, this.body);
      if (hit) n++;
    }
    return n;
  }
  private rayTmp = new THREE.Vector3();

  /** Heading error (rad) between the robot and the direction needed to shoot at its HUB, or null. */
  private robotAimError(ctx: RobotContext): number | null {
    const sh = this.def.shooter;
    if (!sh) return null;
    const hub = ctx.field.hubs[this.alliance].target;
    const p = this.position;
    // Aim at the led point when shooting on the move, otherwise straight at the HUB.
    const tx = sh.sotm && Number.isFinite(this.aimPoint.x) ? this.aimPoint.x : hub.x;
    const tz = sh.sotm && Number.isFinite(this.aimPoint.x) ? this.aimPoint.z : hub.z;
    const desired = Math.atan2(-(tz - p.z), tx - p.x);
    // If the shooter has a turret, only rotate the robot when the target is outside its range.
    const shootDir = this.yaw + sh.yawOffset * DEG;
    let err = wrapAngle(desired - shootDir);
    if (sh.turretMin !== null && sh.turretMax !== null) {
      const lo = sh.turretMin * DEG;
      const hi = sh.turretMax * DEG;
      if (err >= lo && err <= hi) return 0;
      err = err < lo ? err - lo : err - hi;
    }
    return err;
  }

  private stepMechanisms(cmd: RobotCommand, ctx: RobotContext, dt: number) {
    const def = this.def;
    const canAct = this.climb === 'none';
    // Intake deploy / rollers.
    const intaking = canAct && (cmd.intake || cmd.eject) && !!def.intake;
    this.intakeOn = approach(this.intakeOn, intaking ? 1 : 0, dt * 6);
    if (def.intake?.latch && this.intakeOn > 0.9) this.intakeLatched = true;
    // Shooter spin-up.
    const wantSpin = canAct && cmd.shoot && !!def.shooter;
    this.spin = approach(this.spin, wantSpin ? 1 : 0, dt * (wantSpin ? 3.5 : 1.2));

    this.fuel = ctx.field.fuel;
    this.checkSpills(ctx.field.fuel, dt);
    this.clearUnderside(ctx.field.fuel);

    // Aim (turret + hood + speed).
    const aim = def.shooter ? this.computeAim(ctx) : null;

    // Joints.
    let deployProgress = 1;
    for (const jt of this.assembly.joints.values()) {
      this.driveJoint(jt, aim, dt);
      if (jt.def.driver === 'intake-deploy') deployProgress = Math.min(deployProgress, jointProgress(jt));
    }

    if (def.intake && canAct) {
      const ready = !def.intake.requiresDeploy || deployProgress > 0.7 || !this.hasDriver('intake-deploy');
      if (cmd.intake && !cmd.eject && ready) this.runIntake(ctx, dt);
      if (cmd.eject) this.runEject(ctx, dt);
    }
    if (def.shooter && canAct && cmd.shoot && aim) this.runShooter(ctx, aim, dt);
    else this.shotReady = false;
    this.feeding = canAct && !!def.shooter && cmd.shoot && this.spin > 0.8 && this.stored.length > 0;
    if (this.feeding) this.agitate(ctx.field.fuel, dt);
  }

  private hasDriver(d: string) {
    for (const jt of this.assembly.joints.values()) if (jt.def.driver === d) return true;
    return false;
  }

  private driveJoint(jt: JointRT, aim: AimResult | null, dt: number) {
    const d = jt.def;
    switch (d.driver) {
      case 'intake-deploy':
        jt.target = this.intakeOn > 0.01 || this.intakeLatched ? d.active : d.stowed;
        break;
      case 'intake-roller':
        jt.target = this.intakeOn;
        break;
      case 'indexer':
        jt.target = this.feeding ? 1 : this.intakeOn * 0.35;
        break;
      case 'shooter-wheel':
        jt.target = this.spin;
        break;
      case 'turret': {
        const i = this.turretIndex(jt);
        jt.target = d.stowed + (this.turretYaw[i] ?? 0) / DEG;
        break;
      }
      case 'hood': {
        const sh = this.def.shooter;
        if (sh && sh.hoodMin !== null && sh.hoodMax !== null && sh.hoodMax !== sh.hoodMin) {
          const t = (this.hoodAngle - sh.hoodMin) / (sh.hoodMax - sh.hoodMin);
          jt.target = d.stowed + clamp(t, 0, 1) * (d.active - d.stowed);
        }
        break;
      }
      case 'climber':
        jt.target = this.climb === 'none' ? d.stowed : d.active;
        break;
      case 'wheel': {
        const v = Math.hypot(this.speeds.vx, this.speeds.vz) + Math.abs(this.speeds.omega) * 0.3;
        let dir = Math.sign(this.speeds.vx || 1);
        // Swerve wheels: roll forward relative to their module; flip when the module is turned around.
        const steer = d.parent ? this.assembly.joints.get(d.parent) : undefined;
        if (steer && steer.def.driver === 'steer') {
          this.steerJoints ??= [...this.assembly.joints.values()].filter((j) => j.def.driver === 'steer');
          const k = this.steerJoints.indexOf(steer);
          const moduleAngle = this.swerveAngles[k] ?? 0;
          dir = Math.cos(moduleAngle - steer.value * DEG) >= 0 ? 1 : -1;
        }
        jt.target = clamp(v / Math.max(0.1, this.def.drivetrain.maxSpeed), 0, 1) * dir;
        break;
      }
      case 'steer': {
        // Swerve module azimuth (rad → deg), shortest rotation with wheel-flip optimization.
        this.steerJoints ??= [...this.assembly.joints.values()].filter((j) => j.def.driver === 'steer');
        const k = this.steerJoints.indexOf(jt);
        const a = (this.swerveAngles[k] ?? 0) / DEG;
        let diff = ((a - jt.value + 540) % 360) - 180;
        if (Math.abs(diff) > 90) diff -= Math.sign(diff) * 180;
        jt.target = jt.value + diff;
        break;
      }
      default:
        break;
    }
    void aim;
    stepJoint(jt, dt);
  }

  private turretJoints: JointRT[] | null = null;
  private steerJoints: JointRT[] | null = null;
  private turretIndex(jt: JointRT) {
    this.turretJoints ??= [...this.assembly.joints.values()].filter((j) => j.def.driver === 'turret');
    return Math.max(0, this.turretJoints.indexOf(jt));
  }

  // ---------------------------------------------------------------- intake

  private runIntake(ctx: RobotContext, dt: number) {
    const def = this.def;
    const intake = def.intake!;
    if (this.stored.length >= def.storage.capacity) return;
    // A physically full hopper can't take more: skip capture while the entry slot is packed.
    if (this.entryBlocked(ctx.field.fuel)) return;
    this.intakeTokens = Math.min(this.intakeTokens + intake.rate * dt, 3);
    if (this.intakeTokens < 1) return;
    const fuel = ctx.field.fuel;
    // World → robot transform.
    const t = this.body.translation();
    const r = this.body.rotation();
    this.tmpM.compose(this.tmpV.set(t.x, t.y, t.z), this.tmpQ.set(r.x, r.y, r.z, r.w), ONE);
    this.invM.copy(this.tmpM).invert();
    const lp = new THREE.Vector3();
    const R = FUEL.radius;
    for (let i = 0; i < fuel.capacity && this.intakeTokens >= 1; i++) {
      if (fuel.state[i] !== 'field') continue;
      const p = fuel.position(i);
      if (Math.abs(p.x - t.x) > 1.5 || Math.abs(p.z - t.z) > 1.5) continue;
      lp.set(p.x, p.y, p.z).applyMatrix4(this.invM);
      for (const z of intake.zones) {
        if (
          Math.abs(lp.x - z.center[0]) <= z.size[0] / 2 + R &&
          Math.abs(lp.y - z.center[1]) <= z.size[1] / 2 + R &&
          Math.abs(lp.z - z.center[2]) <= z.size[2] / 2 + R
        ) {
          this.addToHopper(fuel, i, new THREE.Vector3(p.x, p.y, p.z));
          this.stats.intaked++;
          this.intakeTokens -= 1;
          break;
        }
      }
      if (this.stored.length >= def.storage.capacity) break;
    }
  }

  private ejectTimer = 0;
  private runEject(ctx: RobotContext, dt: number) {
    this.ejectTimer -= dt;
    if (this.ejectTimer > 0 || this.stored.length === 0 || !this.def.intake) return;
    this.ejectTimer = 1 / 8;
    const z = this.def.intake.zones[0];
    const i = this.takeStored(ctx.field.fuel, this.entryPoint(z.center[2]));
    if (i < 0) return;
    const out = this.toWorld({ x: z.center[0] + z.size[0] / 2 + 0.12, y: Math.max(0.12, z.center[1]), z: z.center[2] });
    const fwd = this.tmpV.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(2.5);
    const lv = this.body.linvel();
    ctx.field.fuel.place(i, out, { x: fwd.x + lv.x, y: 0.5, z: fwd.z + lv.z }, this.id);
  }

  // ---------------------------------------------------------------- shooter

  private aimCache: AimResult | null = null;
  /** Where barrel 0 is aiming on the floor plane (the HUB, led by robot velocity when shooting on the move). */
  private aimPoint = new THREE.Vector3(Number.NaN, 0, 0);
  private aimTimer = 0;

  private computeAim(ctx: RobotContext): AimResult {
    const sh = this.def.shooter!;
    const dt = 1 / 120;
    this.aimTimer -= dt;
    if (!this.aimCache || this.aimTimer <= 0) {
      this.aimTimer = 1 / 30;
      this.aimCache = this.solveAim(ctx);
    }
    const results = this.aimCache.barrels;
    // Slew turrets and hood toward their targets every step.
    for (let b = 0; b < results.length; b++) {
      this.turretYaw[b] = approach(this.turretYaw[b] ?? 0, results[b].yaw, sh.turretSpeed * DEG * dt);
    }
    this.hoodAngle = approach(this.hoodAngle, results[0].elev / DEG, 240 * dt);
    return this.aimCache;
  }

  private solveAim(ctx: RobotContext): AimResult {
    const sh = this.def.shooter!;
    const hub = ctx.field.hubs[this.alliance].target;
    const yaw = this.yaw;
    const results: BarrelAim[] = [];
    let ok = true;
    let dist = 0;
    let shared: ShotSolution | null = null;
    const hasTurret = sh.turretMin !== null && sh.turretMax !== null;
    for (let b = 0; b < sh.barrels.length; b++) {
      const barrel = sh.barrels[b];
      // Desired turret yaw from the turret axis, then the exit point at that yaw.
      const pivotW = this.toWorld({ x: barrel.pivot[0], y: barrel.exit[1], z: barrel.pivot[2] }, new THREE.Vector3());
      let tx = hub.x;
      let tz = hub.z;
      const ty = hub.y + 0.05;
      const relFor = (x: number, z: number, from: THREE.Vector3) => wrapAngle(Math.atan2(-(z - from.z), x - from.x) - (yaw + sh.yawOffset * DEG));
      let rel = hasTurret && ctx.assist ? clamp(relFor(tx, tz, pivotW), sh.turretMin! * DEG, sh.turretMax! * DEG) : 0;
      const exitAt = (r: number) => {
        const ex = barrel.exit[0] - barrel.pivot[0];
        const ez = barrel.exit[2] - barrel.pivot[2];
        const c = Math.cos(r);
        const s = Math.sin(r);
        return this.toWorld({ x: barrel.pivot[0] + ex * c + ez * s, y: barrel.exit[1], z: barrel.pivot[2] - ex * s + ez * c }, new THREE.Vector3());
      };
      let exit = exitAt(rel);
      // Lanes of a fixed drum share one solution (they are side by side); turrets solve individually.
      const solveThis: boolean = !shared || hasTurret;
      let d = Math.hypot(tx - exit.x, tz - exit.z);
      let sol: ShotSolution = solveThis || !shared ? solveShot(d, ty - exit.y, sh) : shared;
      if (solveThis && sh.sotm && ctx.assist) {
        // Lead the target by the robot's velocity × time of flight (two refinement passes).
        for (let k = 0; k < 2; k++) {
          const tof = flightTime(sol.speed, sol.elev, ty - exit.y);
          const ev = this.pointVelocity(exit);
          tx = hub.x - ev.x * tof;
          tz = hub.z - ev.z * tof;
          if (hasTurret) rel = clamp(relFor(tx, tz, pivotW), sh.turretMin! * DEG, sh.turretMax! * DEG);
          exit = exitAt(rel);
          d = Math.hypot(tx - exit.x, tz - exit.z);
          sol = solveShot(d, ty - exit.y, sh);
        }
      }
      // Aim error of this barrel's shot direction vs the target (rad), for fire gating.
      const err = Math.abs(relFor(tx, tz, exit) - rel);
      results.push({ yaw: rel, elev: sol.elev, speed: sol.speed, ok: sol.ok, err });
      shared ??= sol;
      if (b === 0) this.aimPoint.set(tx, 0, tz);
      ok = ok && sol.ok;
      if (b === 0) dist = d;
    }
    this.aimOk = ok;
    this.aimDistance = dist;
    return { barrels: results };
  }

  private aimSettled(aim: AimResult, ctx: RobotContext) {
    const sh = this.def.shooter!;
    const tol = 3.5 * DEG;
    if (sh.turretMin !== null && sh.turretMax !== null) {
      for (let b = 0; b < aim.barrels.length; b++) {
        const a = aim.barrels[b];
        if (a.err > tol) return false;
        if (Math.abs((this.turretYaw[b] ?? 0) - a.yaw) > tol) return false;
      }
    } else {
      // Fixed shooter: fire whenever the heading (led for robot motion and spin) points the shooter at the HUB,
      // including while the robot is still rotating through the target.
      const e = this.robotAimError(ctx);
      if (e === null || Math.abs(e) > tol * 1.4) return false;
    }
    if (sh.hoodMin !== null && Math.abs(this.hoodAngle - aim.barrels[0].elev / DEG) > 4) return false;
    return true;
  }

  /** Barrel 0's launch state with the current turret/hood, no spread. */
  previewShot(): { pos: THREE.Vector3; vel: THREE.Vector3 } | null {
    const sh = this.def.shooter;
    const aim = this.aimCache;
    if (!sh || !aim) return null;
    const { pos, vel } = this.launchState(0, aim.barrels[0], 0);
    return { pos, vel };
  }

  private launchState(b: number, a: BarrelAim, spread: number) {
    const sh = this.def.shooter!;
    const barrel = sh.barrels[b];
    const turret = this.turretYaw[b] ?? 0;
    const ex = barrel.exit[0] - barrel.pivot[0];
    const ez = barrel.exit[2] - barrel.pivot[2];
    const c = Math.cos(turret);
    const s = Math.sin(turret);
    const local = { x: barrel.pivot[0] + ex * c + ez * s, y: barrel.exit[1], z: barrel.pivot[2] - ex * s + ez * c };
    const pos = this.toWorld(local, new THREE.Vector3());
    const dirYaw = this.yaw + sh.yawOffset * DEG + turret + gauss() * spread;
    const hood = sh.hoodMin !== null ? this.hoodAngle * DEG : a.elev;
    const elev = hood + gauss() * spread;
    const speed = a.speed * (1 + gauss() * (spread > 0 ? 0.01 : 0));
    const ev = this.pointVelocity(pos);
    const vel = new THREE.Vector3(
      Math.cos(elev) * Math.cos(dirYaw) * speed + ev.x,
      Math.sin(elev) * speed + ev.y,
      -Math.cos(elev) * Math.sin(dirYaw) * speed + ev.z,
    );
    return { pos, vel };
  }

  /** Velocity of a world point rigidly attached to the robot (linear + ω × r). */
  pointVelocity(p: THREE.Vector3Like) {
    const lv = this.body.linvel();
    const av = this.body.angvel();
    const c = this.body.translation();
    const rx = p.x - c.x;
    const ry = p.y - c.y;
    const rz = p.z - c.z;
    return new THREE.Vector3(lv.x + av.y * rz - av.z * ry, lv.y + av.z * rx - av.x * rz, lv.z + av.x * ry - av.y * rx);
  }

  private runShooter(ctx: RobotContext, aim: AimResult, dt: number) {
    const sh = this.def.shooter!;
    this.fireTimer -= dt;
    // Not ready: don't bank shots while spinning up, empty, or lining up.
    const ready = this.spin >= 0.85 && this.stored.length > 0 && (!ctx.assist || this.aimSettled(aim, ctx));
    this.shotReady = ready;
    if (!ready) {
      this.fireTimer = Math.max(this.fireTimer, 0);
      return;
    }
    // At most one ball per lane per physics step, so balls never spawn on top of each other.
    let fired = 0;
    while (this.fireTimer <= 0 && this.stored.length > 0 && fired < sh.barrels.length) {
      this.fireTimer += 1 / sh.rate;
      const b = this.barrel % sh.barrels.length;
      this.barrel++;
      const { pos, vel } = this.launchState(b, aim.barrels[b], sh.spread * DEG);
      const ex = sh.barrels[b].exit;
      const i = this.takeStored(ctx.field.fuel, { x: ex[0], y: this.hopper.center.y - this.hopper.size.y / 2, z: ex[2] });
      if (i < 0) break;
      ctx.field.fuel.place(i, pos, vel, this.id);
      this.stats.shots++;
      fired++;
    }
    if (this.fireTimer < 0) this.fireTimer = 0;
  }

  // ---------------------------------------------------------------- climb

  private toggleClimb(ctx: RobotContext) {
    const cl = this.def.climber;
    if (!cl || cl.maxLevel <= 0) return;
    if (this.climb === 'hanging' || this.climb === 'lifting' || this.climb === 'aligning') {
      this.climb = 'lowering';
      this.climbT = 0;
      return;
    }
    if (this.climb !== 'none') return;
    if (ctx.auto && !cl.canAutoClimb) return;
    const tower = ctx.field.towers[this.alliance];
    // Line up with the rungs: bumper face just in front of the rung, facing the wall.
    const dir = Math.sign(-tower.rungX); // toward the field from the rung
    const standoff = this.halfLength + TOWER.rungDiameter / 2 + 0.02;
    const pose = new THREE.Vector3(tower.rungX + dir * standoff, 0, tower.rungZ);
    const p = this.position;
    if (Math.hypot(p.x - pose.x, p.z - pose.z) > 1.6) return;
    this.climbTarget = ctx.auto ? 1 : cl.maxLevel;
    this.climbFrom.copy(p);
    this.climbFromYaw = this.yaw;
    this.climbPose.copy(pose);
    this.climbYaw = tower.climbYaw;
    this.climb = 'aligning';
    this.climbT = 0;
    this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  }

  private endClimb() {
    this.climb = 'none';
    this.climbLevel = 0;
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  private stepClimb(dt: number) {
    const cl = this.def.climber!;
    const bb = this.def.frame.bumperBottom;
    const maxLift = levelLift(cl.maxLevel, bb);
    const lift = levelLift(this.climbTarget, bb);
    const liftTime = Math.max(0.6, (cl.climbTime * lift) / Math.max(maxLift, 0.01));
    const ALIGN = 0.7;
    this.climbT += dt;
    let y = 0;
    let x = this.climbPose.x;
    let z = this.climbPose.z;
    let yaw = this.climbYaw;
    if (this.climb === 'aligning') {
      const t = smooth(Math.min(1, this.climbT / ALIGN));
      x = this.climbFrom.x + (this.climbPose.x - this.climbFrom.x) * t;
      z = this.climbFrom.z + (this.climbPose.z - this.climbFrom.z) * t;
      yaw = this.climbFromYaw + wrapAngle(this.climbYaw - this.climbFromYaw) * t;
      y = this.climbFrom.y * (1 - t);
      if (this.climbT >= ALIGN) {
        this.climb = 'lifting';
        this.climbT = 0;
      }
    } else if (this.climb === 'lifting') {
      const t = smooth(Math.min(1, this.climbT / liftTime));
      y = lift * t;
      if (this.climbT >= liftTime) {
        this.climb = 'hanging';
        this.climbLevel = this.climbTarget;
      }
    } else if (this.climb === 'hanging') {
      y = lift;
    } else if (this.climb === 'lowering') {
      this.climbLevel = 0;
      const cur = this.body.translation().y;
      y = Math.max(0, cur - dt * (lift / Math.max(0.5, liftTime * 0.6)));
      if (y <= 0.001) {
        this.setKinematicPose(x, 0.005, z, yaw);
        this.endClimb();
        return;
      }
      const tp = this.body.translation();
      x = tp.x;
      z = tp.z;
      yaw = this.yaw;
    }
    this.setKinematicPose(x, y + 0.005, z, yaw);
  }

  private setKinematicPose(x: number, y: number, z: number, yaw: number) {
    this.tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setNextKinematicTranslation({ x, y, z });
    this.body.setNextKinematicRotation({ x: this.tmpQ.x, y: this.tmpQ.y, z: this.tmpQ.z, w: this.tmpQ.w });
  }

  /** Is the robot within range of its TOWER to start a climb? */
  canClimbHere(field: Field) {
    if (!this.def.climber || this.def.climber.maxLevel <= 0 || this.climb !== 'none') return false;
    const tower = field.towers[this.alliance];
    const dir = Math.sign(-tower.rungX);
    const px = tower.rungX + dir * (this.halfLength + 0.04);
    const p = this.position;
    return Math.hypot(p.x - px, p.z - tower.rungZ) <= 1.6;
  }

  // ---------------------------------------------------------------- render

  /** Copy the physics pose to the visual. */
  sync() {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.visual.position.set(t.x, t.y, t.z);
    this.visual.quaternion.set(r.x, r.y, r.z, r.w);
    if (this.net && this.fuel) this.net.update(this.stored.map((i) => this.toLocal(this.fuel!.position(i))));
    // Swerve modules: steer visuals if the model tagged them (optional, cosmetic).
    if (this.def.drivetrain.type === 'swerve') {
      const states = swerveModuleStates(this.speeds, this.wheelPositions);
      for (let k = 0; k < states.length; k++) if (states[k].speed > 0.05) this.swerveAngles[k] = states[k].angle;
    }
  }

  /** True if the robot is fully inside the field boundary (sanity for resets). */
  inField() {
    const p = this.body.translation();
    return Math.abs(p.x) < FIELD.length / 2 + 0.5 && Math.abs(p.z) < FIELD.width / 2 + 0.5 && p.y > -1;
  }

  dispose(scene: THREE.Object3D) {
    scene.remove(this.visual);
    this.world.removeRigidBody(this.body);
    this.visual.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
      }
    });
  }
}

interface BarrelAim {
  yaw: number;
  elev: number;
  speed: number;
  ok: boolean;
  /** Heading error of this lane's shot (rad), ignoring turret slew. */
  err: number;
}
interface AimResult {
  barrels: BarrelAim[];
}

const ONE = new THREE.Vector3(1, 1, 1);

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function gauss() {
  // Box–Muller, clipped to ±3σ.
  const u = Math.random() || 1e-9;
  const v = Math.random();
  return clamp(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v), -3, 3);
}

/**
 * Hopper net: a grid draped over the FUEL pile. Edges stay on the hopper rim; interior vertices
 * rise to sit on top of the balls below them, up to the net's stretch.
 */
class HopperNet {
  private mesh: THREE.Mesh;
  private heights: Float32Array;
  private nx = 18;
  private nz = 14;
  constructor(
    private c: THREE.Vector3,
    private s: THREE.Vector3,
    private stretch: number,
    color: string,
    parent: THREE.Object3D,
  ) {
    const geo = new THREE.PlaneGeometry(s.x, s.z, this.nx, this.nz);
    geo.rotateX(-Math.PI / 2);
    geo.translate(c.x, c.y + s.y / 2, c.z);
    const mat = new THREE.MeshStandardMaterial({ color, map: netTexture(), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.9 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'hopper_net_surface';
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.heights = new Float32Array((this.nx + 1) * (this.nz + 1));
  }

  update(balls: THREE.Vector3[]) {
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const top = this.c.y + this.s.y / 2;
    const R = FUEL.radius;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const ix = i % (this.nx + 1);
      const iz = Math.floor(i / (this.nx + 1));
      const edge = ix === 0 || iz === 0 || ix === this.nx || iz === this.nz;
      let h = top;
      if (!edge) {
        for (const b of balls) {
          const dx = x - b.x;
          const dz = z - b.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < R * R * 1.6) h = Math.max(h, b.y + Math.sqrt(Math.max(0, R * R * 1.6 - d2)) * 0.8);
        }
        h = Math.min(h, top + this.stretch);
      }
      // Ease toward the target so the net settles instead of popping.
      const cur = this.heights[i] || top;
      const next = cur + (h - cur) * 0.35;
      this.heights[i] = next;
      pos.setY(i, next);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

let netTex: THREE.Texture | null = null;
function netTexture() {
  if (netTex) return netTex;
  if (typeof document === 'undefined') return (netTex = new THREE.Texture());
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff';
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
  netTex = new THREE.CanvasTexture(c);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(6, 5);
  return netTex;
}
