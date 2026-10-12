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
  /** Infinite storage refill for practice. */
  infiniteFuel?: boolean;
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
    this.body = world.createRigidBody(desc);
    const bottom = Math.max(f.bumperBottom, wheelR + 0.01);
    // Collider top sits a little under the declared height so legal robots don't snag the TRENCH arm when pitching.
    const h = Math.max(f.height - 0.015, bottom + 0.1);
    // Main chassis + superstructure (full frame footprint incl. bumpers, up to robot height).
    world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(this.halfLength - 0.02, (h - bottom) / 2 - 0.02, this.halfWidth - 0.02, 0.02)
        .setTranslation(0, (h + bottom) / 2, 0)
        .setDensity(0)
        .setFriction(MATERIAL.bumper.friction)
        .setRestitution(MATERIAL.bumper.restitution)
        .setCollisionGroups(groups(GROUP.ROBOT, ALL)),
      this.body,
    );
    // Frictionless wheel spheres: the drivetrain sets velocity directly.
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
    const t = 0.06;
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
    add(c.x, c.y + hy + t / 2, c.z, hx + t, t / 2, hz + t); // roof / net
    add(c.x, c.y, c.z - hz - t / 2, hx + t, hy, t / 2); // left
    add(c.x, c.y, c.z + hz + t / 2, hx + t, hy, t / 2); // right
    // Entry wall leaves a slot at the top for FUEL coming off the intake.
    const gap = Math.min(Robot.ENTRY_GAP, s.y * 0.6);
    const wallH = (s.y - gap) / 2;
    add(c.x + entrySide * (hx + t / 2), c.y - hy + wallH, c.z, t / 2, wallH, hz);
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
          if (!inside) {
            // Didn't make it in cleanly: drop it at the entry point.
            const w = this.toWorld(this.entryPoint(lp.z), new THREE.Vector3());
            fuel.bodies[i].setTranslation(w, true);
          }
          fuel.colliders[i].setCollisionGroups(groups(GROUP.STORED, GROUP.HOPPER | GROUP.STORED));
        }
        this.entering.delete(i);
      } else this.entering.set(i, t + dt);
    }
    for (let k = this.stored.length - 1; k >= 0; k--) {
      const i = this.stored[k];
      if (this.entering.has(i)) continue;
      const lp = this.toLocal(fuel.position(i));
      if (Math.abs(lp.x - c.x) > s.x / 2 + m || Math.abs(lp.y - c.y) > s.y / 2 + m || Math.abs(lp.z - c.z) > s.z / 2 + m) {
        const p = fuel.position(i);
        const v = fuel.velocity(i);
        fuel.place(i, p, v);
        this.stored.splice(k, 1);
      }
    }
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
    // Tank/mecanum wheels resist sideways sliding.
    const next = limitSpeeds(current, target, limits, dt);
    if (d.type === 'tank') next.vz = approach(current.vz, 0, 40 * dt);
    this.speeds = next;
    // Robot → world.
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    const wx = next.vx * c + next.vz * s;
    const wz = -next.vx * s + next.vz * c;
    // Only drive when the wheels are on the ground.
    const grounded = this.body.translation().y < 0.25 || Math.abs(lv.y) < 0.6;
    if (grounded) {
      this.body.setLinvel({ x: wx, y: lv.y, z: wz }, true);
      this.body.setAngvel({ x: av.x * 0.9, y: next.omega, z: av.z * 0.9 }, true);
    }
  }

  /** Heading error (rad) between the robot and the direction needed to shoot at its HUB, or null. */
  private robotAimError(ctx: RobotContext): number | null {
    const sh = this.def.shooter;
    if (!sh) return null;
    const hub = ctx.field.hubs[this.alliance].target;
    const p = this.position;
    const desired = Math.atan2(-(hub.z - p.z), hub.x - p.x);
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
    if (ctx.infiniteFuel && this.stored.length < (def.storage.capacity || 0)) this.preload(ctx.field.fuel, 1);
    this.checkSpills(ctx.field.fuel, dt);

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
        jt.target = this.spin > 0.8 && this.stored.length > 0 ? 1 : this.intakeOn * 0.5;
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
        jt.target = clamp(v / Math.max(0.1, this.def.drivetrain.maxSpeed), 0, 1) * Math.sign(this.speeds.vx || 1);
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
    const lv = this.body.linvel();
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
          tx = hub.x - lv.x * tof;
          tz = hub.z - lv.z * tof;
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
      // Fixed shooter: the robot's heading must point the shooter at the HUB.
      const e = this.robotAimError(ctx);
      if (e === null || Math.abs(e) > tol) return false;
    }
    if (sh.hoodMin !== null && Math.abs(this.hoodAngle - aim.barrels[0].elev / DEG) > 3) return false;
    // Fixed shooters shouldn't fire mid-spin.
    if (Math.abs(this.body.angvel().y) > 1.2) return false;
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
    const lv = this.body.linvel();
    const vel = new THREE.Vector3(
      Math.cos(elev) * Math.cos(dirYaw) * speed + lv.x,
      Math.sin(elev) * speed,
      -Math.cos(elev) * Math.sin(dirYaw) * speed + lv.z,
    );
    return { pos, vel };
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
