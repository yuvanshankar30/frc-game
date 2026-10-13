import { Kit, M, mat } from './kit';
import { swerveBase, groundIntake, intakeGearbox, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';

/**
 * 254 The Cheesy Poofs — Overload (65-6 official record, Curie division winner).
 * Sources: team254.com/first/2026 (Overload, 115 lb, reveal photo), Chief Delphi "Team 254 Presents: Overload"
 * (team posts by Torrance / rshah / thaneye). 254 did not release CAD for 2026.
 *  - New drivebase with SDS MK5n R1 modules and a solid bellypan; blue tube bracing at the front corners
 *  - Front intake with top roller and kicker ramp; later made deploy/retract, hopper floor cam-linked to it
 *  - Powered floor of rubber-backed timing belts feeding rollers under the hopper
 *  - Enclosed smoked polycarbonate "blue box" hopper (sponsor decals), later a hopper net instead of a solid roof
 *  - Full-width drum shooter out the back with adjustable hood and stacked hood rollers (chose this over a Dye-rotor turret)
 *  - Side cameras; no climber
 *  - Frame size, capacity and BPS are estimates
 */
const L = inches(27);
const W = inches(27);
const H = inches(21.5);
const BLUE = 0x1f5bd8;
const BLK = 0x16181c;
const SPONSORS = ['NASA Ames', 'Greg & Gloria Shean', 'WCP', 'Fabworks', 'SDS', 'Vivid-Hosting', 'AMEX Plating', 'J&J MedTech', 'Apple', 'NVIDIA', 'Haas', 'Boeing', 'Google', 'LinkedIn', 'Intuitive', 'PTC', 'Disney', 'SolidWorks', 'Bellarmine'];

export const r254: BuiltinRobot = {
  def: {
    id: 'builtin-254',
    name: 'Overload',
    team: '254',
    author: 'The Cheesy Poofs',
    color: '#1f5bd8',
    description:
      'The "blue box": an enclosed smoked hopper on a timing-belt floor feeds a full-width drum with a hood and stacked hood rollers out the back. The front intake has a top roller and kicker ramp, and retracting it squeezes the hopper to push FUEL into the drum.',
    highlights: ['65-6 official record', 'MK5n R1 swerve, 115 lb', 'Full-width drum + hood (rear)', 'Timing-belt powered floor', '~24 BPS (est.)', 'No climber'],
    sources: ['team254.com/first/2026: Overload (photo, 115 lb, sponsors)', 'Chief Delphi: Team 254 Presents: Overload'],
    frame: { length: L, width: W, height: H, mass: 59, comHeight: 0.16, bumperThickness: inches(3.5), bumperHeight: inches(5) },
    drivetrain: { type: 'swerve', maxSpeed: 4.3, maxAccel: 11, maxOmega: 10.5, maxAlpha: 34 },
    intake: {
      zones: [{ center: [L / 2 + inches(8), inches(3.5), 0], size: [inches(7), inches(7), W - inches(1)] }],
      rate: 20,
      requiresDeploy: true,
    },
    storage: {
      capacity: 50,
      preload: 8,
      box: { center: [inches(2.5), inches(11.3), 0], size: [inches(21), inches(17.6), W - inches(1.8)] },
      net: { stretch: inches(1.5), color: '#0d0e10' },
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
      sotm: true,
    },
    climber: null,
    source: 'builtin:254',
  },
  build() {
    const kit = new Kit('254-overload');
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [inches(4), 0] });
    const y0 = base.railTop;
    const blk = mat(BLK, { metal: 0.45, rough: 0.45 });

    // ---------- the blue box: smoked enclosed hopper, black edge frame, sponsor decals, net window on top
    const bx0 = -L / 2 + inches(7.5);
    const bx1 = L / 2 - inches(0.5);
    kit.polyBox('blue_box', bx0, bx1, -W / 2 + inches(0.3), W / 2 - inches(0.3), y0, H - inches(0.3), { smoked: 'dark', open: ['back', 'top'], edge: M.anodBlack() });
    for (const s of [-1, 1] as const) kit.sponsors(`sponsors_${s}`, [(bx0 + bx1) / 2, y0 + inches(8.5), s * (W / 2 - inches(0.2))], bx1 - bx0 - inches(1.5), inches(12), SPONSORS, 'xy', s, undefined, '#d6dde8');
    kit.sponsors('sponsors_front', [bx1 + inches(0.01), y0 + inches(10), 0], W - inches(3), inches(8), ['THE CHEESY POOFS', 'NASA', 'Bellarmine College Prep'], 'zy', 1, undefined, '#d6dde8');
    kit.box('roof_frame', [(bx0 + bx1) / 2, H - inches(0.3), 0], [bx1 - bx0, inches(0.4), inches(0.6)], M.anodBlack());

    // ---------- timing-belt powered floor + rollers under the hopper
    const belts = kit.group('belt_floor');
    for (let k = 0; k < 6; k++) kit.box(`belt_${k}`, [inches(2.5), y0 + inches(0.55), -W / 2 + inches(3) + k * inches(4.2)], [L - inches(9), inches(0.3), inches(1.4)], M.belt(), belts);
    for (const x of [bx1 - inches(1), bx0 + inches(0.5)]) kit.cyl('belt_roller', [x, y0 + inches(0.55), 0], inches(0.5), W - inches(2), 'z', M.steel(), undefined, 12);
    kit.motor('belt_motor', [bx0 + inches(0.5), y0 - inches(1.3), W / 2 - inches(3)], 'y', undefined, true);

    // ---------- rear shooter: stacked pocketed plates, full-width drum, hood + stacked hood rollers, gears + belts
    const SX = -L / 2 + inches(3.6);
    for (const s of [-1, 1]) {
      kit.latticePlate(`shooter_plate${s}`, [SX, inches(11.5), s * (W / 2 - inches(0.4))], inches(10), inches(20), { color: BLK, cell: inches(1.7), rib: inches(0.22) });
      kit.latticePlate(`shooter_plate_out${s}`, [SX - inches(0.5), inches(12.5), s * (W / 2 + inches(0.3))], inches(8), inches(17), { color: BLK, cell: inches(1.9), rib: inches(0.22) });
    }
    const drumC: [number, number, number] = [-L / 2 + inches(2.6), inches(16.5), 0];
    const drum = kit.drum('drum', drumC[0], drumC[1], W - inches(1.6), inches(2.3));
    const feed = kit.tubeRoller('feed', -L / 2 + inches(6.6), inches(12.5), -W / 2 + inches(1.4), W / 2 - inches(1.4), inches(1), 0x2a2d33);
    for (const s of [-1, 1]) {
      kit.motor(`drum_motor${s}`, [-L / 2 + inches(5), inches(7), s * (W / 2 + inches(1.6))], 'z');
      kit.pulley(`drum_gear${s}`, [drumC[0], drumC[1], s * (W / 2 + inches(0.75))], inches(2.6), { color: 0x2a2d33, spokes: 6 });
      kit.pulley(`motor_gear${s}`, [-L / 2 + inches(5), inches(7), s * (W / 2 + inches(0.75))], inches(1.2), { color: 0x2a2d33 });
      kit.belt(`drum_belt${s}`, [-L / 2 + inches(5), inches(7)], [drumC[0], drumC[1]], s * (W / 2 + inches(0.95)));
    }
    const hood = kit.group('hood');
    const hp: [number, number, number] = [-L / 2 + inches(5.5), inches(20.2), 0];
    for (let k = 0; k < 4; k++) kit.tubeRoller(`hood_roller${k}`, hp[0] - inches(1.6) - k * inches(1.25), hp[1] - k * inches(0.55), -W / 2 + inches(1.6), W / 2 - inches(1.6), inches(0.6), 0x1b1c20, hood);
    for (const s of [-1, 1]) kit.sectorPlate(`hood_sector${s}`, [hp[0], hp[1], s * (W / 2 - inches(0.9))], inches(5.4), Math.PI * 0.72, Math.PI * 1.12, { parent: hood, color: BLK, teeth: 18 });

    // ---------- front intake: blue tube bracing, compliant roller, top roller, kicker ramp
    const ipiv: [number, number, number] = [L / 2 - inches(1), y0 + inches(8), 0];
    const intake = groundIntake(kit, 'intake', { bumper: { face: L / 2 + inches(3.5), top: inches(2.56) + inches(5) }, pivot: [ipiv[0], ipiv[1]], rollerX: L / 2 + inches(3.5) + inches(4.5), rollerR: inches(1.5), width: W, wheel: 0x3a7bff, armColor: BLK, armStyle: 'tube', tubeColor: BLUE, kicker: true, deflector: false });
    intakeGearbox(kit, 'intake', [ipiv[0], ipiv[1]], W / 2 - inches(2));
    kit.box('kicker_ramp', [intake.rollerCenter[0] - inches(4), inches(4.2), 0], [inches(6), inches(0.2), W - inches(2)], M.steel(), intake.group, [0, 0, 0.42]);
    // Blue triangular tube bracing at the front corners (as in the reveal photo).
    for (const s of [-1, 1]) {
      const t1 = kit.box(`blue_brace${s}`, [L / 2 - inches(2.5), y0 + inches(4.5), s * (W / 2 + inches(0.35))], [inches(9), inches(0.8), inches(0.8)], mat(BLUE, { metal: 0.5, rough: 0.35 }));
      t1.rotation.z = 0.5;
    }
    for (const s of [-1, 1]) kit.camera(`side_cam${s}`, [inches(1), H - inches(5), s * (W / 2 + inches(0.2))], s > 0 ? -Math.PI / 2 : Math.PI / 2);
    kit.led('led', [L / 2 - inches(0.8), H - inches(2), 0], [0.006, inches(0.6), W - inches(4)], 0xf2b705);
    void blk;

    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: intake.deployAngleDeg + 95, active: 0, speed: 560 }, intake.group);
    rig.joint({ id: 'intake_roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.rollerCenter, axis: [0, 0, 1], speed: 2000 }, intake.roller);
    if (intake.kickerNode) rig.joint({ id: 'intake_kick', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.kickerCenter!, axis: [0, 0, -1], speed: 2400 }, intake.kickerNode);
    rig.joint({ id: 'feed', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(6.6), inches(12.5), 0], axis: [0, 0, -1], speed: 1500 }, feed);
    rig.joint({ id: 'drum', type: 'spin', driver: 'shooter-wheel', pivot: drumC, axis: [0, 0, -1], speed: 3200 }, drum);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', pivot: hp, axis: [0, 0, 1], active: -30, speed: 180 }, hood);
    const zones = [{ center: [intake.rollerCenter[0] + inches(1), inches(3.5), 0] as [number, number, number], size: [inches(6), inches(7), W - inches(1)] as [number, number, number] }];
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { intake: { ...r254.def.intake!, zones } } };
  },
};
