import type * as THREE from 'three';
import { Kit, M, mat } from './kit';
import type { RobotDefinitionInput } from '../../robot/schema';
import { inches } from '../../util/units';

export type JointIn = NonNullable<RobotDefinitionInput['joints']>[number];
export type PartIn = NonNullable<RobotDefinitionInput['parts']>[number];
type V3 = [number, number, number];

export interface BuiltinBuild {
  model: THREE.Object3D;
  joints: JointIn[];
  parts: PartIn[];
  /** Overrides computed from the model (e.g. shooter exits that depend on geometry). */
  patch?: Partial<RobotDefinitionInput>;
}

export interface BuiltinRobot {
  /** Metadata + gameplay stats (joints/parts come from build()). */
  def: RobotDefinitionInput;
  build: () => BuiltinBuild;
}

/** Collects joints + part mappings while building a model. */
export class Rig {
  joints: JointIn[] = [];
  parts: PartIn[] = [];
  joint(j: JointIn, ...nodes: (string | THREE.Object3D)[]) {
    this.joints.push(j);
    for (const n of nodes) this.parts.push({ node: typeof n === 'string' ? n : n.name, joint: j.id });
    return j.id;
  }
}

/**
 * Swerve chassis: frame, four steering MK5n-style modules (steer + wheel joints), electronics.
 */
export function swerveBase(kit: Kit, rig: Rig, L: number, W: number, opts: { moduleInset?: number; wheelR?: number; electronics?: [number, number] } = {}) {
  const railTop = kit.frame(L, W);
  const inset = opts.moduleInset ?? inches(2.75);
  const wheelR = opts.wheelR ?? inches(2);
  // Order matches Robot's wheel order: FL, FR, BL, BR.
  const corners: [string, number, number][] = [
    ['fl', L / 2 - inset, -(W / 2 - inset)],
    ['fr', L / 2 - inset, W / 2 - inset],
    ['bl', -(L / 2 - inset), -(W / 2 - inset)],
    ['br', -(L / 2 - inset), W / 2 - inset],
  ];
  for (const [n, x, z] of corners) {
    const m = kit.swerveModule(n, x, z, wheelR, railTop);
    rig.joint({ id: `steer_${n}`, type: 'revolute', driver: 'steer', pivot: [x, wheelR, z], axis: [0, 1, 0], speed: 900 }, m.steer);
    rig.joint({ id: `wheel_${n}`, type: 'spin', driver: 'wheel', parent: `steer_${n}`, pivot: [x, wheelR, z], axis: [0, 0, -1], speed: 1400 }, m.wheel);
  }
  const [ex, ez] = opts.electronics ?? [0, 0];
  kit.electronics(ex, ez, railTop - inches(1));
  return { railTop, wheelR };
}

/** Pair of pocketed side plates (shooter/turret/indexer towers), mirrored in Z. */
export function sidePlates(kit: Kit, name: string, x: number, y: number, zHalf: number, size: [number, number], color: number, parent?: THREE.Object3D) {
  kit.pocketPlate(`${name}_l`, [x, y, -zHalf], size[0], size[1], { color, parent });
  kit.pocketPlate(`${name}_r`, [x, y, zHalf], size[0], size[1], { color, parent });
}

/**
 * Turret assembly: bearing ring with gear, pocketed housing plates, flywheel(s), hood with
 * sector gear, feeder wheel. Shooter points +X at joint value 0.
 */
