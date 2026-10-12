import { Kit, M, mat } from './kit';
import { swerveBase, sidePlates, pivotIntake, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';

/**
 * 254 The Cheesy Poofs — Overload (65-6 official record, Curie division winner).
 * Sources: team254.com/first/2026 (Overload, 115 lb) + reveal photo, Chief Delphi "Team 254 Presents: Overload"
 * (team posts by Torrance / rshah / thaneye).
 *  - New drivebase with SDS MK5n R1 modules and a solid bellypan
 *  - Front intake with top roller and kicker ramp; later made deploy/retract, with the hopper floor cam-linked to it
 *  - Powered floor of rubber-backed timing belts feeding rollers under the hopper
 *  - Enclosed smoked polycarbonate "blue box" hopper (later a hopper net instead of a solid roof)
 *  - Full-width drum shooter out the back with adjustable hood; chose this over a Dye-rotor turret
 *  - Side cameras; no climber seen
 *  - Frame size, capacity and BPS: estimates
 */
const L = inches(27);
const W = inches(27);
const H = inches(21.5);
const BLUE = 0x1f5bd8;

export const r254: BuiltinRobot = {
  def: {
    id: 'builtin-254',
    name: 'Overload',
    team: '254',
    author: 'The Cheesy Poofs',
    color: '#1f5bd8',
    description:
      'The "blue box": an enclosed smoked hopper on a timing-belt floor feeds a full-width drum with an adjustable hood out the back. The front intake has a kicker ramp, and pulling it in squeezes the hopper to push FUEL into the drum.',
    highlights: ['65-6 official record', 'MK5n R1 swerve, 115 lb', 'Full-width drum + hood (rear)', 'Timing-belt powered floor', '~24 BPS (est.)', 'No climber'],
    sources: ['team254.com/first/2026: Overload (photo, 115 lb)', 'Chief Delphi: Team 254 Presents: Overload'],
    frame: { length: L, width: W, height: H, mass: 59, comHeight: 0.16 },
    drivetrain: { type: 'swerve', maxSpeed: 4.3, maxAccel: 11, maxOmega: 10.5, maxAlpha: 34 },
    intake: {
      zones: [{ center: [L / 2 + inches(8), inches(3.5), 0], size: [inches(7), inches(7), W - inches(1)] }],
      rate: 20,
      requiresDeploy: true,
    },
    storage: {
      capacity: 52,
      preload: 8,
      box: { center: [inches(2.5), inches(11.3), 0], size: [inches(21), inches(17.6), W - inches(1.8)] },
    },
    shooter: {
      barrels: [-1.5, -0.5, 0.5, 1.5].map((k) => ({ exit: [-L / 2 - inches(2), inches(19), k * inches(5.6)] as [number, number, number], pivot: [0, 0, 0] as [number, number, number] })),
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
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [inches(4), 0] });
    const y0 = base.railTop;

    // The blue box: dark smoked enclosed hopper with sponsor decals and a net roof window.
    kit.polyBox('blue_box', -L / 2 + inches(7.5), L / 2 - inches(0.5), -W / 2 + inches(0.3), W / 2 - inches(0.3), y0, H - inches(0.3), {
      smoked: 'dark',
      open: ['front', 'back'],
      decals: ['THE CHEESY POOFS', 'NASA AMES · 254'],
      decalColor: '#e8eef8',
      edge: M.anodBlack(),
    });
    kit.box('roof_net', [inches(2.5), H, 0], [inches(14), 0.003, W - inches(4)], M.net());

    // Timing-belt powered floor.
    const belts = kit.group('belt_floor');
    for (let k = 0; k < 6; k++) kit.box(`belt_${k}`, [inches(2.5), y0 + inches(0.55), -W / 2 + inches(3) + k * inches(4.2)], [L - inches(9), inches(0.3), inches(1.4)], M.belt(), belts);
    for (const x of [L / 2 - inches(1.5), -L / 2 + inches(7.5)]) kit.cyl('belt_roller', [x, y0 + inches(0.55), 0], inches(0.5), W - inches(2), 'z', M.steel(), undefined, 12);
    kit.motor('belt_motor', [-L / 2 + inches(8), y0 - inches(1.3), W / 2 - inches(3)], 'y', undefined, true);

    // Rear shooter: big pocketed side plates, full-width drum, adjustable hood, feeder.
    sidePlates(kit, 'shooter_plate', -L / 2 + inches(3.5), inches(11.5), W / 2 - inches(0.4), [inches(10), inches(20)], 0x15171b);
    const drum = kit.drum('drum', -L / 2 + inches(2.6), inches(16.5), W - inches(1.6), inches(2.3));
    const feed = kit.tubeRoller('feed', -L / 2 + inches(6.6), inches(12.5), -W / 2 + inches(1.4), W / 2 - inches(1.4), inches(1), 0xf2b705);
    for (const s of [-1, 1]) {
      kit.motor(`drum_motor${s}`, [-L / 2 + inches(5), inches(7), s * (W / 2 + inches(1.3))], 'z');
      kit.pulley(`drum_gear${s}`, [-L / 2 + inches(2.6), inches(16.5), s * (W / 2 + inches(0.2))], inches(2.6), { color: 0x2a2d33, spokes: 6 });
      kit.pulley(`motor_gear${s}`, [-L / 2 + inches(5), inches(7), s * (W / 2 + inches(0.2))], inches(1.2), { color: 0x2a2d33 });
      kit.belt(`drum_belt${s}`, [-L / 2 + inches(5), inches(7)], [-L / 2 + inches(2.6), inches(16.5)], s * (W / 2 + inches(0.45)));
    }
    const hood = kit.group('hood');
    const hp: [number, number, number] = [-L / 2 + inches(5.5), inches(20), 0];
    for (let k = 0; k < 5; k++) kit.box(`hood_slat${k}`, [hp[0] - inches(1.1) - k * inches(1.1), hp[1] - k * inches(0.18), 0], [inches(1.2), inches(0.25), W - inches(1.8)], M.smokeDark(), hood, [0, 0, 0.13 * k]);
    for (const s of [-1, 1]) kit.sectorPlate(`hood_sector${s}`, [hp[0], hp[1], s * (W / 2 - inches(0.9))], inches(5), Math.PI * 0.72, Math.PI * 1.12, { parent: hood, color: 0x2a2d33, teeth: 18 });

    // Front intake: blue tube arms angled down to a low roller + kicker ramp.
    const ipiv: [number, number, number] = [L / 2 - inches(1), y0 + inches(7.5), 0];
    const intake = pivotIntake(kit, 'intake', ipiv, inches(11), W, { color: 0x15171b, wheel: 0x3a7bff, armAngle: 0.55, tube: true });
    for (const s of [-1, 1]) {
      const t = kit.box(`blue_tube${s}`, [L / 2 + inches(3.5), y0 + inches(4.8), s * (W / 2 - inches(2.6))], [inches(11), inches(1), inches(1)], mat(BLUE, { metal: 0.5, rough: 0.35 }), intake.group);
      t.rotation.z = -0.55;
    }
    kit.box('kicker_ramp', [L / 2 + inches(2.5), inches(4.2), 0], [inches(6), inches(0.2), W - inches(2)], M.steel(), intake.group, [0, 0, 0.4]);
    for (const s of [-1, 1]) kit.camera(`side_cam${s}`, [inches(1), H - inches(5), s * (W / 2 + inches(0.2))], s > 0 ? -Math.PI / 2 : Math.PI / 2);
    kit.led('led', [L / 2 - inches(0.8), H - inches(2), 0], [0.006, inches(0.6), W - inches(4)], 0xf2b705);

    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: 95, active: 0, speed: 560 }, intake.group);
    rig.joint({ id: 'intake_roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.rollerCenter, axis: [0, 0, 1], speed: 2000 }, intake.roller);
    rig.joint({ id: 'feed', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(6.6), inches(12.5), 0], axis: [0, 0, -1], speed: 1500 }, feed);
    rig.joint({ id: 'drum', type: 'spin', driver: 'shooter-wheel', pivot: [-L / 2 + inches(2.6), inches(16.5), 0], axis: [0, 0, -1], speed: 3200 }, drum);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', pivot: hp, axis: [0, 0, 1], active: -30, speed: 180 }, hood);
    return { model: kit.root, joints: rig.joints, parts: rig.parts };
  },
};
