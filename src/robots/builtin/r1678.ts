import { Kit, M, mat } from './kit';
import { swerveBase, pivotIntake, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';

/**
 * 1678 Citrus Circuits — Limestone (two-time district winner, Milstein division champion, Einstein).
 * Sources: citruscircuits.org/2026-robot (full design write-up + CAD renders), robot code
 * github.com/frc1678/C2026-Public (IntakeDeploy: 12.8in arm, stowed 130°; Hood 17.5–52.5°; Climber elevator
 * 8.25in travel on a Kraken X60, #25 chain), Chief Delphi threads.
 *  - 27 × 27in, SDS MK5n, 1/16in pocketed bellypan; bumpers carry polycarbonate walls that contain the expanding hopper
 *  - Full-width slapdown intake: 2in silicone carbon-fiber roller + 1.25in kicker bar, 2× X60
 *  - Roller floor: five 1in dead-axle + three 2in flex-wheel rollers, steeper toward the shooter
 *  - Shooter: side plates 25in apart, ball tunnel (2× X60, 1.25in dead-axle backing) to ~70% shot speed, 2in feeder,
 *    3.5in grip-tape drum linked to three hood rollers, 4× X60; hood on an X44 through a jackshaft
 *  - Hopper: horizontal extension with the intake + vertical extension (corrugated roof) carried by the climber
 *  - LEVEL 1 climb "with ease"; Limelight 4 on the back; 21 Krakens total
 *  - Capacity modeled ~55 (community estimates 37–102)
 */
const L = inches(27);
const W = inches(27);
const H = inches(21.5);
const LIME = 0x46d33a;

export const r1678: BuiltinRobot = {
  def: {
    id: 'builtin-1678',
    name: 'Limestone',
    team: '1678',
    author: 'Citrus Circuits',
    color: '#46d33a',
    description:
      'Full-width slapdown intake, an angled roller floor and a ball tunnel that pre-accelerates FUEL into a 3.5in grip-tape drum with hood rollers. The climber elevator also lifts the hopper roof. It climbs LEVEL 1.',
    highlights: ['Milstein division champion', 'Ball tunnel + 3.5in grip-tape drum', 'Hood 17.5–52.5° (X44 jackshaft)', 'Climber lifts the hopper roof', 'LEVEL 1 climb', '21 Kraken motors'],
    sources: ['citruscircuits.org/2026-robot (design write-up)', 'github.com/frc1678/C2026-Public (constants)', 'Chief Delphi: 1678 2026 Robot: Limestone'],
    frame: { length: L, width: W, height: H, mass: 61, comHeight: 0.17 },
    drivetrain: { type: 'swerve', maxSpeed: 4.4, maxAccel: 11, maxOmega: 10, maxAlpha: 32 },
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
      sotm: false,
    },
    climber: { maxLevel: 1, climbTime: 2.5, canAutoClimb: true },
    source: 'builtin:1678',
  },
  build() {
    const kit = new Kit('1678-limestone');
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [inches(4), 0] });
    const y0 = base.railTop;

    // Polycarbonate walls riding on the bumpers (left, right) + front corrugated panel on the extension.
    kit.polyBox('hopper', -L / 2 + inches(8), L / 2 - inches(0.4), -W / 2 + inches(0.3), W / 2 - inches(0.3), y0, H - inches(3), { open: ['top', 'front', 'back'], decals: ['CITRUS CIRCUITS', '1678 · LIMESTONE'], decalColor: '#d8ffd0' });

    // Roller floor: 3 dead-axle (shallow) + 3 flex (steep) + 2 dead-axle into the feeder.
    const floor = kit.group('roller_floor');
    const fx = (k: number) => L / 2 - inches(2.5) - k * inches(2.3);
    for (let k = 0; k < 8; k++) {
      const flex = k >= 3 && k < 6;
      const y = y0 + inches(0.9) + Math.max(0, k - 2) * inches(0.55);
      if (flex) kit.roller(`floor_flex_${k}`, fx(k), y, -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(1), floor, 0xff8c1a, inches(1.6));
      else kit.tubeRoller(`floor_dead_${k}`, fx(k), y, -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.5), 0x2a2d33, floor);
    }
    kit.motor('floor_motor', [fx(3), y0 - inches(1.3), W / 2 - inches(3)], 'y');

    // Shooter: tall pocketed side plates 25in apart, ball tunnel, feeder, drum + 3 hood rollers, hood sector.
    for (const s of [-1, 1]) kit.pocketPlate(`shooter_plate${s}`, [-L / 2 + inches(4.5), inches(12), s * inches(12.5)], inches(10), inches(20), { color: 0x2b2f35, t: inches(0.1875) });
    const tunnel = kit.group('ball_tunnel');
    for (let k = 0; k < 5; k++) kit.tubeRoller(`backing_${k}`, -L / 2 + inches(7.6) - k * inches(0.3), inches(6.5 + k * 2.4), -inches(12), inches(12), inches(0.62), 0x2a2d33, tunnel);
    const feeder = kit.tubeRoller('feeder', -L / 2 + inches(5.5), inches(16), -inches(12), inches(12), inches(1), 0xff8c1a);
    const drum = kit.drum('drum', -L / 2 + inches(2.6), inches(18.2), inches(25), inches(1.75), undefined, M.grip());
    for (const s of [-1, 1]) for (const m of [0, 1]) kit.motor(`drum_motor${s}${m}`, [-L / 2 + inches(5.5 - m * 3), inches(9), s * inches(13.9)], 'z');
    const hood = kit.group('hood');
    const hp: [number, number, number] = [-L / 2 + inches(5), inches(21), 0];
    for (let k = 0; k < 3; k++) kit.tubeRoller(`hood_roller${k}`, hp[0] - inches(1.6) - k * inches(1.6), hp[1] - k * inches(0.4), -inches(12), inches(12), inches(0.75), 0x26282b, hood);
    for (const s of [-1, 1]) kit.sectorPlate(`hood_sector${s}`, [hp[0], hp[1], s * inches(12.3)], inches(6), Math.PI * 0.7, Math.PI * 1.15, { parent: hood, color: 0x9aa1aa, teeth: 22 });
    kit.box('jackshaft', [hp[0] + inches(1), hp[1] - inches(2), 0], [inches(0.5), inches(0.5), inches(26)], M.steel());

    // Climber elevator (#25 chain) carrying the vertical hopper extension (corrugated roof).
    const climb = kit.group('climber');
    for (const s of [-1, 1]) {
      kit.box(`climb_tube${s}`, [-L / 2 + inches(9), H - inches(6), s * inches(11)], [inches(0.75), inches(10), inches(0.75)], mat(0xff8c1a, { metal: 0.3 }), climb);
      kit.box(`climb_hook${s}`, [-L / 2 + inches(10.2), H - inches(0.8), s * inches(11)], [inches(2.6), inches(0.8), inches(0.6)], mat(0xffd000, { metal: 0.3 }), climb);
    }
    kit.box('roof_corrugated', [inches(3), H - inches(2.6), 0], [inches(22), inches(0.2), W - inches(2)], mat(0xf2f4f6, { rough: 0.8, opacity: 0.85 }), climb);
    for (const s of [-1, 1]) kit.box(`climb_rail${s}`, [-L / 2 + inches(9), inches(10), s * inches(11.9)], [inches(1), inches(16), inches(0.5)], M.tube());
    kit.motor('climb_motor', [-L / 2 + inches(9), y0 + inches(1.5), 0], 'z');

    // Full-width slapdown intake (12.8in arm, stows 130°): 2in silicone roller + 1.25in kicker bar, crash bar.
    const ipiv: [number, number, number] = [L / 2 - inches(1.5), y0 + inches(7.5), 0];
    const intake = pivotIntake(kit, 'intake', ipiv, inches(12.8), W, { color: 0x2b2f35, wheel: LIME, armAngle: 0.5 });
    kit.tube('crash_bar', [L / 2 + inches(10), inches(4.5), -W / 2 + inches(1)], [L / 2 + inches(10), inches(4.5), W / 2 - inches(1)], [inches(2), inches(1)], intake.group);
    kit.limelight([-L / 2 - inches(0.4), H - inches(4), 0], Math.PI);
    kit.led('led', [-L / 2 + inches(8), y0 + inches(1), W / 2 + inches(0.1)], [inches(10), inches(0.6), 0.006], LIME);

    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: 130, active: 0, speed: 560 }, intake.group);
    rig.joint({ id: 'intake_roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.rollerCenter, axis: [0, 0, 1], speed: 2000 }, intake.roller);
    rig.joint({ id: 'floor', type: 'spin', driver: 'indexer', pivot: [fx(0), y0 + inches(0.9), 0], axis: [0, 0, 1], speed: 1500 }, 'floor_dead_0');
    rig.joint({ id: 'feeder', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(5.5), inches(16), 0], axis: [0, 0, -1], speed: 1500 }, feeder);
    rig.joint({ id: 'drum', type: 'spin', driver: 'shooter-wheel', pivot: [-L / 2 + inches(2.6), inches(18.2), 0], axis: [0, 0, -1], speed: 3400 }, drum);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', pivot: hp, axis: [0, 0, 1], active: -35, speed: 180 }, hood);
    rig.joint({ id: 'climber', type: 'prismatic', driver: 'climber', pivot: [-L / 2 + inches(9), H, 0], axis: [0, 1, 0], active: inches(8.25), speed: 0.3 }, climb);
    return { model: kit.root, joints: rig.joints, parts: rig.parts };
  },
};
