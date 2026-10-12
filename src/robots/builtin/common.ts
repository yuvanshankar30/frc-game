import type * as THREE from 'three';
import { Kit, M } from './kit';
import type { RobotDefinitionInput } from '../../robot/schema';
import { inches } from '../../util/units';

export type JointIn = NonNullable<RobotDefinitionInput['joints']>[number];
export type PartIn = NonNullable<RobotDefinitionInput['parts']>[number];

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

/**
 * Swerve chassis: frame, four modules with spinning wheels, electronics.
 * Returns joints/parts for the wheels and the rail top height.
 */
export function swerveBase(kit: Kit, L: number, W: number, opts: { moduleInset?: number; wheelR?: number; electronics?: [number, number] } = {}) {
  const railTop = kit.frame(L, W);
  const inset = opts.moduleInset ?? inches(2.75);
  const wheelR = opts.wheelR ?? inches(2);
  const joints: JointIn[] = [];
  const parts: PartIn[] = [];
  const corners: [string, number, number][] = [
    ['fl', L / 2 - inset, -(W / 2 - inset)],
    ['fr', L / 2 - inset, W / 2 - inset],
    ['bl', -(L / 2 - inset), -(W / 2 - inset)],
    ['br', -(L / 2 - inset), W / 2 - inset],
  ];
  for (const [n, x, z] of corners) {
    const wheel = kit.swerveModule(n, x, z, wheelR, railTop);
    joints.push({ id: `wheel_${n}`, type: 'spin', driver: 'wheel', pivot: [x, wheelR, z], axis: [0, 0, -1], speed: 1400 });
    parts.push({ node: wheel, joint: `wheel_${n}` });
  }
  const [ex, ez] = opts.electronics ?? [0, 0];
  kit.electronics(ex, ez, railTop - inches(1));
  return { railTop, joints, parts, wheelR };
}

/** Pair of side plates (shooter/turret/indexer towers), mirrored in Z. */
export function sidePlates(kit: Kit, name: string, x: number, y: number, zHalf: number, size: [number, number], color: number, parent?: THREE.Object3D) {
  kit.plate(`${name}_l`, [x, y, -zHalf], [size[0], size[1], inches(0.25)], parent, color);
  kit.plate(`${name}_r`, [x, y, zHalf], [size[0], size[1], inches(0.25)], parent, color);
}

/** Turret assembly: bearing ring, base plate, flywheel housing, hood. Returns node names for joints. */
export function turret(
  kit: Kit,
  name: string,
  pivot: [number, number, number],
  opts: { ringR?: number; flywheelR?: number; flywheelW?: number; color?: number; faceYaw?: number } = {},
) {
  const [px, py, pz] = pivot;
  const ringR = opts.ringR ?? inches(5.5);
  const fr = opts.flywheelR ?? inches(1.5);
  const fw = opts.flywheelW ?? inches(4);
  const color = opts.color ?? 0x23272e;
  const turretG = kit.group(`${name}_turret`);
  kit.cyl(`${name}_ring`, [px, py, pz], ringR, inches(0.6), 'y', M.aluDark(), turretG, 32);
  kit.cyl(`${name}_gear`, [px, py - inches(0.4), pz], ringR * 1.04, inches(0.25), 'y', M.black(), turretG, 32);
  // Housing side plates (shooter points +X at turret 0).
  const hx = px + inches(1);
  const hy = py + inches(4);
  kit.plate(`${name}_side_l`, [hx, hy, pz - fw / 2 - inches(0.4)], [inches(7), inches(7), inches(0.25)], turretG, color);
  kit.plate(`${name}_side_r`, [hx, hy, pz + fw / 2 + inches(0.4)], [inches(7), inches(7), inches(0.25)], turretG, color);
  kit.motor(`${name}_fly_motor`, [hx - inches(1.5), hy + inches(0.5), pz + fw / 2 + inches(1.8)], 'z', turretG);
  const flyName = `${name}_flywheel`;
  const fly = kit.group(flyName, turretG);
  const flyC: [number, number, number] = [hx + inches(1.5), hy + inches(1.5), pz];
  kit.cyl(`${name}_fly_body`, flyC, fr, fw, 'z', M.grip(), fly, 24);
  kit.box(`${name}_fly_mark`, [flyC[0], flyC[1] + fr, flyC[2]], [inches(0.5), 0.004, fw], M.orange(), fly);
  // Hood: curved-ish plate over the flywheel.
  const hoodName = `${name}_hood`;
  const hood = kit.group(hoodName, turretG);
  const hoodPivot: [number, number, number] = [hx - inches(2), hy + inches(3.2), pz];
  kit.box(`${name}_hood_plate`, [hoodPivot[0] + inches(3.2), hoodPivot[1] + inches(0.4), pz], [inches(6.5), inches(0.25), fw + inches(0.6)], M.smoke(), hood);
  kit.box(`${name}_hood_rib_l`, [hoodPivot[0] + inches(3.2), hoodPivot[1], pz - fw / 2], [inches(6.5), inches(1), inches(0.25)], M.alu(), hood);
  kit.box(`${name}_hood_rib_r`, [hoodPivot[0] + inches(3.2), hoodPivot[1], pz + fw / 2], [inches(6.5), inches(1), inches(0.25)], M.alu(), hood);
  return {
    turretNode: turretG.name,
    flyNode: flyName,
    flyCenter: flyC,
    hoodNode: hoodName,
    hoodPivot,
    exit: [flyC[0] + fr + inches(1.5), flyC[1] + inches(1.2), pz] as [number, number, number],
  };
}
