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
  private spin = 0;
  private intakeOn = 0;
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
    this.hopperMesh = this.makeHopperVisual();
    if (this.hopperMesh) this.visual.add(this.hopperMesh);
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
    this.turretYaw = (def.shooter?.barrels ?? []).map(() => 0);
    if (def.shooter?.hoodMin != null) this.hoodAngle = def.shooter.hoodMin;
    else if (def.shooter) this.hoodAngle = def.shooter.angle;
  }

  private hopperMesh: THREE.InstancedMesh | null = null;

  /** Instanced FUEL balls packed into the hopper box, shown up to the stored count. */
  private makeHopperVisual() {
    const box = this.def.storage.box;
    const cap = this.def.storage.capacity;
    if (!box || cap <= 0) return null;
    const d = FUEL.diameter * 0.98;
    const nx = Math.max(1, Math.floor(box.size[0] / d));
    const nz = Math.max(1, Math.floor(box.size[2] / d));
    const mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(FUEL.radius, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.85 }),
      cap,
    );
    const m = new THREE.Matrix4();
    const x0 = box.center[0] - ((nx - 1) * d) / 2;
    const z0 = box.center[2] - ((nz - 1) * d) / 2;
    const y0 = box.center[1] - box.size[1] / 2 + FUEL.radius;
    for (let i = 0; i < cap; i++) {
      const layer = Math.floor(i / (nx * nz));
      const k = i % (nx * nz);
      const ix = k % nx;
      const iz = Math.floor(k / nx);
      const off = layer % 2 ? d / 2 : 0;
      const x = Math.min(x0 + ix * d + off, box.center[0] + box.size[0] / 2 - FUEL.radius);
      const z = Math.min(z0 + iz * d + off, box.center[2] + box.size[2] / 2 - FUEL.radius);
      m.makeTranslation(x + (Math.random() - 0.5) * 0.01, y0 + layer * d * 0.82, z + (Math.random() - 0.5) * 0.01);
      mesh.setMatrixAt(i, m);
    }
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    return mesh;
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

  /** Place the robot on the floor at (x, z) facing `yaw`. */
  teleport(x: number, z: number, yaw: number) {
    if (this.climb !== 'none') this.endClimb();
    this.body.setTranslation({ x, y: 0.005, z }, true);
    this.tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setRotation({ x: this.tmpQ.x, y: this.tmpQ.y, z: this.tmpQ.z, w: this.tmpQ.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.speeds = { vx: 0, vz: 0, omega: 0 };
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
    if (ctx.assist && cmd.shoot && this.def.shooter && this.stored.length > 0) {
      const err = this.robotAimError(ctx);
      if (err !== null && Math.abs(cmd.rot) < 0.2) {
        target.omega = clamp(err * 8, -limits.maxOmega, limits.maxOmega);
      }
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
    // Shooter spin-up.
    const wantSpin = canAct && cmd.shoot && !!def.shooter;
    this.spin = approach(this.spin, wantSpin ? 1 : 0, dt * (wantSpin ? 3.5 : 1.2));

    if (ctx.infiniteFuel && this.stored.length < (def.storage.capacity || 0)) {
      const i = ctx.field.fuel.spawnHeld('stored');
      if (i >= 0) this.stored.push(i);
    }

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
        jt.target = this.intakeOn > 0.01 ? d.active : d.stowed;
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
      default:
        break;
    }
    void aim;
    stepJoint(jt, dt);
  }

  private turretJoints: JointRT[] | null = null;
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
          fuel.hold(i, 'stored');
          this.stored.push(i);
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
    const i = this.stored.pop()!;
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
      const i = this.stored.pop()!;
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
    if (this.hopperMesh) this.hopperMesh.count = Math.min(this.stored.length, this.def.storage.capacity);
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
