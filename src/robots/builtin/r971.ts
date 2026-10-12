import { Kit, M, mat } from './kit';
import { swerveBase, turret, type BuiltinRobot, type JointIn, type PartIn } from './common';
import { inches } from '../../util/units';

/**
 * 971 Spartan Robotics — Mixtape.
 * Sources: Chief Delphi "FRC 971 Spartan Robotics 2026 robot reveal – Mixtape", 971 CAD & code release 2026.
 *  - Two individually controlled turrets (two FUEL streams; code avoids mid-air collisions)
 *  - Indexer: two counter-rotating, individually controlled mecanum-wheel columns that
 *    spindex FUEL against a fixed back wall, plus a horizontal roller pushing down into the pan
 *  - Code solves hood angle, turret position and flywheel speed from robot pose AND velocity (SOTM)
 *  - 24.5 × 29.5in frame, LEVEL 1 climb (community model of the released CAD)
 *  - Capacity / BPS: estimates (~50 FUEL, ~20 BPS combined)
 */
const L = inches(24.5);
const W = inches(29.5);
const H = inches(21.75);
const TL: [number, number, number] = [-inches(5.5), inches(14), -inches(7.5)];
const TR: [number, number, number] = [-inches(5.5), inches(14), inches(7.5)];

export const r971: BuiltinRobot = {
  def: {
    id: 'builtin-971',
    name: 'Mixtape',
    team: '971',
    author: 'Spartan Robotics',
    color: '#3c78d8',
    description:
      'Twin-turret robot: two independently aimed shooters fed by a mecanum-column spindexer. Turret, hood and flywheel are solved from pose and velocity, so it fires two streams on the move.',
    highlights: ['Dual independent turrets', 'Mecanum-column spindexer', 'Shoot-on-the-move', '~20 BPS (two streams, est.)', 'LEVEL 1 climb', 'Fits under the TRENCH'],
    sources: ['Chief Delphi: FRC 971 2026 robot reveal — "Mixtape"', 'Chief Delphi: 971 Spartan Robotics CAD and Code Release 2026', 'github.com/frc971'],
    frame: { length: L, width: W, height: H, mass: 59, comHeight: 0.18 },
    drivetrain: { type: 'swerve', maxSpeed: 4.5, maxAccel: 10, maxOmega: 10, maxAlpha: 32 },
    intake: {
      zones: [{ center: [L / 2 + inches(5.5), inches(4), 0], size: [inches(7), inches(7), W - inches(2)] }],
      rate: 14,
      requiresDeploy: true,
    },
    storage: { capacity: 50, preload: 8, box: { center: [inches(1), inches(8.5), 0], size: [L - inches(4), inches(10), W - inches(3)] } },
    shooter: {
      barrels: [{ exit: [0, 0, 0] }, { exit: [0, 0, 0] }],
      angle: 60,
      hoodMin: 45,
      hoodMax: 80,
      minSpeed: 4,
      maxSpeed: 15,
      rate: 20,
      spread: 1.0,
      turretMin: -110,
      turretMax: 110,
      turretSpeed: 600,
      yawOffset: 0,
      sotm: true,
    },
    climber: { maxLevel: 1, climbTime: 2.5, canAutoClimb: true },
    source: 'builtin:971',
  },
  build() {
    const kit = new Kit('971-mixtape');
    const base = swerveBase(kit, L, W, { electronics: [-inches(6), 0] });
    const y0 = base.railTop;
    const accent = 0x1d3f7a;

    // Over-the-bumper intake (pivots at the front rail).
    const ipiv: [number, number, number] = [L / 2 - inches(1), y0 + inches(6), 0];
    const intake = kit.group('intake_arm');
    for (const s of [-1, 1])
      kit.plate(`intake_arm_${s}`, [L / 2 - inches(1), y0 + inches(6), s * (W / 2 - inches(1))], [inches(3), inches(12), inches(0.25)], intake, accent);
    const roller = kit.roller('intake_roller', L / 2 - inches(1), y0 + inches(12), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(1.3), intake, 0x30c050);
    kit.motor('intake_motor', [L / 2 - inches(1), y0 + inches(9), -W / 2 + inches(3)], 'z', intake);

    // Spindexing pan with two mecanum columns + top roller against a fixed back wall.
    kit.box('pan', [inches(1), y0 + inches(0.3), 0], [L - inches(6), inches(0.25), W - inches(3)], mat(0xd8d8d8, { rough: 0.5 }));
    kit.polyHopper('hopper', -L / 2 + inches(1), L / 2 - inches(3), -W / 2 + inches(1), W / 2 - inches(1), y0, H - inches(3));
    const colA = kit.group('mecanum_col_a');
    const colB = kit.group('mecanum_col_b');
    for (const [g, z] of [[colA, -inches(4)], [colB, inches(4)]] as const) {
      for (let k = 0; k < 3; k++) kit.cyl(`mec_${z > 0 ? 'b' : 'a'}_${k}`, [-L / 2 + inches(5), y0 + inches(2 + k * 3), z], inches(2), inches(1.6), 'y', mat(0x8899aa, { metal: 0.4 }), g, 16);
    }
    kit.box('back_wall', [-L / 2 + inches(2.5), y0 + inches(5), 0], [inches(0.25), inches(9), W - inches(4)], mat(0x2b2f36));
    const topRoller = kit.roller('top_roller', -L / 2 + inches(8), y0 + inches(10), -inches(9), inches(9), inches(1), undefined, 0xffcc00);

    // Twin turrets.
    const tl = turret(kit, 'tl', TL, { ringR: inches(4), flywheelR: inches(1.5), flywheelW: inches(3), color: accent });
    const tr = turret(kit, 'tr', TR, { ringR: inches(4), flywheelR: inches(1.5), flywheelW: inches(3), color: accent });
    for (const p of [TL, TR]) kit.cyl('turret_post', [p[0], (y0 + p[1]) / 2, p[2]], inches(1.8), p[1] - y0, 'y', M.aluDark());

    // LEVEL 1 climber: telescoping hook at the front of the robot (climbs facing the tower).
    const climb = kit.group('climber');
    kit.box('climber_tube', [L / 2 - inches(5), y0 + inches(9), 0], [inches(1.5), inches(16), inches(1.5)], M.alu(), climb);
    kit.box('climber_hook', [L / 2 - inches(3.5), y0 + inches(17), 0], [inches(3), inches(1), inches(1.5)], mat(0xffd000, { metal: 0.3 }), climb);
    kit.box('climber_base', [L / 2 - inches(5), y0 + inches(1), 0], [inches(3), inches(2), inches(3)], M.aluDark());
    kit.limelight([-L / 2 + inches(1.5), H - inches(4), 0], Math.PI);

    const joints: JointIn[] = [
      ...base.joints,
      { id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: 0, active: -125, speed: 560 },
      { id: 'intake_roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: [L / 2 - inches(1), y0 + inches(12), 0], axis: [0, 0, 1], speed: 1800 },
      { id: 'mec_a', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(5), 0, -inches(4)], axis: [0, 1, 0], speed: 900 },
      { id: 'mec_b', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(5), 0, inches(4)], axis: [0, -1, 0], speed: 900 },
      { id: 'top_roll', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(8), y0 + inches(10), 0], axis: [0, 0, 1], speed: 900 },
      { id: 'turret_l', type: 'revolute', driver: 'turret', pivot: TL, axis: [0, 1, 0], speed: 600 },
      { id: 'turret_r', type: 'revolute', driver: 'turret', pivot: TR, axis: [0, 1, 0], speed: 600 },
      { id: 'hood_l', type: 'revolute', driver: 'hood', parent: 'turret_l', pivot: tl.hoodPivot, axis: [0, 0, 1], active: -24, speed: 200 },
      { id: 'hood_r', type: 'revolute', driver: 'hood', parent: 'turret_r', pivot: tr.hoodPivot, axis: [0, 0, 1], active: -24, speed: 200 },
      { id: 'fly_l', type: 'spin', driver: 'shooter-wheel', parent: 'turret_l', pivot: tl.flyCenter, axis: [0, 0, -1], speed: 3600 },
      { id: 'fly_r', type: 'spin', driver: 'shooter-wheel', parent: 'turret_r', pivot: tr.flyCenter, axis: [0, 0, -1], speed: 3600 },
      { id: 'climber', type: 'prismatic', driver: 'climber', pivot: [L / 2 - inches(5), y0, 0], axis: [0, 1, 0], active: inches(9), speed: 0.4 },
    ];
    const parts: PartIn[] = [
      ...base.parts,
      { node: 'intake_arm', joint: 'intake' },
      { node: roller.name, joint: 'intake_roll' },
      { node: 'mecanum_col_a', joint: 'mec_a' },
      { node: 'mecanum_col_b', joint: 'mec_b' },
      { node: topRoller.name, joint: 'top_roll' },
      { node: tl.turretNode, joint: 'turret_l' },
      { node: tr.turretNode, joint: 'turret_r' },
      { node: tl.hoodNode, joint: 'hood_l' },
      { node: tr.hoodNode, joint: 'hood_r' },
      { node: tl.flyNode, joint: 'fly_l' },
      { node: tr.flyNode, joint: 'fly_r' },
      { node: 'climber', joint: 'climber' },
    ];
    const shooter = { ...r971.def.shooter!, barrels: [{ exit: tl.exit, pivot: TL }, { exit: tr.exit, pivot: TR }] };
    return { model: kit.root, joints, parts, patch: { shooter } };
  },
};
