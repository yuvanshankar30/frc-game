import { Kit, M, mat } from './kit';
import { swerveBase, sidePlates, type BuiltinRobot, type JointIn, type PartIn } from './common';
import { inches } from '../../util/units';

/**
 * 2910 Jack in the Bot — Re•Blitz (2026 World Championship Finalist, Newton captain).
 * Sources: frcteam2910.org "We Rebuilt our Robot. Then we went to Einstein.", Chief Delphi
 * "2910 Robot Reveal, 2026: Blitz", community REBUILT sim model of Re•Blitz.
 *  - Rebuilt in three weeks; inspired by 254 / 1678 / 6328 dumper architectures
 *  - MK5n R1 swerve, 7.03:1, 4× Kraken X60 → ~12.7 ft/s real (14.4 ft/s free)
 *  - 27.5 × 27in frame; intake reaches 7.8in past the bumper; hopper slides out with it
 *  - Four-wide drum shooter with adjustable hood, fixed to the chassis, firing out the back
 *  - 23–25 BPS typical with the intakes saturated, 30 BPS small volleys
 *  - No climber on Re•Blitz
 */
const L = inches(27.5);
const W = inches(27);
const H = inches(21.5);
const EXT = inches(7.8);

export const r2910: BuiltinRobot = {
  def: {
    id: 'builtin-2910',
    name: 'Re•Blitz',
    team: '2910',
    author: 'Jack in the Bot',
    color: '#2ca02c',
    description:
      'Rebuilt in three weeks and taken to Einstein. A full-width, four-lane drum dumper that empties its hopper out the back at 25+ BPS. Point the rear at the HUB and hold the trigger.',
    highlights: ['2026 Championship Finalist', '4-wide drum + adjustable hood', '25 BPS (30 BPS bursts)', 'Shoots out the back (turn to aim)', 'Sliding intake + hopper', 'No climb'],
    sources: ['frcteam2910.org — "We Rebuilt our Robot. Then we went to Einstein."', 'Chief Delphi: 2910 Robot Reveal, 2026: Blitz', 'github.com/TylerHandel/rebuilt-sim-2026 (robot model table)'],
    frame: { length: L, width: W, height: H, mass: 61, comHeight: 0.17 },
    drivetrain: { type: 'swerve', maxSpeed: 3.9, maxAccel: 11, maxOmega: 10, maxAlpha: 34 },
    intake: {
      zones: [{ center: [L / 2 + inches(3.25) + EXT / 2 + inches(0.5), inches(4), 0], size: [EXT + inches(2), inches(7), W - inches(2)] }],
      rate: 22,
      requiresDeploy: true,
    },
    storage: { capacity: 58, preload: 8, box: { center: [inches(3), inches(9), 0], size: [L + EXT - inches(6), inches(12), W - inches(3)] } },
    shooter: {
      barrels: [-1.5, -0.5, 0.5, 1.5].map((k) => ({ exit: [-L / 2 - inches(1.5), inches(17), k * inches(5.5)] as [number, number, number], pivot: [0, 0, 0] as [number, number, number] })),
      angle: 55,
      hoodMin: 38,
      hoodMax: 72,
      minSpeed: 4,
      maxSpeed: 15,
      rate: 25,
      spread: 1.6,
      turretMin: null,
      turretMax: null,
      yawOffset: 180,
      sotm: false,
    },
    climber: null,
    source: 'builtin:2910',
  },
  build() {
    const kit = new Kit('2910-reblitz');
    const base = swerveBase(kit, L, W, { electronics: [inches(2), 0] });
    const y0 = base.railTop;
    const green = 0x1f8a3a;

    // Sliding intake + hopper extension.
    const slide = kit.group('slide');
    for (const s of [-1, 1]) {
      kit.plate(`intake_side_${s}`, [L / 2 + inches(2), inches(5), s * (W / 2 - inches(0.5))], [inches(10), inches(7), inches(0.25)], slide, green);
      kit.box(`slide_rail_${s}`, [L / 2 - inches(5), y0 + inches(1.5), s * (W / 2 - inches(1.5))], [inches(14), inches(1), inches(1)], M.alu(), slide);
    }
    kit.roller('intake_front', L / 2 + inches(6), inches(3), -W / 2 + inches(1), W / 2 - inches(1), inches(2), slide, 0x30c050);
    kit.roller('intake_top', L / 2 + inches(3), inches(7.5), -W / 2 + inches(1), W / 2 - inches(1), inches(1.2), slide, 0x30c050);
    kit.motor('intake_motor', [L / 2 + inches(1), inches(9), W / 2 - inches(3)], 'z', slide);
    kit.netHopper('hopper_ext', L / 2 - inches(4), L / 2 + inches(1), -W / 2 + inches(0.5), W / 2 - inches(0.5), y0, H - inches(0.5), slide);

    // Main hopper + multilayer indexer floor.
    kit.polyHopper('hopper', -L / 2 + inches(6), L / 2 - inches(4), -W / 2 + inches(0.5), W / 2 - inches(0.5), y0, H - inches(1));
    const floor = kit.group('floor_rollers');
    for (let k = 0; k < 5; k++) kit.roller(`floor_${k}`, -L / 2 + inches(8 + k * 4), y0 + inches(1), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.9), floor, 0xdddddd);

    // Rear drum shooter (4 lanes) with adjustable hood, firing backward (-X).
    sidePlates(kit, 'shooter_plate', -L / 2 + inches(3), inches(13), W / 2 - inches(0.6), [inches(8), inches(16)], 0x202225);
    const drum = kit.drum('drum', -L / 2 + inches(2.5), inches(14.5), W - inches(2), inches(2));
    const feeder = kit.roller('feeder', -L / 2 + inches(6), inches(12), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(1), undefined, 0xff8800);
    kit.motor('drum_motor_a', [-L / 2 + inches(3), inches(9), -W / 2 - inches(1.4)], 'z');
    kit.motor('drum_motor_b', [-L / 2 + inches(3), inches(9), W / 2 + inches(1.4)], 'z');
    const hood = kit.group('hood');
    kit.box('hood_plate', [-L / 2 - inches(0.5), inches(18), 0], [inches(6), inches(0.25), W - inches(2)], M.smoke(), hood, [0, 0, 0.35]);
    kit.box('hood_rib', [-L / 2 - inches(0.5), inches(18.6), 0], [inches(6), inches(0.6), inches(0.5)], M.alu(), hood, [0, 0, 0.35]);
    kit.limelight([0, H - inches(1.5), 0], Math.PI);
    kit.led('led', [L / 2 - inches(4), H - inches(1), 0], [0.01, inches(0.8), W - inches(4)], 0x22ff44);
    kit.box('jack_logo', [-L / 2 + inches(7), H - inches(5), -W / 2 + inches(0.3)], [inches(6), inches(3), 0.002], mat(0x111111), undefined);

    const joints: JointIn[] = [
      ...base.joints,
      { id: 'slide', type: 'prismatic', driver: 'intake-deploy', pivot: [0, 0, 0], axis: [1, 0, 0], active: EXT, speed: 1.8 },
      { id: 'roll_front', type: 'spin', driver: 'intake-roller', parent: 'slide', pivot: [L / 2 + inches(6), inches(3), 0], axis: [0, 0, 1], speed: 1600 },
      { id: 'roll_top', type: 'spin', driver: 'intake-roller', parent: 'slide', pivot: [L / 2 + inches(3), inches(7.5), 0], axis: [0, 0, -1], speed: 1600 },
      { id: 'feeder', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(6), inches(12), 0], axis: [0, 0, -1], speed: 1500 },
      { id: 'drum', type: 'spin', driver: 'shooter-wheel', pivot: [-L / 2 + inches(2.5), inches(14.5), 0], axis: [0, 0, -1], speed: 3200 },
      { id: 'hood', type: 'revolute', driver: 'hood', pivot: [-L / 2 + inches(2.5), inches(17.5), 0], axis: [0, 0, 1], stowed: 0, active: 28, speed: 180 },
    ];
    const parts: PartIn[] = [
      ...base.parts,
      { node: 'slide', joint: 'slide' },
      { node: 'intake_front', joint: 'roll_front' },
      { node: 'intake_top', joint: 'roll_top' },
      { node: feeder.name, joint: 'feeder' },
      { node: drum.name, joint: 'drum' },
      { node: 'hood', joint: 'hood' },
    ];
    return { model: kit.root, joints, parts };
  },
};
