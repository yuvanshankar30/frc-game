import * as THREE from 'three';
import { RAPIER, type World, GROUP, groups, ALL, MATERIAL, ROBOT_DOMINANCE } from '../physics/world';
import { FUEL } from './rebuilt/dims';
import { FUEL_AIR_DAMPING } from '../robot/ballistics';

export type FuelState = 'field' | 'stored' | 'hub' | 'outpost' | 'free';

/**
 * Pool of FUEL balls. Each ball is a Rapier dynamic body that is disabled while it is
 * off the field (inside a robot, inside the HUB, or held by a human player).
 * Rendering uses one InstancedMesh.
 */
export class FuelSystem {
  readonly mesh: THREE.InstancedMesh;
  readonly bodies: RAPIER.RigidBody[] = [];
  readonly colliders: RAPIER.Collider[] = [];
  /** Time until a freshly shot ball may collide with robots again (avoids hitting the shooter). */
  private ghostUntil: number[] = [];
  readonly state: FuelState[] = [];
  /** Who last launched this ball (robot id) — used for stats. */
  readonly lastShooter: (string | null)[] = [];
  /** Time when this ball was launched (for CCD toggling). */
  private shotAt: number[] = [];
  /** Vertical velocity of each ball last step (bounce detection for sound). */
  private lastVy: Float32Array;
  /** Loose-FUEL bounces since the last drain: world position and impact speed (m/s). For the audio. */
  readonly drops: { x: number; y: number; z: number; speed: number }[] = [];
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpP = new THREE.Vector3();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private time = 0;

