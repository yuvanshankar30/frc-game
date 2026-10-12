import { Kit, M, mat } from './kit';
import { swerveBase, sidePlates, pivotIntake, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';

/**
 * 2910 Jack in the Bot — Re•Blitz (2026 World Championship Finalist, Newton captain).
 * Sources: robot code github.com/FRCTeam2910/2026CompetitionRobot-Public (Constants: intake pivot 0–114.3°,
 * hood 0–37° travel, flywheel on Kraken X60s, bumpers 35.625in square; subsystems intake / hopper (CANrange) /
 * shooter / drive / vision; no climber), frcteam2910.org rebuild post, Chief Delphi "2910 Robot Reveal, 2026: Blitz",
 * community REBUILT sim model (MK5n R1 at 7.03:1, ~12.7 ft/s; 4-wide drum fired out the back).
 *  - Rebuilt in three weeks into a dumper inspired by 254 / 1678 / 6328
 *  - 23–25 BPS typical with the intake saturated, 30 BPS small volleys (team)
 *  - Hopper extends forward with the intake
 */
const L = inches(27.5);
const W = inches(27);
const H = inches(21.5);
const GREEN = 0x1fb04a;

export const r2910: BuiltinRobot = {
  def: {
    id: 'builtin-2910',
    name: 'Re•Blitz',
    team: '2910',
    author: 'Jack in the Bot',
    color: '#1fb04a',
    description:
      'Rebuilt in three weeks and taken to Einstein. A pivoting slapdown intake feeds an extending hopper and a full-width, four-lane drum with a hood that fires out the back at 25+ BPS.',
    highlights: ['2026 Championship Finalist', 'Pivot intake (0–114°), hood 0–37°', '4-lane rear drum, 25 BPS (30 bursts)', 'Turn the back to the HUB to shoot', 'Extending hopper', 'No climber (none in code)'],
    sources: ['github.com/FRCTeam2910/2026CompetitionRobot-Public (Constants.java)', 'frcteam2910.org: "We Rebuilt our Robot. Then we went to Einstein."', 'Chief Delphi: 2910 Robot Reveal, 2026: Blitz'],
    frame: { length: L, width: W, height: H, mass: 61, comHeight: 0.16, bumperThickness: inches(4) },
    drivetrain: { type: 'swerve', maxSpeed: 3.9, maxAccel: 11, maxOmega: 10, maxAlpha: 34 },
    intake: {
      zones: [{ center: [L / 2 + inches(4) + inches(5), inches(3.5), 0], size: [inches(7), inches(7), W - inches(1)] }],
      rate: 22,
      requiresDeploy: true,
    },
    storage: {
      capacity: 58,
      preload: 8,
      box: { center: [inches(3.5), inches(10.7), 0], size: [inches(28), inches(15.5), W - inches(1.8)] },
    },
    shooter: {
      barrels: [-1.5, -0.5, 0.5, 1.5].map((k) => ({ exit: [-L / 2 - inches(2), inches(18.5), k * inches(5.6)] as [number, number, number], pivot: [0, 0, 0] as [number, number, number] })),
      angle: 55,
      // Hood travel 0–37° (code); modeled as launch elevation 40–77°.
      hoodMin: 40,
      hoodMax: 77,
      minSpeed: 4,
      maxSpeed: 15,
      rate: 25,
      spread: 1.5,
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
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [inches(3), 0] });
    const y0 = base.railTop;

    // Box-tube superstructure: corner uprights + top rails (the Re•Blitz "cage").
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) kit.tube('upright', [sx * (L / 2 - inches(1)), y0, sz * (W / 2 - inches(1))], [sx * (L / 2 - inches(1)), H - inches(1), sz * (W / 2 - inches(1))], [inches(1), inches(1)]);
    for (const sz of [-1, 1]) kit.tube('top_rail', [-L / 2 + inches(1), H - inches(1.5), sz * (W / 2 - inches(1))], [L / 2 - inches(1), H - inches(1.5), sz * (W / 2 - inches(1))], [inches(1), inches(1)]);
    // Clear side walls + net roof.
    kit.polyBox('hopper', -L / 2 + inches(7), L / 2 - inches(1), -W / 2 + inches(0.5), W / 2 - inches(0.5), y0, H - inches(1.6), { open: ['top', 'front', 'back'], decals: ['JACK IN THE BOT', '2910 · RE•BLITZ'], decalColor: '#7dff9f' });
    kit.box('roof_net', [inches(2), H - inches(1.6), 0], [L - inches(9), 0.003, W - inches(1)], M.net());

    // Extending hopper panel that slides out with the intake.
    const ext = kit.group('hopper_ext');
    for (const s of [-1, 1]) kit.box(`ext_side_${s}`, [L / 2 + inches(2.5), y0 + inches(6), s * (W / 2 - inches(0.2))], [inches(7), inches(10), 0.003], M.polycarb(), ext);
    kit.box('ext_top', [L / 2 + inches(2.5), y0 + inches(11), 0], [inches(7), inches(0.5), W - inches(0.5)], M.tube(), ext);

    // Roller floor (live rollers, CANrange in the hopper).
    const floor = kit.group('floor');
    for (let k = 0; k < 6; k++) kit.tubeRoller(`floor_${k}`, L / 2 - inches(3) - k * inches(3.2), y0 + inches(0.9), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.75), 0x2a2d33, floor);
    kit.box('canrange', [0, y0 + inches(12), -W / 2 + inches(1)], [inches(1), inches(1), inches(0.6)], mat(0xff6600));

    // Rear 4-lane drum + hood with sector plates, feeder underneath.
    sidePlates(kit, 'shooter_plate', -L / 2 + inches(3.5), inches(12.5), W / 2 - inches(0.6), [inches(9), inches(18)], 0x1f2226);
    const drum = kit.drum('drum', -L / 2 + inches(2.5), inches(16), W - inches(2.2), inches(2));
    const feeder = kit.tubeRoller('feeder', -L / 2 + inches(6.5), inches(12.5), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(1), 0xff8800);
    for (const s of [-1, 1]) {
      kit.motor(`drum_motor${s}`, [-L / 2 + inches(4), inches(9), s * (W / 2 + inches(1.3))], 'z');
      kit.pulley(`drum_pulley${s}`, [-L / 2 + inches(2.5), inches(16), s * (W / 2 - inches(0.15))], inches(1.8));
    }
    const hood = kit.group('hood');
    const hp: [number, number, number] = [-L / 2 + inches(5), inches(19.2), 0];
    for (let k = 0; k < 5; k++) kit.box(`hood_slat${k}`, [hp[0] - inches(1) - k * inches(1.1), hp[1] - k * inches(0.15), 0], [inches(1.2), inches(0.25), W - inches(2.4)], M.smoke(), hood, [0, 0, 0.12 * k]);
    for (const s of [-1, 1]) kit.sectorPlate(`hood_sector${s}`, [hp[0], hp[1], s * (W / 2 - inches(1.1))], inches(4.5), Math.PI * 0.75, Math.PI * 1.15, { parent: hood, color: GREEN, teeth: 16 });

    // Pivoting slapdown intake (0–114.3°).
    const ipiv: [number, number, number] = [L / 2 - inches(1), y0 + inches(7), 0];
    const intake = pivotIntake(kit, 'intake', ipiv, inches(12), W, { color: 0x1d2024, wheel: GREEN, armAngle: 0.52 });
    kit.limelight([0, H - inches(0.5), 0], Math.PI);
    kit.led('led', [L / 2 - inches(1.5), H - inches(1.8), 0], [0.006, inches(0.6), W - inches(4)], GREEN);

    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: 114.3, active: 0, speed: 600 }, intake.group);
    rig.joint({ id: 'intake_roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.rollerCenter, axis: [0, 0, 1], speed: 2000 }, intake.roller);
    rig.joint({ id: 'hopper_ext', type: 'prismatic', driver: 'intake-deploy', pivot: [0, 0, 0], axis: [1, 0, 0], stowed: -inches(5), active: 0, speed: 0.6 }, ext);
    rig.joint({ id: 'floor', type: 'spin', driver: 'indexer', pivot: [L / 2 - inches(3), y0 + inches(0.9), 0], axis: [0, 0, 1], speed: 1400 }, 'floor_0');
    rig.joint({ id: 'feeder', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(6.5), inches(12.5), 0], axis: [0, 0, -1], speed: 1500 }, feeder);
    rig.joint({ id: 'drum', type: 'spin', driver: 'shooter-wheel', pivot: [-L / 2 + inches(2.5), inches(16), 0], axis: [0, 0, -1], speed: 3200 }, drum);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', pivot: hp, axis: [0, 0, 1], stowed: 0, active: -37, speed: 180 }, hood);
    return { model: kit.root, joints: rig.joints, parts: rig.parts };
  },
};