export function turret(
  kit: Kit,
  name: string,
  pivot: V3,
  opts: { ringR?: number; flywheelR?: number; flywheelW?: number; color?: number; accent?: number } = {},
) {
  const [px, py, pz] = pivot;
  const ringR = opts.ringR ?? inches(5.5);
  const fr = opts.flywheelR ?? inches(1.5);
  const fw = opts.flywheelW ?? inches(4);
  const color = opts.color ?? 0x23272e;
  const turretG = kit.group(`${name}_turret`);
  kit.cyl(`${name}_ring`, [px, py, pz], ringR, inches(0.5), 'y', M.aluDark(), turretG, 40);
  kit.cyl(`${name}_gear`, [px, py - inches(0.35), pz], ringR * 1.05, inches(0.25), 'y', mat(0x1c1d21, { metal: 0.3 }), turretG, 48);
  kit.cyl(`${name}_deck`, [px, py + inches(0.35), pz], ringR * 0.92, inches(0.18), 'y', mat(color, { metal: 0.4, rough: 0.5 }), turretG, 32);
  const hx = px + inches(1);
  const hy = py + inches(4.2);
  const side = (s: number) => pz + s * (fw / 2 + inches(0.45));
  kit.pocketPlate(`${name}_side_l`, [hx, hy, side(-1)], inches(7.5), inches(7.5), { color, parent: turretG, cell: inches(2.2) });
  kit.pocketPlate(`${name}_side_r`, [hx, hy, side(1)], inches(7.5), inches(7.5), { color, parent: turretG, cell: inches(2.2) });
  kit.motor(`${name}_fly_motor`, [hx - inches(2), hy - inches(1.2), pz + fw / 2 + inches(1.9)], 'z', turretG);
  kit.motor(`${name}_turret_motor`, [px - ringR * 0.85, py + inches(1.3), pz], 'y', turretG, true);
  // Belt from motor pulley to flywheel.
  kit.pulley(`${name}_fly_pulley`, [hx + inches(1.5), hy + inches(1.5), side(1) + inches(0.4)], inches(1.3), { parent: turretG });
  kit.belt(`${name}_fly_belt`, [hx - inches(2), hy - inches(1.2)], [hx + inches(1.5), hy + inches(1.5)], side(1) + inches(0.4), turretG);
  const flyName = `${name}_flywheel`;
  const fly = kit.group(flyName, turretG);
  const flyC: V3 = [hx + inches(1.5), hy + inches(1.5), pz];
  kit.cyl(`${name}_fly_body`, flyC, fr, fw, 'z', M.grip(), fly, 28);
  for (const s of [-1, 1]) kit.pulley(`${name}_fly_hub${s}`, [flyC[0], flyC[1], pz + (s * fw) / 2], fr * 0.98, { parent: fly, t: inches(0.1), color: 0xb0b6bd, spokes: 6 });
  kit.box(`${name}_fly_mark`, [flyC[0], flyC[1] + fr, flyC[2]], [inches(0.5), 0.004, fw], M.orange(), fly);
  // Hood: curved polycarb + sector gear plates.
  const hoodName = `${name}_hood`;
  const hood = kit.group(hoodName, turretG);
  const hoodPivot: V3 = [hx - inches(2.2), hy + inches(3.3), pz];
  for (let k = 0; k < 5; k++) {
    const a = 0.25 - k * 0.22;
    kit.box(`${name}_hood_seg${k}`, [hoodPivot[0] + inches(1.2) + Math.cos(a) * inches(3.2), hoodPivot[1] + Math.sin(a) * inches(0.9), pz], [inches(1.5), inches(0.2), fw + inches(0.5)], M.smoke(), hood, [0, 0, a - 0.25]);
  }
  for (const s of [-1, 1]) kit.sectorPlate(`${name}_hood_sector${s}`, [hoodPivot[0], hoodPivot[1], pz + s * (fw / 2 + inches(0.15))], inches(3.8), -0.6, 0.3, { parent: hood, t: inches(0.19), color: opts.accent ?? 0x30343c, teeth: 14 });
  // Feeder (kicker) wheel under the flywheel.
  kit.tubeRoller(`${name}_kicker`, hx - inches(0.8), hy - inches(1.4), pz - fw / 2, pz + fw / 2, inches(0.9), 0x3a8a3a, turretG);
  return {
    turretNode: turretG.name,
    flyNode: flyName,
    flyCenter: flyC,
    hoodNode: hoodName,
    hoodPivot,
    exit: [flyC[0] + fr + inches(1.5), flyC[1] + inches(1.2), pz] as V3,
  };
}

/** Over-the-bumper pivoting ground intake: two arms, compliant roller, top roller, motor. */
export function pivotIntake(
  kit: Kit,
  name: string,
  pivot: V3,
  armLen: number,
  width: number,
  opts: { color?: number; wheel?: number; armAngle?: number; parent?: THREE.Object3D; tube?: boolean } = {},
) {
  const g = kit.group(name, opts.parent);
  const [px, py] = pivot;
  // Arms are modeled deployed (pointing forward and down at armAngle below horizontal).
  const a = opts.armAngle ?? 0.45;
  const ex = px + Math.cos(a) * armLen;
  const ey = py - Math.sin(a) * armLen;
  for (const s of [-1, 1]) {
    const arm = kit.pocketPlate(`${name}_arm${s}`, [(px + ex) / 2, (py + ey) / 2, s * (width / 2 - inches(0.4))], armLen + inches(1.5), inches(2.4), { parent: g, color: opts.color ?? 0x24272d, cell: inches(2) });
    arm.rotation.z = -a;
  }
  if (opts.tube) {
    for (const s of [-1, 1]) {
      const t = kit.box(`${name}_tube${s}`, [(px + ex) / 2, (py + ey) / 2 + inches(1.5), s * (width / 2 - inches(1.6))], [armLen, inches(1), inches(1)], M.tube(), g);
      t.rotation.z = -a;
    }
  }
  const roller = kit.roller(`${name}_roller`, ex, ey, -width / 2 + inches(1), width / 2 - inches(1), inches(1.6), g, opts.wheel ?? 0x2a62ff, inches(1.8));
  const mid = kit.tubeRoller(`${name}_mid`, px + Math.cos(a) * armLen * 0.55, py - Math.sin(a) * armLen * 0.55 + inches(1.6), -width / 2 + inches(1), width / 2 - inches(1), inches(0.75), 0x2a2d33, g);
  kit.motor(`${name}_motor`, [px + Math.cos(a) * armLen * 0.3, py - Math.sin(a) * armLen * 0.3 + inches(1.5), width / 2 - inches(2.2)], 'z', g);
  return { group: g, roller, mid, rollerCenter: [ex, ey, 0] as V3 };
}
