import { Kit, M, mat } from './kit';
import { swerveBase, groundIntake, intakeGearbox, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';
import { TURN_RATE, TURN_ACCEL } from '../../robot/schema';

/**
 * 1678 Citrus Circuits — Limestone (two-time district winner, Milstein division champion, Einstein).
 * Sources: citruscircuits.org/2026-robot (full design write-up), official CAD renderings from the 1678 CAD release
 * ("Limestone Inventor.zip": Extended / Retracted / Hood / Top views), robot code github.com/frc1678/C2026-Public
 * (IntakeDeploy 12.8in arm, stowed 130°; Hood 17.5–52.5°; Climber elevator 8.25in on an X60, #25 chain).
 *  - 27 × 27in, SDS MK5n, 1/16in pocketed bellypan; bumpers on WCP cones carry white polycarbonate walls that contain
 *    the expanding hopper.
 *  - Full-width slapdown intake on a MAXSpline gearbox (X60): 2in silicone carbon-fiber roller + 1.25in kicker bar
 *    (2× X60), carbon-fiber guide shafts, 1/8in 2x1 crash bar + SRPP plates.
 *  - Roller floor: five 1in dead-axle rollers + three 2in flex-wheel rollers, shallow at the intake and steeper toward
 *    the shooter; pivots up for electrical access.
 *  - Shooter: full width, 3/16in side plates 25in apart; ball tunnel (2× X60) with active 1.25in dead-axle backing
 *    accelerates FUEL to ~70% shot speed; 2in feeder roller (X60); 3.5in aluminum drum in grip tape linked to three
 *    hood rollers, 4× X60; hood on an X44 through a jackshaft.
 *  - Hopper: horizontal extension with the intake + vertical extension (corrugated roof) carried by the climber.
 *  - LEVEL 1 climb; Limelight 4 on the back face; 21 Krakens total.
 *  - Capacity modeled ~55 (community estimates 37–102).
 */
const L = inches(27);
const W = inches(27);
const H = inches(21.5);
const LIME = 0x46d33a;
const PANEL = 0xe9ecef; // white panels in the renders

export const r1678: BuiltinRobot = {
  def: {
    id: 'builtin-1678',
    name: 'Limestone',
    team: '1678',
    author: 'Citrus Circuits',
    color: '#46d33a',
    description:
      'A full-width slapdown intake feeds an angled roller floor and a ball tunnel that pre-accelerates FUEL into a 3.5in grip-tape drum with linked hood rollers. White polycarbonate walls ride on the bumpers, and the climber elevator lifts the hopper roof. It climbs LEVEL 1.',
    highlights: ['Milstein division champion', 'Ball tunnel + 3.5in grip-tape drum', 'Hood 17.5–52.5° (X44 jackshaft)', 'Climber lifts the hopper roof', 'LEVEL 1 climb', '21 Kraken motors'],
    sources: ['citruscircuits.org/2026-robot (design write-up)', '1678 CAD release renderings (Limestone Extended / Retracted / Hood)', 'github.com/frc1678/C2026-Public (constants)'],
    frame: { length: L, width: W, height: H, mass: 61, comHeight: 0.17, bumperThickness: inches(3.5), bumperHeight: inches(5) },
    drivetrain: { type: 'swerve', maxSpeed: 4.4, maxAccel: 11, maxOmega: TURN_RATE, maxAlpha: TURN_ACCEL },
    intake: {
      zones: [{ center: [L / 2 + inches(9), inches(3.5), 0], size: [inches(7), inches(7), W - inches(1)] }],
      rate: 22,
      requiresDeploy: true,
    },
    storage: {
      capacity: 55,
      preload: 8,
      box: { center: [inches(3.2), inches(11.5), 0], size: [inches(22), inches(18), W - inches(1.8)] },
    },
    shooter: {
      barrels: [-1.5, -0.5, 0.5, 1.5].map((k) => ({ exit: [-L / 2 - inches(2), inches(19.5), k * inches(5.6)] as [number, number, number], pivot: [0, 0, 0] as [number, number, number] })),
      angle: 60,
      // Hood 17.5–52.5° (code) modeled as launch elevation 37.5–72.5°.
      hoodMin: 37.5,
      hoodMax: 72.5,
      minSpeed: 4,
      maxSpeed: 16,
      rate: 26,
      spread: 1.4,
      turretMin: null,
      turretMax: null,
      yawOffset: 180,
      sotm: true,
      sotmSkill: 0.4, // a dumper: stops to unload the drum
    },
    climber: { maxLevel: 1, climbTime: 2.5, canAutoClimb: true },
    source: 'builtin:1678',
  },
  build() {
    const kit = new Kit('1678-limestone');
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [inches(4), 0] });
    const y0 = base.railTop;
    const white = mat(PANEL, { rough: 0.55 });
    const gray = mat(0xb4bac1, { metal: 0.7, rough: 0.35 });

    // ---------- white polycarbonate walls riding on the bumpers (both sides + front lip), riveted
    const wx0 = -L / 2 + inches(9);
    const wx1 = L / 2 - inches(0.4);
    for (const s of [-1, 1]) kit.panel(`wall_${s}`, [(wx0 + wx1) / 2, (y0 + H - inches(3)) / 2, s * (W / 2 - inches(0.3))], wx1 - wx0, H - inches(3) - y0, white, 'xy');
    kit.panel('wall_front', [wx1, y0 + inches(4), 0], W - inches(0.6), inches(8), white, 'zy');
    for (const s of [-1, 1] as const) kit.sponsors(`brand_${s}`, [(wx0 + wx1) / 2, y0 + inches(8), s * (W / 2 - inches(0.2))], inches(14), inches(6), ['CITRUS CIRCUITS', '1678', 'LIMESTONE'], 'xy', s, undefined, '#5ab94e');

    // ---------- roller floor: 3 dead-axle (shallow) + 3 flex (steep) + 2 dead-axle into the feeder
    const floor = kit.group('roller_floor');
    const fx = (k: number) => L / 2 - inches(2.5) - k * inches(2.3);
    for (let k = 0; k < 8; k++) {
      const flex = k >= 3 && k < 6;
      const y = y0 + inches(0.9) + Math.max(0, k - 2) * inches(0.55);
      if (flex) {
        const fg = kit.group(`floor_flex_${k}`, floor);
        for (let j = 0; j < 7; j++) kit.compliant(`flex_${k}_${j}`, [fx(k), y, -W / 2 + inches(2.3) + j * ((W - inches(4.6)) / 6)], inches(1), inches(0.8), 0xff8c1a, fg);
        kit.cyl(`flex_shaft_${k}`, [fx(k), y, 0], inches(0.25), W - inches(2.5), 'z', M.steel(), fg, 6);
      } else kit.tubeRoller(`floor_dead_${k}`, fx(k), y, -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.5), 0x2a2d33, floor);
    }
    kit.motor('floor_motor', [fx(3), y0 - inches(1.3), W / 2 - inches(3)], 'y');

    // ---------- shooter tower: 3/16in plates 25in apart, ball tunnel, feeder, drum + 3 hood rollers, hood sector
    for (const s of [-1, 1]) kit.latticePlate(`shooter_plate${s}`, [-L / 2 + inches(4.5), inches(11.5), s * inches(12.5)], inches(10), inches(20), { color: 0xc5cbd2, t: inches(0.1875), cell: inches(1.7), rib: inches(0.22) });
    kit.box('tunnel_backing', [-L / 2 + inches(8.5), inches(12), 0], [inches(0.25), inches(16), inches(24.5)], white);
    const tunnel = kit.group('ball_tunnel');
    for (let k = 0; k < 5; k++) kit.tubeRoller(`backing_${k}`, -L / 2 + inches(7.6) - k * inches(0.3), inches(6.5 + k * 2.4), -inches(12), inches(12), inches(0.62), 0x2a2d33, tunnel);
    for (let m = 0; m < 2; m++) kit.motor(`tunnel_x60_${m}`, [-L / 2 + inches(6 - m * 2), inches(6), (m ? -1 : 1) * inches(13.9)], 'z');
    const feeder = kit.tubeRoller('feeder', -L / 2 + inches(5.5), inches(16), -inches(12), inches(12), inches(1), 0xff8c1a);
    const drum = kit.drum('drum', -L / 2 + inches(2.6), inches(18.2), inches(25), inches(1.75), undefined, M.grip());
    for (const s of [-1, 1]) for (const m of [0, 1]) kit.motor(`drum_motor${s}${m}`, [-L / 2 + inches(5.5 - m * 3), inches(9), s * inches(13.9)], 'z');
    const hood = kit.group('hood');
    const hp: [number, number, number] = [-L / 2 + inches(5), inches(20.6), 0];
    for (let k = 0; k < 3; k++) kit.tubeRoller(`hood_roller${k}`, hp[0] - inches(1.6) - k * inches(1.5), hp[1] - k * inches(0.45), -inches(12), inches(12), inches(0.75), 0x26282b, hood);
    for (const s of [-1, 1]) kit.sectorPlate(`hood_sector${s}`, [hp[0], hp[1], s * inches(12.3)], inches(7.5), Math.PI * 0.62, Math.PI * 1.18, { parent: hood, color: 0xaab1b9, teeth: 26 });
    kit.cyl('hood_jackshaft', [hp[0] + inches(1.2), hp[1] - inches(2.2), 0], inches(0.25), inches(26), 'z', M.steel(), undefined, 8);
    kit.motor('hood_x44', [hp[0] + inches(1.2), hp[1] - inches(4), inches(10)], 'z', undefined, true);

    // ---------- climber elevator (#25 chain) carrying the vertical hopper extension (corrugated roof)
    const climb = kit.group('climber');
    for (const s of [-1, 1]) {
      kit.box(`climb_tube${s}`, [-L / 2 + inches(9.5), H - inches(6.5), s * inches(11)], [inches(0.75), inches(10), inches(0.75)], gray, climb);
      kit.box(`climb_hook${s}`, [-L / 2 + inches(10.6), H - inches(1.3), s * inches(11)], [inches(2.4), inches(0.8), inches(0.6)], mat(0xffd000, { metal: 0.3 }), climb);
      kit.box(`climb_rail${s}`, [-L / 2 + inches(9.5), inches(10), s * inches(11.9)], [inches(1), inches(16), inches(0.5)], M.tube());
    }
    kit.panel('roof_corrugated', [inches(2.5), H - inches(2.9), 0], inches(23), W - inches(1.6), white, 'xz', climb);
    kit.motor('climb_x60', [-L / 2 + inches(9.5), y0 + inches(1.5), 0], 'z');

    // ---------- full-width slapdown intake (12.8in arm, stows 130°)
    const ipiv: [number, number, number] = [L / 2 - inches(1.5), y0 + inches(7.5), 0];
    const armLen = inches(12.8);
    const rr = inches(1);
    const dyArm = ipiv[1] - (rr + inches(0.35));
    const intake = groundIntake(kit, 'intake', { bumper: { face: L / 2 + inches(3.5), top: inches(2.56) + inches(5) }, pivot: [ipiv[0], ipiv[1]], rollerX: ipiv[0] + Math.sqrt(armLen * armLen - dyArm * dyArm), rollerR: rr, width: W, roller: 'silicone', wheel: LIME, armColor: 0x2b2f35, kicker: true });
    intakeGearbox(kit, 'intake', [ipiv[0], ipiv[1]], -W / 2 + inches(2));
    kit.tube('crash_bar', [intake.rollerCenter[0] + inches(1.8), inches(4.2), -W / 2 + inches(1)], [intake.rollerCenter[0] + inches(1.8), inches(4.2), W / 2 - inches(1)], [inches(2), inches(1)], intake.group);
    for (let k = 0; k < 2; k++) kit.cyl(`cf_guide_${k}`, [ipiv[0] + inches(3 + k * 2.5), ipiv[1] - inches(1.5 + k), 0], inches(0.31), W - inches(2), 'z', M.cf(), intake.group, 10);

    kit.limelight([-L / 2 - inches(0.4), H - inches(4), 0], Math.PI);
    kit.led('led', [-L / 2 + inches(8), y0 + inches(1), W / 2 + inches(0.1)], [inches(10), inches(0.6), 0.006], LIME);

    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: intake.deployAngleDeg + 95, active: 0, speed: 560 }, intake.group);
    rig.joint({ id: 'intake_roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.rollerCenter, axis: [0, 0, 1], speed: 2000 }, intake.roller);
    if (intake.kickerNode) rig.joint({ id: 'intake_kick', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.kickerCenter!, axis: [0, 0, -1], speed: 2400 }, intake.kickerNode);
    rig.joint({ id: 'floor', type: 'spin', driver: 'indexer', pivot: [fx(0), y0 + inches(0.9), 0], axis: [0, 0, 1], speed: 1500 }, 'floor_dead_0');
    rig.joint({ id: 'feeder', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(5.5), inches(16), 0], axis: [0, 0, -1], speed: 1500 }, feeder);
    rig.joint({ id: 'drum', type: 'spin', driver: 'shooter-wheel', pivot: [-L / 2 + inches(2.6), inches(18.2), 0], axis: [0, 0, -1], speed: 3400 }, drum);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', pivot: hp, axis: [0, 0, 1], active: -35, speed: 180 }, hood);
    rig.joint({ id: 'climber', type: 'prismatic', driver: 'climber', pivot: [-L / 2 + inches(9.5), H, 0], axis: [0, 1, 0], active: inches(8.25), speed: 0.3 }, climb);
    const zones = [{ center: [intake.rollerCenter[0] + inches(1), inches(3.5), 0] as [number, number, number], size: [inches(6), inches(7), W - inches(1)] as [number, number, number] }];
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { intake: { ...r1678.def.intake!, zones } } };
  },
};
