import * as THREE from 'three';
import { RAPIER, type World, GROUP, groups, ALL, MATERIAL } from '../physics/world';
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
          .setCollisionGroups(groups(GROUP.FUEL, ALL)),
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
    this.lastShooter[i] = shooter;
    if (v && v.x * v.x + v.y * v.y + v.z * v.z > 25) {
      b.enableCcd(true);
      this.shotAt[i] = this.time;
    }
    if (shooter) {
      this.colliders[i].setCollisionGroups(groups(GROUP.FUEL, ALL & ~GROUP.ROBOT));
      this.ghostUntil[i] = this.time + 0.18;
    }
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
        this.colliders[i].setCollisionGroups(groups(GROUP.FUEL, ALL));
        this.ghostUntil[i] = -1;
      }
      if (this.shotAt[i] >= 0 && this.time - this.shotAt[i] > 3) {
        this.bodies[i].enableCcd(false);
        this.shotAt[i] = -1;
      }
    }
  }

  /** Copy body transforms into the instanced mesh. */
  sync() {
    for (let i = 0; i < this.capacity; i++) {
      if (this.state[i] !== 'field') {
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
