import { Kit, M, mat } from './kit';
import { swerveBase, sidePlates, type BuiltinRobot, type JointIn, type PartIn } from './common';
import { inches } from '../../util/units';

/**
 * 1678 Citrus Circuits — Limestone (Milstein division winner).
 * Sources: citruscircuits.org/2026-robot, Chief Delphi "1678 2026 Robot: Limestone",
 * "1678 Citrus Circuits 2026 CAD and Robot Code Release".
 *  - 3.5in aluminum shooter drum wrapped in skateboard grip tape, full robot width
 *    (side plates on the inside of the drive rail, 25in apart)
 *  - Ball tunnel driven by two Kraken X60s with active backing of 1.25in dead-axle rollers;
 *    separate 2in feeder roller on its own X60
 *  - Roller floor: five 1in dead-axle rollers + three 2in flex-wheel rollers
 *  - 27 × 27in frame; LEVEL 1 climber
 *  - Capacity / BPS: community model of the released CAD (~70 FUEL, ~26 BPS)
 */
const L = inches(27);
const W = inches(27);
const H = inches(22);

export const r1678: BuiltinRobot = {
  def: {
    id: 'builtin-1678',
    name: 'Limestone',
    team: '1678',
    author: 'Citrus Circuits',
    color: '#ff8c1a',
    description:
      'Full-width 3.5in grip-tape drum fed by a powered ball tunnel and a roller floor. A high-volume fixed shooter with a LEVEL 1 climb.',
    highlights: ['Milstein division winner', 'Full-width grip-tape drum', 'Ball tunnel (2× X60) + roller floor', '~26 BPS', '~70 FUEL', 'LEVEL 1 climb'],
    sources: ['citruscircuits.org/2026-robot', 'Chief Delphi: 1678 2026 Robot: Limestone', 'Chief Delphi: 1678 Citrus Circuits 2026 CAD and Robot Code Release'],
    frame: { length: L, width: W, height: H, mass: 61, comHeight: 0.17 },
    drivetrain: { type: 'swerve', maxSpeed: 4.4, maxAccel: 11, maxOmega: 10, maxAlpha: 32 },
    intake: {
      zones: [{ center: [L / 2 + inches(7), inches(4), 0], size: [inches(8), inches(7), W - inches(1)] }],
      rate: 22,
      requiresDeploy: true,
    },
    storage: { capacity: 70, preload: 8, box: { center: [inches(2), inches(10), 0], size: [L - inches(5), inches(14), W - inches(3)] } },
    shooter: {
      barrels: [-1.5, -0.5, 0.5, 1.5].map((k) => ({ exit: [-L / 2 - inches(1.75), inches(18.5), k * inches(5.6)] as [number, number, number], pivot: [0, 0, 0] as [number, number, number] })),
      angle: 62,
      hoodMin: null,
      hoodMax: null,
      minSpeed: 4,
      maxSpeed: 16,
      rate: 26,
      spread: 1.5,
      turretMin: null,
      turretMax: null,
      yawOffset: 180,
      sotm: false,
    },
    climber: { maxLevel: 1, climbTime: 2.5, canAutoClimb: true },
    source: 'builtin:1678',
  },
  build() {
    const kit = new Kit('1678-limestone');
    const base = swerveBase(kit, L, W, { electronics: [inches(5), 0] });
    const y0 = base.railTop;
    const orange = 0xff8c1a;

    // Over-bumper intake with flex-wheel roller.
    const intake = kit.group('intake');
    for (const s of [-1, 1]) kit.plate(`intake_plate_${s}`, [L / 2 + inches(2.5), inches(6), s * (W / 2 - inches(0.4))], [inches(10), inches(5), inches(0.25)], intake, 0x2c6e2f);
    const ir = kit.roller('intake_roller', L / 2 + inches(7), inches(4), -W / 2 + inches(1), W / 2 - inches(1), inches(2), intake, orange);
    kit.motor('intake_motor', [L / 2 + inches(1), inches(9), W / 2 - inches(2.5)], 'z', intake);

    // Roller floor (5× 1in + 3× 2in flex).
    const floor = kit.group('roller_floor');
    for (let k = 0; k < 5; k++) kit.roller(`floor_small_${k}`, L / 2 - inches(6 + k * 2.4), y0 + inches(0.6), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.5), floor, 0xcccccc);
    for (let k = 0; k < 3; k++) kit.roller(`floor_flex_${k}`, -inches(2 + k * 3), y0 + inches(1), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(1), floor, orange);
    kit.polyHopper('hopper', -L / 2 + inches(7), L / 2 - inches(2), -W / 2 + inches(0.5), W / 2 - inches(0.5), y0, H - inches(1));

    // Ball tunnel to the drum: backing rollers + feeder roller.
    sidePlates(kit, 'tunnel_plate', -L / 2 + inches(4), inches(12), inches(12.5), [inches(9), inches(19)], 0x2c6e2f);
    for (let k = 0; k < 4; k++) kit.roller(`backing_${k}`, -L / 2 + inches(7.5), inches(7 + k * 2.7), -inches(12), inches(12), inches(0.62), undefined, 0x888888);
    const feeder = kit.roller('feeder', -L / 2 + inches(5), inches(15.5), -inches(12), inches(12), inches(1), undefined, orange);
    kit.motor('tunnel_motor_a', [-L / 2 + inches(5), inches(6), -W / 2 - inches(1.4)], 'z');
    kit.motor('tunnel_motor_b', [-L / 2 + inches(5), inches(6), W / 2 + inches(1.4)], 'z');
    const drum = kit.drum('drum', -L / 2 + inches(2.5), inches(17.5), inches(25), inches(1.75), undefined, M.grip());
    kit.box('drum_hood', [-L / 2 + inches(1.5), inches(20.2), 0], [inches(5), inches(0.25), inches(25)], mat(0x333333, { opacity: 0.85 }), undefined, [0, 0, 0.45]);

    // LEVEL 1 climber.
    const climb = kit.group('climber');
    kit.box('climb_tube', [L / 2 - inches(4), y0 + inches(9), 0], [inches(1.5), inches(16), inches(1.5)], M.alu(), climb);
    kit.box('climb_hook', [L / 2 - inches(2.5), y0 + inches(17), 0], [inches(3), inches(1), inches(1.5)], mat(0xffd000), climb);
    kit.limelight([0, H - inches(1.5), W / 2 - inches(3)]);
    kit.led('led', [-L / 2 + inches(8), y0 + inches(1), W / 2 - inches(0.3)], [inches(10), inches(0.6), 0.01], orange);

    const joints: JointIn[] = [
      ...base.joints,
      { id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: [L / 2 - inches(1), inches(10), 0], axis: [0, 0, 1], stowed: 70, active: 0, speed: 560 },
      { id: 'intake_roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: [L / 2 + inches(7), inches(4), 0], axis: [0, 0, 1], speed: 1800 },
      { id: 'feeder', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(5), inches(15.5), 0], axis: [0, 0, -1], speed: 1500 },
      { id: 'drum', type: 'spin', driver: 'shooter-wheel', pivot: [-L / 2 + inches(2.5), inches(17.5), 0], axis: [0, 0, -1], speed: 3400 },
      { id: 'climber', type: 'prismatic', driver: 'climber', pivot: [L / 2 - inches(4), y0, 0], axis: [0, 1, 0], active: inches(9), speed: 0.35 },
    ];
    const parts: PartIn[] = [
      ...base.parts,
      { node: 'intake', joint: 'intake' },
      { node: ir.name, joint: 'intake_roll' },
      { node: feeder.name, joint: 'feeder' },
      { node: drum.name, joint: 'drum' },
      { node: 'climber', joint: 'climber' },
    ];
    return { model: kit.root, joints, parts };
  },
};
