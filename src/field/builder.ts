import * as THREE from 'three';
import { RAPIER, type World, GROUP, groups, ALL } from '../physics/world';

export interface Mat {
  friction: number;
  restitution: number;
}

/**
 * Helper that adds static geometry (visual + collider) to a field.
 * All colliders hang off one fixed rigid body.
 */
export class StaticBuilder {
  readonly body: RAPIER.RigidBody;
  readonly materials = new Map<string, THREE.Material>();

  constructor(
    readonly world: World,
    readonly root: THREE.Object3D,
  ) {
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  material(color: number | string, opts: { opacity?: number; metalness?: number; roughness?: number; emissive?: number } = {}) {
    const key = `${color}|${opts.opacity ?? 1}|${opts.metalness ?? 0}|${opts.roughness ?? 0.7}|${opts.emissive ?? 0}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        metalness: opts.metalness ?? 0.1,
        roughness: opts.roughness ?? 0.7,
        transparent: (opts.opacity ?? 1) < 1,
        opacity: opts.opacity ?? 1,
        depthWrite: (opts.opacity ?? 1) >= 1,
        emissive: opts.emissive ?? 0,
      });
      this.materials.set(key, m);
    }
    return m;
  }

  /** Axis-aligned (optionally yawed) box. `center` is the box center. */
  box(
    center: THREE.Vector3Like,
    size: THREE.Vector3Like,
    opts: {
      yaw?: number;
      color?: number | string;
      material?: THREE.Material;
      phys?: Mat | null;
      visible?: boolean;
      opacity?: number;
      group?: number;
      parent?: THREE.Object3D;
      castShadow?: boolean;
    } = {},
  ) {
    const yaw = opts.yaw ?? 0;
    let mesh: THREE.Mesh | null = null;
    if (opts.visible !== false) {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        opts.material ?? this.material(opts.color ?? 0x888888, { opacity: opts.opacity }),
      );
      mesh.position.set(center.x, center.y, center.z);
      mesh.rotation.y = yaw;
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = true;
      (opts.parent ?? this.root).add(mesh);
    }
    if (opts.phys !== null) {
      const phys = opts.phys ?? { friction: 0.5, restitution: 0.2 };
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const desc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
        .setTranslation(center.x, center.y, center.z)
        .setRotation(q)
        .setFriction(phys.friction)
        .setRestitution(phys.restitution)
        .setCollisionGroups(groups(opts.group ?? GROUP.FIELD, ALL));
      this.world.createCollider(desc, this.body);
    }
    return mesh;
  }

  /** Cylinder along an axis ('x' | 'y' | 'z'). */
  cylinder(
    center: THREE.Vector3Like,
    radius: number,
    length: number,
    axis: 'x' | 'y' | 'z',
    opts: { color?: number | string; phys?: Mat | null; metalness?: number } = {},
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 20),
      this.material(opts.color ?? 0xb0b4ba, { metalness: opts.metalness ?? 0.6, roughness: 0.35 }),
    );
    const q = new THREE.Quaternion();
    if (axis === 'x') q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    if (axis === 'z') q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    mesh.quaternion.copy(q);
    mesh.position.set(center.x, center.y, center.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    if (opts.phys !== null) {
      const phys = opts.phys ?? { friction: 0.5, restitution: 0.2 };
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(length / 2, radius)
          .setTranslation(center.x, center.y, center.z)
          .setRotation(q)
          .setFriction(phys.friction)
          .setRestitution(phys.restitution)
          .setCollisionGroups(groups(GROUP.FIELD, ALL)),
        this.body,
      );
    }
    return mesh;
  }

  /** Convex hull collider + mesh from points. */
  hull(points: THREE.Vector3[], color: number | string, phys: Mat) {
    const flat = new Float32Array(points.flatMap((p) => [p.x, p.y, p.z]));
    const desc = RAPIER.ColliderDesc.convexHull(flat);
    if (desc) {
      desc.setFriction(phys.friction).setRestitution(phys.restitution).setCollisionGroups(groups(GROUP.FIELD, ALL));
      this.world.createCollider(desc, this.body);
    }
    return color;
  }
}

/** Places objects in "blue frame" coordinates and mirrors them for red (180° about +Y). */
export function sideTransform(side: 'blue' | 'red') {
  const s = side === 'blue' ? 1 : -1;
  return {
    sign: s,
    p: (x: number, y: number, z: number) => new THREE.Vector3(x * s, y, z * s),
    yaw: (a: number) => a + (side === 'blue' ? 0 : Math.PI),
  };
}
