import { Kit, M, mat } from './kit';
import { swerveBase, sidePlates, type BuiltinRobot, type JointIn, type PartIn } from './common';
import { inches } from '../../util/units';

/**
 * 254 The Cheesy Poofs — Overload (65-6 official record, Curie division winner).
 * Sources: team254.com/first/2026 ("Overload", 115 lbs), Chief Delphi "Team 254 Presents: Overload".
 *  - New drivebase with SDS MK5n R1 swerve modules and a solid bellypan
 *  - Front intake with top roller and kicker ramp; later made deploy/retract, hopper floor cam-linked to it
 *  - Powered floor of rubber-backed timing belts feeding rollers under the hopper
 *  - Polycarbonate hopper walls, later a hopper net instead of a solid roof
 *  - Full-width drum shooter out the back with adjustable hood (chose this over a Dye-rotor turret)
 *  - No climber seen
 *  - Frame size, capacity and BPS: estimates
 */
const L = inches(27);
const W = inches(27);
const H = inches(21.5);

export const r254: BuiltinRobot = {
  def: {
    id: 'builtin-254',
    name: 'Overload',
    team: '254',
    author: 'The Cheesy Poofs',
    color: '#f2b705',
    description:
      'Belt-floor dumper with a full-width drum and adjustable hood out the back. The front intake has a kicker ramp, and pulling it in squeezes the hopper to push FUEL into the drum.',
    highlights: ['65-6 official record', 'MK5n R1 swerve, 115 lb', 'Full-width drum + hood (rear)', 'Powered timing-belt floor', '~24 BPS (est.)', 'No climb'],
    sources: ['team254.com/first/2026 — Overload', 'Chief Delphi: Team 254 Presents: Overload'],
    frame: { length: L, width: W, height: H, mass: 59, comHeight: 0.16 },
    drivetrain: { type: 'swerve', maxSpeed: 4.3, maxAccel: 11, maxOmega: 10.5, maxAlpha: 34 },
    intake: {
      zones: [{ center: [L / 2 + inches(7), inches(4), 0], size: [inches(8), inches(7), W - inches(1)] }],
      rate: 20,
      requiresDeploy: true,
    },
    storage: { capacity: 60, preload: 8, box: { center: [inches(0.5), inches(9.5), 0], size: [L - inches(7), inches(13), W - inches(3)] } },
    shooter: {
      barrels: [-1.5, -0.5, 0.5, 1.5].map((k) => ({ exit: [-L / 2 - inches(1.5), inches(18), k * inches(5.6)] as [number, number, number], pivot: [0, 0, 0] as [number, number, number] })),
      angle: 55,
      hoodMin: 36,
      hoodMax: 74,
      minSpeed: 4,
      maxSpeed: 15,
      rate: 24,
      spread: 1.3,
      turretMin: null,
      turretMax: null,
      yawOffset: 180,
      sotm: false,
    },
    climber: null,
    source: 'builtin:254',
  },
  build() {
    const kit = new Kit('254-overload');
    const base = swerveBase(kit, L, W, { electronics: [inches(4), 0] });
    const y0 = base.railTop;
    const gold = 0xf2b705;

    // Front intake: pivoting with a top roller and kicker ramp.
    const intake = kit.group('intake');
    for (const s of [-1, 1]) kit.plate(`intake_plate_${s}`, [L / 2 + inches(3), inches(6), s * (W / 2 - inches(0.4))], [inches(10), inches(6), inches(0.25)], intake, 0x1a1a1a);
    const top = kit.roller('intake_top', L / 2 + inches(6.5), inches(7.5), -W / 2 + inches(1), W / 2 - inches(1), inches(1.5), intake, 0x2a62ff);
    kit.box('kicker_ramp', [L / 2 + inches(3), inches(3), 0], [inches(7), inches(0.25), W - inches(2)], mat(0xbfc5cc, { metal: 0.6 }), intake, [0, 0, 0.35]);
    kit.motor('intake_motor', [L / 2 + inches(1), inches(9.5), -W / 2 + inches(2.5)], 'z', intake);

    // Powered belt floor + polycarb hopper + net roof.
    const belts = kit.group('belt_floor');
    for (let k = 0; k < 6; k++) kit.box(`belt_${k}`, [0, y0 + inches(0.6), -W / 2 + inches(3) + k * inches(4.2)], [L - inches(9), inches(0.3), inches(1.5)], M.rubber(), belts);
    kit.polyHopper('hopper', -L / 2 + inches(5), L / 2 - inches(1.5), -W / 2 + inches(0.5), W / 2 - inches(0.5), y0, H - inches(1));
    kit.box('hopper_net', [inches(1), H - inches(1), 0], [L - inches(7), 0.004, W - inches(1)], M.net());

    // Rear drum shooter with adjustable hood (full width).
    sidePlates(kit, 'shooter_plate', -L / 2 + inches(3), inches(13.5), W / 2 - inches(0.5), [inches(8), inches(17)], 0x1a1a1a);
    const drum = kit.drum('drum', -L / 2 + inches(2.5), inches(15), W - inches(1.5), inches(2.25));
    const feed = kit.roller('feed', -L / 2 + inches(6.2), inches(11.5), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(1), undefined, gold);
    kit.motor('drum_motor_a', [-L / 2 + inches(3), inches(9), -W / 2 - inches(1.4)], 'z');
    kit.motor('drum_motor_b', [-L / 2 + inches(3), inches(9), W / 2 + inches(1.4)], 'z');
    const hood = kit.group('hood');
    kit.box('hood_plate', [-L / 2 - inches(0.8), inches(19), 0], [inches(6.5), inches(0.25), W - inches(1.5)], mat(0x333333, { opacity: 0.85 }), hood, [0, 0, 0.3]);
    // Side cameras.
    for (const s of [-1, 1]) kit.box(`cam_${s}`, [inches(2), H - inches(6), s * (W / 2 - inches(0.2))], [inches(1.5), inches(1), inches(0.6)], M.black());
    kit.led('led', [L / 2 - inches(1.5), H - inches(2), 0], [0.01, inches(0.6), W - inches(4)], gold);

    const joints: JointIn[] = [
      ...base.joints,
      { id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: [L / 2 - inches(1), inches(9), 0], axis: [0, 0, 1], stowed: 60, active: 0, speed: 540 },
      { id: 'intake_top', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: [L / 2 + inches(6.5), inches(7.5), 0], axis: [0, 0, 1], speed: 1800 },
      { id: 'feed', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(6.2), inches(11.5), 0], axis: [0, 0, -1], speed: 1500 },
      { id: 'drum', type: 'spin', driver: 'shooter-wheel', pivot: [-L / 2 + inches(2.5), inches(15), 0], axis: [0, 0, -1], speed: 3200 },
      { id: 'hood', type: 'revolute', driver: 'hood', pivot: [-L / 2 + inches(2.5), inches(18.5), 0], axis: [0, 0, 1], active: 26, speed: 180 },
    ];
    const parts: PartIn[] = [
      ...base.parts,
      { node: 'intake', joint: 'intake' },
      { node: top.name, joint: 'intake_top' },
      { node: feed.name, joint: 'feed' },
      { node: drum.name, joint: 'drum' },
      { node: 'hood', joint: 'hood' },
    ];
    return { model: kit.root, joints, parts };
  },
};
