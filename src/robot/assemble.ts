import * as THREE from 'three';
import type { JointDef, RobotDefinition } from './schema';
import { DEG } from '../util/units';
import { mergeStatic } from '../cad/optimize';

export interface JointRT {
  def: JointDef;
  /** Group positioned at the pivot (in parent joint space). */
  pivot: THREE.Group;
  /** Child of `pivot` that receives the motion. Parts are attached here. */
  motion: THREE.Group;
  axis: THREE.Vector3;
  value: number;
  target: number;
}

export interface Assembly {
  /** Root of the robot visual in the robot frame (+X forward, +Y up). */
  root: THREE.Group;
  /** Holds parts that move with the chassis. */
  chassis: THREE.Group;
  joints: Map<string, JointRT>;
  /** Parts that were found in the model by node name. */
  found: Set<string>;
}

/** Order joints so parents come before children; drops cycles. */
export function sortJoints(joints: JointDef[]): JointDef[] {
  const byId = new Map(joints.map((j) => [j.id, j]));
  const out: JointDef[] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (j: JointDef) => {
    const s = state.get(j.id) ?? 0;
    if (s === 2) return;
    if (s === 1) return; // cycle: ignore the back edge
    state.set(j.id, 1);
    if (j.parent && byId.has(j.parent)) visit(byId.get(j.parent)!);
    state.set(j.id, 2);
    out.push(j);
  };
  for (const j of joints) visit(j);
  return out;
}

/**
 * Build the articulated robot visual from a model and a definition.
 * The model's pose as imported is joint value 0 for every joint.
 *
 * `merge`: bake everything that moves together into one mesh per material. Imported CAD can be tens of thousands of
 * parts (a draw call each); the game, previews and thumbnails don't need them separate. The editor does (it picks
 * parts), so it passes false.
 */
export function assemble(def: RobotDefinition, model: THREE.Object3D, merge = def.source === 'package'): Assembly {
  const root = new THREE.Group();
  root.name = `robot:${def.id}`;
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  root.add(chassis);

  const placed = new THREE.Group();
  placed.name = 'model';
  placed.position.fromArray(def.model.position);
  placed.rotation.set(def.model.rotation[0] * DEG, def.model.rotation[1] * DEG, def.model.rotation[2] * DEG, 'YXZ');
  placed.scale.setScalar(def.model.scale);
  placed.add(model);
  chassis.add(placed);
  root.updateMatrixWorld(true);

  const joints = new Map<string, JointRT>();
  for (const j of sortJoints(def.joints)) {
    const parent = j.parent ? joints.get(j.parent) : undefined;
    const pivot = new THREE.Group();
    pivot.name = `joint:${j.id}`;
    const motion = new THREE.Group();
    motion.name = `motion:${j.id}`;
    pivot.add(motion);
    // Pivot positions are given in the robot frame; convert into the parent's space.
    const parentObj = parent ? parent.motion : chassis;
    parentObj.add(pivot);
    parentObj.updateMatrixWorld(true);
    const local = parentObj.worldToLocal(root.localToWorld(new THREE.Vector3().fromArray(j.pivot)));
    pivot.position.copy(local);
    pivot.updateMatrixWorld(true);
    const axis = new THREE.Vector3().fromArray(j.axis);
    if (axis.lengthSq() < 1e-9) axis.set(0, 1, 0);
    axis.normalize();
    joints.set(j.id, { def: j, pivot, motion, axis, value: 0, target: j.stowed });
  }

  // Index model nodes by name.
  const nodes = new Map<string, THREE.Object3D>();
  model.traverse((o) => {
    if (o.name && !nodes.has(o.name)) nodes.set(o.name, o);
  });
  const found = new Set<string>();
  for (const p of def.parts) {
    if (!p.joint) continue;
    const node = nodes.get(p.node);
    const jt = joints.get(p.joint);
    if (!node || !jt) continue;
    found.add(p.node);
    jt.motion.attach(node); // preserves the world transform
  }
  for (const p of def.parts) if (nodes.has(p.node)) found.add(p.node);

  if (merge) mergeStatic([chassis, ...[...joints.values()].map((j) => j.motion)], (o) => o.name.startsWith('joint:'));

  // Start every joint at its stowed value.
  for (const jt of joints.values()) {
    jt.value = jt.def.type === 'spin' ? 0 : jt.def.stowed;
    applyJoint(jt);
  }
  return { root, chassis, joints, found };
}

const tmpQ = new THREE.Quaternion();

export function applyJoint(jt: JointRT) {
  const d = jt.def;
  if (d.type === 'prismatic') {
    jt.motion.position.copy(jt.axis).multiplyScalar(jt.value);
    jt.motion.quaternion.identity();
  } else {
    tmpQ.setFromAxisAngle(jt.axis, jt.value * DEG);
    jt.motion.quaternion.copy(tmpQ);
    jt.motion.position.set(0, 0, 0);
  }
}

/** Move a joint toward its target at its max speed. Spin joints integrate `target` as a rate fraction. */
export function stepJoint(jt: JointRT, dt: number) {
  const d = jt.def;
  if (d.type === 'spin') {
    jt.value = (jt.value + jt.target * d.speed * dt) % 360;
  } else {
    const max = d.speed * dt;
    const diff = jt.target - jt.value;
    jt.value += Math.abs(diff) <= max ? diff : Math.sign(diff) * max;
  }
  applyJoint(jt);
}

/** Fraction (0..1) of the way from stowed to active. */
export function jointProgress(jt: JointRT) {
  const span = jt.def.active - jt.def.stowed;
  if (Math.abs(span) < 1e-9) return 1;
  return (jt.value - jt.def.stowed) / span;
}
