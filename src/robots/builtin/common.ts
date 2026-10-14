import * as THREE from 'three';
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

/**
 * Over-the-bumper slapdown ground intake, built from real geometry: a pivot inside the frame and a
 * roller that lands just past the bumper with its contact patch at carpet height. Arm length and
 * angle are derived. Modeled deployed (joint value 0); a revolute joint about +Z stows it upward.
 */
export function groundIntake(
  kit: Kit,
  name: string,
  opts: {
    pivot: [number, number]; // x, y of the pivot (robot frame)
    rollerX: number; // x of the roller axis when deployed
    rollerR?: number; // main roller radius
    width: number; // overall width between arm outer faces
    roller?: 'compliant' | 'silicone';
    wheel?: number; // compliant wheel / silicone color
    armColor?: number;
    armStyle?: 'plate' | 'tube';
    tubeColor?: number;
    kicker?: boolean; // secondary roller behind/above the main roller
    deflector?: boolean;
    /** Front bumper face x and top y: arms dog-leg over the bumper instead of passing through it. */
    bumper?: { face: number; top: number };
  },
) {
  const g = kit.group(name);
  const [px, py] = opts.pivot;
  const r = opts.rollerR ?? inches(1.5);
  const rx = opts.rollerX;
  const ry = r + inches(0.35); // a hair off the carpet
  const W = opts.width;
  const armZ = W / 2 - inches(0.5);
  const armColor = opts.armColor ?? 0x24272d;
  // Over-the-bumper dog-leg: pivot → knee just above/past the front bumper's top edge → roller at the carpet.
  const knee: [number, number] | null = opts.bumper ? [opts.bumper.face + inches(0.7), Math.max(opts.bumper.top + inches(1.4), ry + inches(2))] : null;
  const pts: [number, number][] = knee ? [[px, py], knee, [rx, ry]] : [[px, py], [rx, ry]];
  const segs: { group: THREE.Group; len: number; ang: number }[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k];
    const [x1, y1] = pts[k + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ang = Math.atan2(y0 - y1, x1 - x0); // below horizontal
    const seg = new THREE.Group();
    seg.position.set(x0, y0, 0);
    seg.rotation.z = -ang;
    seg.name = `${name}_seg${k}`;
    g.add(seg);
    segs.push({ group: seg, len, ang });
    for (const s of [-1, 1]) {
      if (opts.armStyle === 'tube') {
        kit.box(`${name}_armtube${k}_${s}`, [len / 2, 0, s * armZ], [len + inches(1), inches(1), inches(1)], mat(opts.tubeColor ?? 0x1f5bd8, { metal: 0.5, rough: 0.35 }), seg);
        if (k === segs.length - 1 && k === pts.length - 2) kit.box(`${name}_armplate${s}`, [len - inches(1.5), 0, s * (armZ + inches(0.6))], [inches(4), inches(2.6), inches(0.19)], mat(armColor, { metal: 0.4 }), seg);
      } else {
        kit.taperArm(`${name}_arm${k}_${s}`, len, k === 0 ? inches(3.2) : inches(2.6), k === pts.length - 2 ? inches(2.2) : inches(2.6), [0, 0, s * armZ], armColor, seg);
      }
      // Hub at the start of each segment (pivot bearing / knee joint plate).
      kit.cyl(`${name}_hub${k}_${s}`, [0, 0, s * armZ], k === 0 ? inches(1) : inches(1.3), inches(0.6), 'z', k === 0 ? M.aluDark() : mat(armColor, { metal: 0.4 }), seg, 16);
      kit.belt(`${name}_belt${k}_${s}`, [k === 0 ? inches(2) : 0, 0], [len, 0], s * (armZ + inches(0.35)), seg);
    }
  }
  const first = segs[0];
  const last = segs[segs.length - 1];
  const ang = last.ang;
  kit.box(`${name}_crossbar`, [first.len * 0.45, inches(1.2), 0], [inches(1), inches(2), W - inches(1)], M.tube(), first.group);
  if (opts.deflector !== false) kit.box(`${name}_deflector`, [last.len * 0.55, inches(1.6), 0], [last.len * 0.6, inches(0.1), W - inches(1.6)], M.polycarb(), last.group);
  // Main roller at the arm tip (built in robot space so it can carry its own spin joint).
  const rollerName = `${name}_roller`;
  const roller =
    opts.roller === 'silicone'
      ? kit.tubeRoller(rollerName, rx, ry, -W / 2 + inches(1), W / 2 - inches(1), r, opts.wheel ?? 0x2a62ff, g)
      : kit.roller(rollerName, rx, ry, -W / 2 + inches(1), W / 2 - inches(1), r, g, opts.wheel ?? 0x2a62ff, inches(1.6));
  let kickerNode: THREE.Object3D | null = null;
  let kickerCenter: [number, number, number] | null = null;
  if (opts.kicker) {
    const kx = rx - Math.cos(ang) * inches(3.2);
    const ky = ry + Math.sin(ang) * inches(3.2) + inches(1.6);
    kickerNode = kit.tubeRoller(`${name}_kicker`, kx, ky, -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.625), 0x2a2d33, g);
    kickerCenter = [kx, ky, 0];
  }
  // Roller motor on top of the arm near the pivot, clear of the bumper below it when deployed.
  const along = inches(2.5);
  const up = inches(1.7);
  kit.motor(`${name}_motor`, [px + Math.cos(first.ang) * along + Math.sin(first.ang) * up, py - Math.sin(first.ang) * along + Math.cos(first.ang) * up, armZ - inches(1.6)], 'z', g);
  return { group: g, roller, rollerCenter: [rx, ry, 0] as [number, number, number], kickerNode, kickerCenter, deployAngleDeg: (first.ang * 180) / Math.PI };
}

/** Pivot gearbox on the frame for an intake (visual, stays on the chassis). */
export function intakeGearbox(kit: Kit, name: string, pivot: [number, number], z: number) {
  kit.box(`${name}_gearbox`, [pivot[0] - inches(0.5), pivot[1], z], [inches(2.2), inches(2.6), inches(1.2)], M.anodBlack());
  kit.motor(`${name}_pivot_motor`, [pivot[0] - inches(1.6), pivot[1] - inches(0.4), z], 'x', undefined, true);
}