  constructor(
    readonly world: World,
    readonly capacity: number,
    scene: THREE.Object3D,
  ) {
    this.lastVy = new Float32Array(capacity);
    const geo = new THREE.SphereGeometry(FUEL.radius, 14, 10);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2c418, roughness: 0.85, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    for (let i = 0; i < capacity; i++) {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0, -10 - i, 0)
          .setLinearDamping(FUEL_AIR_DAMPING)
          .setAngularDamping(0.8)
          .setCanSleep(true),
      );
      const col = world.createCollider(
        RAPIER.ColliderDesc.ball(FUEL.radius)
          .setMass(FUEL.mass)
          .setFriction(MATERIAL.fuel.friction)
          .setRestitution(MATERIAL.fuel.restitution)
          .setCollisionGroups(FIELD_GROUPS),
        body,
      );
      body.setEnabled(false);
      this.bodies.push(body);
      this.colliders.push(col);
      this.ghostUntil.push(-1);
      this.state.push('free');
      this.lastShooter.push(null);
      this.shotAt.push(-1);
      this.mesh.setMatrixAt(i, this.zero);
    }
  }

  /** Grab a free ball index (or -1). */
  alloc(): number {
    for (let i = 0; i < this.capacity; i++) if (this.state[i] === 'free') return i;
    return -1;
  }

  /** Put ball `i` on the field at a position with an optional velocity. */
  place(i: number, p: THREE.Vector3Like, v?: THREE.Vector3Like, shooter: string | null = null) {
    const b = this.bodies[i];
    b.setEnabled(true);
    b.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    b.setLinvel(v ? { x: v.x, y: v.y, z: v.z } : { x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.state[i] = 'field';
    b.setDominanceGroup(0);
    this.lastShooter[i] = shooter;
    this.colliders[i].setCollisionGroups(FIELD_GROUPS);
    this.colliders[i].setFriction(MATERIAL.fuel.friction);
    this.colliders[i].setRestitution(MATERIAL.fuel.restitution);
    this.bodies[i].setLinearDamping(FUEL_AIR_DAMPING);
    this.bodies[i].enableCcd(false);
    this.ghostUntil[i] = -1;
    if (v && v.x * v.x + v.y * v.y + v.z * v.z > 25) {
      b.enableCcd(true);
      this.shotAt[i] = this.time;
    }
    if (shooter) {
      this.colliders[i].setCollisionGroups(groups(GROUP.FUEL, ALL & ~GROUP.ROBOT));
      this.ghostUntil[i] = this.time + 0.18;
    }
  }

  /**
   * Put ball `i` into a robot hopper as a live physics body. It only collides with hopper
   * walls and other stored FUEL, so it rattles around inside the robot as it drives.
   */
  store(i: number, p: THREE.Vector3Like, v: THREE.Vector3Like) {
    const b = this.bodies[i];
    b.setEnabled(true);
    b.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    b.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    b.setLinearDamping(0.6);
    this.colliders[i].setCollisionGroups(STORED_GROUPS);
    // Squishy foam settles into the gaps of a pile as the robot drives: low friction and no bounce let carried
    // FUEL pack as densely as a real hopper (~0.6) instead of stacking in loose columns.
    this.colliders[i].setFriction(0.02);
    this.colliders[i].setRestitution(0);
    b.setDominanceGroup(ROBOT_DOMINANCE);
    this.state[i] = 'stored';
    this.ghostUntil[i] = -1;
    this.shotAt[i] = -1;
    b.enableCcd(true); // carried FUEL gets CCD so it stays inside the hopper walls
  }

  /** Take ball `i` off the field into a holding state. */
  hold(i: number, s: Exclude<FuelState, 'field'>) {
    const b = this.bodies[i];
    b.setEnabled(false);
    b.setTranslation({ x: 0, y: -10 - i, z: 0 }, false);
    this.state[i] = s;
    if (this.shotAt[i] >= 0) {
      b.enableCcd(false);
      this.shotAt[i] = -1;
    }
  }

  /** Spawn a new ball from the free pool directly onto the field. */
  spawn(p: THREE.Vector3Like, v?: THREE.Vector3Like) {
    const i = this.alloc();
    if (i >= 0) this.place(i, p, v);
    return i;
  }

  /** Spawn a new ball from the free pool directly into a holding state. */
  spawnHeld(s: Exclude<FuelState, 'field' | 'free'>) {
    const i = this.alloc();
    if (i >= 0) this.hold(i, s);
    return i;
  }

  /** Index of any ball in the given state (e.g. a stored ball to shoot), or -1. */
  findIn(s: FuelState, owner?: (i: number) => boolean) {
    for (let i = 0; i < this.capacity; i++) if (this.state[i] === s && (!owner || owner(i))) return i;
    return -1;
  }

  count(s: FuelState) {
    let n = 0;
    for (const x of this.state) if (x === s) n++;
    return n;
  }

  reset() {
    for (let i = 0; i < this.capacity; i++) {
      this.hold(i, 'free');
      this.lastShooter[i] = null;
    }
  }

  /** Called every physics step. */
  step(dt: number) {
    this.time += dt;
    // Turn CCD back off once a shot ball has had time to land.
    for (let i = 0; i < this.capacity; i++) {
      if (this.ghostUntil[i] >= 0 && this.time > this.ghostUntil[i]) {
        this.colliders[i].setCollisionGroups(FIELD_GROUPS);
        this.ghostUntil[i] = -1;
      }
      if (this.shotAt[i] >= 0 && this.time - this.shotAt[i] > 3) {
        this.bodies[i].enableCcd(false);
        this.shotAt[i] = -1;
      }
      // A falling ball whose vertical speed suddenly reverses just hit something: queue a drop sound.
      if (this.state[i] !== 'field') {
        this.lastVy[i] = 0;
        continue;
      }
      const vy = this.bodies[i].linvel().y;
      const prev = this.lastVy[i];
      this.lastVy[i] = vy;
      if (prev < -1.2 && vy - prev > 1.5 && this.drops.length < 64) {
        const t = this.bodies[i].translation();
        this.drops.push({ x: t.x, y: t.y, z: t.z, speed: -prev });
      }
    }
  }

  /** Copy body transforms into the instanced mesh. */
  sync() {
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] !== 'field' && this.state[i] !== 'stored') {
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      const b = this.bodies[i];
      const t = b.translation();
      const r = b.rotation();
      this.tmpP.set(t.x, t.y, t.z);
      this.tmpQ.set(r.x, r.y, r.z, r.w);
      this.tmpM.compose(this.tmpP, this.tmpQ, ONE);
      this.mesh.setMatrixAt(i, this.tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  position(i: number) {
    return this.bodies[i].translation();
  }

  velocity(i: number) {
    return this.bodies[i].linvel();
  }
}

const ONE = new THREE.Vector3(1, 1, 1);
/** Loose FUEL: collides with everything except hopper walls and FUEL inside robots. */
const FIELD_GROUPS = groups(GROUP.FUEL, ALL & ~(GROUP.HOPPER | GROUP.STORED));
/** Carried FUEL: only hopper walls and other carried FUEL. */
const STORED_GROUPS = groups(GROUP.STORED, GROUP.HOPPER | GROUP.STORED);
