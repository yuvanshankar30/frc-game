import { Kit, M, mat } from './kit';
import { swerveBase, turret, type BuiltinRobot, type JointIn, type PartIn } from './common';
import { inches } from '../../util/units';

/**
 * 1690 Orbit — KEPLER.
 * Sources: Chief Delphi "Orbit 1690 2026 Robot Reveal – KEPLER" (team replies), "Orbit 1690 Double Swipe Auto".
 *  - 25 × 29in (the 29in side is the intake side)
 *  - Turret + shoot-on-the-move: keeps intaking continuously while shooting
 *  - Spindexer feeding a single channel; roller floor, vertical roller, guide funnel
 *  - Shooter wheel recovery ~50 ms at top speed (enough for 20 BPS); ~13 BPS observed in reveal
 *  - LEVEL 1 climb ("we tried L3 ... for now we stick to the L1 climb")
 *  - Capacity: community estimate ~50–55 FUEL
 */
const L = inches(25);
const W = inches(29);
const H = inches(21);
const TP: [number, number, number] = [-inches(6), inches(14.5), 0];

export const r1690: BuiltinRobot = {
  def: {
    id: 'builtin-1690',
    name: 'KEPLER',
    team: '1690',
    author: 'Orbit',
    color: '#7b4dff',
    description:
      'Compact gear-driven turret over a spindexer. Shoots while it drives and keeps intaking, so it cycles without stopping. The intake is fast and wide across the 29in side.',
    highlights: ['Turret + SOTM, intake while shooting', 'Spindexer single channel', '~13 BPS (reveal count)', '~52 FUEL', 'LEVEL 1 climb', 'Fits under the TRENCH'],
    sources: ['Chief Delphi: Orbit 1690 2026 Robot Reveal — "KEPLER"', 'Chief Delphi: Orbit 1690 Double Swipe Auto'],
    frame: { length: L, width: W, height: H, mass: 58, comHeight: 0.16 },
    drivetrain: { type: 'swerve', maxSpeed: 4.7, maxAccel: 12, maxOmega: 11, maxAlpha: 36 },
    intake: {
      zones: [{ center: [L / 2 + inches(6), inches(4), 0], size: [inches(8), inches(7), W - inches(1)] }],
      rate: 18,
      requiresDeploy: true,
    },
    storage: { capacity: 52, preload: 8, box: { center: [inches(1), inches(8.5), 0], size: [L - inches(4), inches(11), W - inches(3)] } },
    shooter: {
      barrels: [{ exit: [0, 0, 0] }],
      angle: 60,
      hoodMin: 44,
      hoodMax: 78,
      minSpeed: 4,
      maxSpeed: 15,
      rate: 13,
      spread: 0.9,
      turretMin: -200,
      turretMax: 200,
      turretSpeed: 720,
      yawOffset: 180,
      sotm: true,
    },
    climber: { maxLevel: 1, climbTime: 2.2, canAutoClimb: true },
    source: 'builtin:1690',
  },
  build() {
    const kit = new Kit('1690-kepler');
    const base = swerveBase(kit, L, W, { electronics: [inches(5), 0] });
    const y0 = base.railTop;
    const purple = 0x4b2bb8;

    // Fast four-bar-ish intake: pivoting arm with two rollers.
    const arm = kit.group('intake_arm');
    for (const s of [-1, 1]) kit.plate(`intake_plate_${s}`, [L / 2 + inches(1), y0 + inches(4.5), s * (W / 2 - inches(0.4))], [inches(10), inches(3), inches(0.25)], arm, purple);
    const r1 = kit.roller('intake_r1', L / 2 + inches(5.5), y0 + inches(4.5), -W / 2 + inches(1), W / 2 - inches(1), inches(1.4), arm, 0xff3355);
    const r2 = kit.roller('intake_r2', L / 2 + inches(1), y0 + inches(6), -W / 2 + inches(1), W / 2 - inches(1), inches(1), arm, 0xff3355);
    kit.motor('intake_motor', [L / 2 - inches(2), y0 + inches(5), W / 2 - inches(2.5)], 'z', arm);

    // Funnel + roller floor + spindexer.
    kit.polyHopper('hopper', -L / 2 + inches(1), L / 2 - inches(2), -W / 2 + inches(0.5), W / 2 - inches(0.5), y0, H - inches(4));
    for (const s of [-1, 1]) kit.box(`funnel_${s}`, [-inches(2), y0 + inches(5), s * inches(9)], [inches(10), inches(0.2), inches(6)], M.polycarb(), undefined, [s * 0.6, 0, 0]);
    const spindex = kit.group('spindexer');
    kit.cyl('spin_plate', [-inches(4), y0 + inches(0.8), 0], inches(8), inches(0.3), 'y', mat(0xeeeeee, { rough: 0.4 }), spindex, 36);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      kit.box(`spin_paddle_${k}`, [-inches(4) + Math.cos(a) * inches(4), y0 + inches(2), Math.sin(a) * inches(4)], [inches(8), inches(2.5), inches(0.25)], mat(0x9a7dff), spindex, [0, -a, 0]);
    }
    const vroller = kit.group('vertical_roller');
    kit.cyl('vroller_body', [-L / 2 + inches(5), y0 + inches(6), inches(5)], inches(1), inches(8), 'y', mat(0xff3355), vroller, 14);
    for (let k = 0; k < 3; k++) kit.roller(`floor_${k}`, inches(3 + k * 3), y0 + inches(1), -W / 2 + inches(2), W / 2 - inches(2), inches(0.6), undefined, 0xbbbbbb);

    // Compact gear-driven turret (faces backward at 0).
    kit.cyl('turret_post', [TP[0], (y0 + TP[1]) / 2, TP[2]], inches(2.2), TP[1] - y0, 'y', M.aluDark());
    const t = turret(kit, 't', TP, { ringR: inches(4.5), flywheelR: inches(2), flywheelW: inches(3.5), color: 0x2a1f5c });
    // Turret model faces +X; rotate it to face backward by mapping yawOffset 180 → stowed 180.

    // LEVEL 1 climber hooks (front).
    const climb = kit.group('climber');
    for (const s of [-1, 1]) {
      kit.box(`climb_arm_${s}`, [L / 2 - inches(6), y0 + inches(8), s * inches(6)], [inches(1), inches(14), inches(1)], M.alu(), climb);
      kit.box(`climb_hook_${s}`, [L / 2 - inches(5), y0 + inches(15), s * inches(6)], [inches(2.5), inches(0.8), inches(1)], mat(0xffd000), climb);
    }
    kit.limelight([L / 2 - inches(1.5), H - inches(5), -W / 2 + inches(3)]);
    kit.led('led', [0, y0 + inches(0.8), -W / 2 + inches(0.2)], [L - inches(6), inches(0.6), 0.01], 0x9a7dff);
    kit.led('led2', [0, y0 + inches(0.8), W / 2 - inches(0.2)], [L - inches(6), inches(0.6), 0.01], 0x9a7dff);

    const joints: JointIn[] = [
      ...base.joints,
      { id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: [L / 2 - inches(3), y0 + inches(5), 0], axis: [0, 0, 1], stowed: 35, active: -18, speed: 600 },
      { id: 'roll1', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: [L / 2 + inches(5.5), y0 + inches(4.5), 0], axis: [0, 0, 1], speed: 2000 },
      { id: 'roll2', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: [L / 2 + inches(1), y0 + inches(6), 0], axis: [0, 0, 1], speed: 2000 },
      { id: 'spindex', type: 'spin', driver: 'indexer', pivot: [-inches(4), y0, 0], axis: [0, 1, 0], speed: 720 },
      { id: 'vroll', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(5), 0, inches(5)], axis: [0, 1, 0], speed: 1500 },
      { id: 'turret', type: 'revolute', driver: 'turret', pivot: TP, axis: [0, 1, 0], stowed: 180, speed: 720 },
      { id: 'hood', type: 'revolute', driver: 'hood', parent: 'turret', pivot: t.hoodPivot, axis: [0, 0, 1], active: -24, speed: 220 },
      { id: 'fly', type: 'spin', driver: 'shooter-wheel', parent: 'turret', pivot: t.flyCenter, axis: [0, 0, -1], speed: 3600 },
      { id: 'climber', type: 'prismatic', driver: 'climber', pivot: [L / 2 - inches(6), y0, 0], axis: [0, 1, 0], active: inches(8), speed: 0.35 },
    ];
    const parts: PartIn[] = [
      ...base.parts,
      { node: 'intake_arm', joint: 'intake' },
      { node: r1.name, joint: 'roll1' },
      { node: r2.name, joint: 'roll2' },
      { node: 'spindexer', joint: 'spindex' },
      { node: 'vertical_roller', joint: 'vroll' },
      { node: t.turretNode, joint: 'turret' },
      { node: t.hoodNode, joint: 'hood' },
      { node: t.flyNode, joint: 'fly' },
      { node: 'climber', joint: 'climber' },
    ];
    // The turret model points +X at joint value 0; with stowed = 180 it rests facing the back.
    // Barrel exits are given at turret 0° relative to yawOffset, i.e. mirrored to the back.
    const exit: [number, number, number] = [TP[0] - (t.exit[0] - TP[0]), t.exit[1], TP[2]];
    const shooter = { ...r1690.def.shooter!, barrels: [{ exit, pivot: TP }] };
    return { model: kit.root, joints, parts, patch: { shooter } };
  },
};
