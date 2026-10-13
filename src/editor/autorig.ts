import * as THREE from 'three';
import type { JointDef, PartDef, RobotDefinition } from '../robot/schema';

/**
 * Guess joints from CAD part names. FRC CAD is usually organized by subsystem ("Intake", "Shooter", "Turret",
 * "Hood", "Climber", "Swerve Module FL"...), so a name match plus the part's bounding box gives a good first rig:
 * the pivot at the box center (or the hinge edge for an intake), and the axis from the box shape (a wheel spins
 * about its thinnest dimension, a roller about its longest).
 */

interface Rule {
  kind: string;
  re: RegExp;
  make: (box: THREE.Box3, frame: RobotDefinition['frame']) => Omit<JointDef, 'id' | 'name' | 'parent'>;
}

const v3 = (v: THREE.Vector3) => v.toArray().map((x) => Math.round(x * 1e4) / 1e4) as [number, number, number];

/** Cardinal axis (robot frame) along the box's thinnest (`thin`) or longest dimension. */
function boxAxis(box: THREE.Box3, thin: boolean): [number, number, number] {
  const s = box.getSize(new THREE.Vector3());
  const d = [s.x, s.y, s.z];
  const k = thin ? d.indexOf(Math.min(...d)) : d.indexOf(Math.max(...d));
  return [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0];
}

/** Disc-like (one dimension much smaller) → spin about it; otherwise a roller/drum → spin about the longest one. */
function spinAxis(box: THREE.Box3): [number, number, number] {
  const s = box.getSize(new THREE.Vector3());
  const d = [s.x, s.y, s.z].sort((a, b) => a - b);
  return boxAxis(box, d[0] < d[1] * 0.6);
}

const RULES: Rule[] = [
  {
    kind: 'turret',
    re: /turret/i,
    make: (b) => ({ type: 'revolute', driver: 'turret', pivot: v3(b.getCenter(new THREE.Vector3())), axis: [0, 1, 0], stowed: 0, active: 0, speed: 360 }),
  },
  {
    kind: 'hood',
    re: /hood/i,
    make: (b) => ({ type: 'revolute', driver: 'hood', pivot: v3(b.getCenter(new THREE.Vector3())), axis: [0, 0, 1], stowed: 0, active: -25, speed: 180 }),
  },
  {
    kind: 'flywheel',
    re: /fly[\s_-]?wheel|shooter[\s_-]?(wheel|roller)|drum|launcher[\s_-]?wheel/i,
    make: (b) => ({ type: 'spin', driver: 'shooter-wheel', pivot: v3(b.getCenter(new THREE.Vector3())), axis: spinAxis(b), stowed: 0, active: 0, speed: 3000 }),
  },
  {
    kind: 'indexer',
    re: /spindexer|indexer|rotor|feeder|kicker|serializer/i,
    make: (b) => ({ type: 'spin', driver: 'indexer', pivot: v3(b.getCenter(new THREE.Vector3())), axis: spinAxis(b), stowed: 0, active: 0, speed: 900 }),
  },
  {
    kind: 'intake-roller',
    re: /roller/i,
    make: (b) => ({ type: 'spin', driver: 'intake-roller', pivot: v3(b.getCenter(new THREE.Vector3())), axis: boxAxis(b, false), stowed: 0, active: 0, speed: 1800 }),
  },
  {
    kind: 'intake',
    re: /intake/i,
    // Hinged at the end nearest the robot center, along its top edge; swings down/out about Z. A front intake (box
    // ahead of center) pivots at its back edge.
    make: (b) => {
      const front = b.getCenter(new THREE.Vector3()).x >= 0;
      return {
        type: 'revolute',
        driver: 'intake-deploy',
        pivot: v3(new THREE.Vector3(front ? b.min.x : b.max.x, b.max.y, (b.min.z + b.max.z) / 2)),
        axis: [0, 0, front ? -1 : 1],
        stowed: 0,
        active: 0,
        speed: 360,
      };
    },
  },
  {
    kind: 'climber',
    re: /climb|elevator|hook/i,
    make: (b) => ({ type: 'prismatic', driver: 'climber', pivot: v3(b.getCenter(new THREE.Vector3())), axis: [0, 1, 0], stowed: 0, active: 0.3, speed: 0.4 }),
  },
  {
    kind: 'wheel',
    re: /wheel|tread|colson|billet/i,
    make: (b) => ({ type: 'spin', driver: 'wheel', pivot: v3(b.getCenter(new THREE.Vector3())), axis: boxAxis(b, true), stowed: 0, active: 0, speed: 2000 }),
  },
];

export interface AutoRigResult {
  joints: JointDef[];
  parts: PartDef[];
  /** One line per joint created, for the UI. */
  summary: string[];
}

/**
 * Build joints for `model` placed with `def.model`. Existing joints are kept; nodes already mapped are skipped.
 * Wheels are capped at 8 and rollers at 10 so a messy CAD tree can't flood the rig.
 */
export function autoRig(def: RobotDefinition, model: THREE.Object3D): AutoRigResult {
  const holder = new THREE.Group();
  holder.position.fromArray(def.model.position);
  holder.rotation.set((def.model.rotation[0] * Math.PI) / 180, (def.model.rotation[1] * Math.PI) / 180, (def.model.rotation[2] * Math.PI) / 180, 'YXZ');
  holder.scale.setScalar(def.model.scale);
  const clone = model.clone(true);
  holder.add(clone);
  holder.updateMatrixWorld(true);

  const mapped = new Set(def.parts.map((p) => p.node));
  const ids = new Set(def.joints.map((j) => j.id));
  const joints: JointDef[] = [];
  const parts: PartDef[] = [];
  const summary: string[] = [];
  const counts = new Map<string, number>();
  const caps: Record<string, number> = { wheel: 8, 'intake-roller': 10, indexer: 4, flywheel: 4 };

  // Nested matches (a hood inside the turret) get the enclosing joint as their parent.
  const visit = (o: THREE.Object3D, parentJoint: string | null) => {
    // A part the user already mapped: its joint is the parent of anything rigged below it.
    let here = (o.name && def.parts.find((p) => p.node === o.name)?.joint) || parentJoint;
    if (o !== clone && o.name && !mapped.has(o.name)) {
      const rule = RULES.find((r) => r.re.test(o.name));
      // Don't rig the same subsystem twice down one branch (e.g. "Intake" > "Intake Plate").
      const parentKind = parentJoint ? joints.find((j) => j.id === parentJoint)?.name.split(':')[0] : null;
      const n = rule ? (counts.get(rule.kind) ?? 0) : 0;
      if (rule && rule.kind !== parentKind && n < (caps[rule.kind] ?? 2)) {
        const box = new THREE.Box3().setFromObject(o);
        if (!box.isEmpty()) {
          counts.set(rule.kind, n + 1);
          let id = `${rule.kind}${n + 1}`;
          while (ids.has(id)) id += '_';
          ids.add(id);
          joints.push({ id, name: `${rule.kind}: ${o.name}`, parent: parentJoint, ...rule.make(box, def.frame) });
          parts.push({ node: o.name, joint: id });
          summary.push(`${rule.kind} → ${o.name}`);
          here = id;
        }
      }
    }
    for (const c of o.children) visit(c, here);
  };
  visit(clone, null);
  return { joints, parts, summary };
}
