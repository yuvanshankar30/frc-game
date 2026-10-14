import * as THREE from 'three';
import { Kit, M, mat } from './kit';
import { swerveBase, groundIntake, intakeGearbox, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';

/**
 * 1678 Citrus Circuits — Limestone (two-time district winner, Milstein division champion, Einstein).
 * Sources: citruscircuits.org/2026-robot (full design write-up), official CAD renderings from the 1678 CAD release
 * ("Limestone Inventor.zip": Extended / Retracted / Hood / Top views), robot code github.com/frc1678/C2026-Public
 * (IntakeDeploy 12.8in arm, stowed 130°; Hood 17.5–52.5°; Climber elevator 8.25in on an X60, #25 chain).
 *  - 27 × 27in, SDS MK5n, 1/16in diamond-pocketed bellypan; bumpers on WCP cones carry smoked polycarbonate walls on
 *    riveted aluminum angle that contain the expanding hopper (front extension: smoked sides + an X-truss aluminum
 *    panel that slides out over the intake).
 *  - Floor: helical spiral agitator rollers ahead of dead-axle rollers; shooter tower of organically pocketed dark
 *    plates, four black hood rollers on top, bronze 3-spoke flywheel pulley, web-pocketed back plate with a Limelight.
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

export const r1678: BuiltinRobot = {
  def: {
    id: 'builtin-1678',
    name: 'Limestone',
    team: '1678',
    author: 'Citrus Circuits',
    color: '#46d33a',
    description:
      'A full-width slapdown intake feeds spiral agitator rollers and a ball tunnel that pre-accelerates FUEL into a 3.5in grip-tape drum under four black hood rollers. Smoked polycarbonate walls on riveted aluminum ride on the bumpers, and an X-truss front extension slides out over the intake.',
    highlights: ['Milstein division champion', 'Ball tunnel + 3.5in grip-tape drum', 'Hood 17.5–52.5° (X44 jackshaft)', 'Climber lifts the hopper roof', 'LEVEL 1 climb', '21 Kraken motors'],
    sources: ['citruscircuits.org/2026-robot (design write-up)', '1678 CAD release renderings (Limestone Extended / Retracted / Hood)', 'github.com/frc1678/C2026-Public (constants)'],
    frame: { length: L, width: W, height: H, mass: 61, comHeight: 0.17, bumperThickness: inches(3.5), bumperHeight: inches(5) },
    drivetrain: { type: 'swerve', maxSpeed: 4.4, maxAccel: 11, maxOmega: 11.0, maxAlpha: 50 }, // DriveConstants.kMaxAngularRate / kMaxAngularAcceleration
    intake: {
      zones: [{ center: [L / 2 + inches(9), inches(3.5), 0], size: [inches(7), inches(7), W - inches(1)] }],
      rate: 22,
      requiresDeploy: true,
      // Superstructure.contractHopper: the pivot steps between 25° and 80° of its 130° travel to crowd the hopper.
      compress: { from: 25 / 130, to: 80 / 130, period: 1 },
    },
    storage: {
      capacity: 55,
      preload: 8,
      // Inside the walls (ahead of the ball tunnel, behind the stowed front panel) so carried FUEL never shows through.
      box: { center: [inches(4.5), inches(11.5), 0], size: [inches(16.6), inches(18), W - inches(1.8)] },
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
      maxScoreSpeed: 1.0, // SuperstructureConstants.MAX_SOTM_SPEED
      hoodStowsIdle: true, // Hood.STOW = kMinAngle (17.5°) when not shooting
    },
    climber: { maxLevel: 1, climbTime: 2.5, canAutoClimb: true },
    // The climber elevator carries the hopper roof: up 8.25in in play (kMaxPosition), auto-tucked within 1.5m of a
    // TRENCH (AutoTuckConstants) to its TRENCH setpoint. The modeled frame top already sits ~3in over the real stowed
    // roof, so the 3.5in TRENCH setpoint maps to +0.5in here (still under the 22.25in arm).
    lift: { height: inches(8.25), trench: inches(0.5), distance: 1.5, speed: 0.3 },
    source: 'builtin:1678',
  },
  build() {
    const kit = new Kit('1678-limestone');
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [inches(4), 0] });
    const y0 = base.railTop;
    const angle = mat(0xb9bfc6, { metal: 0.85, rough: 0.3 }); // bare aluminum edge angle
    const plateDark = 0x50565e; // dark-gray anodized shooter plates (CAD)
    const black = mat(0x16171a, { rough: 0.6 });
    const bumperTop = inches(2.56) + inches(5);
    const face = L / 2 + inches(3.5);
    const rivets = (name: string, a0: [number, number, number], a1: [number, number, number], n: number, parent?: THREE.Object3D) => {
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        kit.cyl(`${name}_${k}`, [a0[0] + (a1[0] - a0[0]) * u, a0[1] + (a1[1] - a0[1]) * u, a0[2] + (a1[2] - a0[2]) * u], inches(0.12), inches(0.06), Math.abs(a1[2] - a0[2]) > 1e-6 ? 'x' : 'z', black, parent, 8);
      }
    };

    // ---------- hopper: smoked gray polycarbonate walls riding on the bumpers, riveted aluminum edge angles
    const wx0 = -L / 2 + inches(9.5);
    const wx1 = L / 2 - inches(0.4);
    const wallTop = H - inches(0.5);
    for (const s of [-1, 1]) {
      const z = s * (W / 2 - inches(0.3));
      kit.panel(`wall_${s}`, [(wx0 + wx1) / 2, (bumperTop + wallTop) / 2, z], wx1 - wx0, wallTop - bumperTop, M.smoke(), 'xy');
      kit.box(`wall_angle_top${s}`, [(wx0 + wx1) / 2, wallTop, z], [wx1 - wx0, inches(0.75), inches(0.75)], angle);
      kit.box(`wall_angle_bot${s}`, [(wx0 + wx1) / 2, bumperTop + inches(0.4), z], [wx1 - wx0, inches(0.75), inches(0.75)], angle);
      kit.box(`wall_post_front${s}`, [wx1, (bumperTop + wallTop) / 2, z], [inches(1.5), wallTop - bumperTop, inches(0.12)], angle);
      kit.box(`wall_post_mid${s}`, [inches(1.5), (bumperTop + wallTop) / 2, z + s * inches(0.08)], [inches(1.2), wallTop - bumperTop, inches(0.12)], angle);
      rivets(`wall_rivet_top${s}`, [wx0 + inches(1), wallTop, z + s * inches(0.4)], [wx1 - inches(1), wallTop, z + s * inches(0.4)], 14);
      // Diagonal brace angle on the wall (CAD side view), and the slot cut for the extension guide.
      const brace = kit.box(`wall_brace${s}`, [inches(4.5), (bumperTop + wallTop) / 2, z + s * inches(0.1)], [inches(14), inches(0.6), inches(0.1)], angle);
      brace.rotation.z = 0.62;
      kit.box(`wall_slot${s}`, [inches(5), wallTop - inches(3.2), z + s * inches(0.06)], [inches(9), inches(0.35), inches(0.05)], black);
    }
    for (const s of [-1, 1] as const) kit.sponsors(`brand_${s}`, [inches(4), bumperTop + inches(5), s * (W / 2 - inches(0.15))], inches(10), inches(4), ['CITRUS CIRCUITS', '1678'], 'xy', s, undefined, '#7ee05e');

    // ---------- floor: spiral agitator rollers (helical coils on shafts) feeding dead-axle rollers into the tunnel
    const floor = kit.group('roller_floor');
    const fx = (k: number) => L / 2 - inches(3) - k * inches(2.6);
    for (let k = 0; k < 7; k++) {
      const y = y0 + inches(1.1) + Math.max(0, k - 2) * inches(0.6);
      if (k >= 2 && k < 5) {
        // Helical coil rollers: two opposite-hand spirals per shaft push FUEL toward the center (CAD).
        kit.cyl(`spiral_shaft_${k}`, [fx(k), y, 0], inches(0.45), W - inches(2.5), 'z', mat(0x3a3d42, { metal: 0.5 }), floor, 12);
        for (const hand of [-1, 1]) {
          const z0 = hand * inches(0.6);
          const z1 = hand * (W / 2 - inches(1.6));
          const turns = 6;
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 96; i++) {
            const u = i / 96;
            const a = u * turns * Math.PI * 2 * hand + k;
            pts.push(new THREE.Vector3(fx(k) + Math.cos(a) * inches(0.85), y + Math.sin(a) * inches(0.85), z0 + (z1 - z0) * u));
          }
          const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, inches(0.16), 6, false);
          kit.add(new THREE.Mesh(geo, mat(k === 3 ? 0x5fbf4a : 0x2c2f34, { rough: 0.6 })), `spiral_${k}_${hand}`, floor);
        }
      } else kit.tubeRoller(`floor_dead_${k}`, fx(k), y, -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.55), 0x9aa0a8, floor);
    }
    kit.motor('floor_motor', [fx(3), y0 - inches(1.3), W / 2 - inches(3)], 'y');
    kit.webPlate('floor_side_l', [inches(1), y0 + inches(2.6), -(W / 2 - inches(1.1))], inches(16), inches(3.6), { color: plateDark, cell: inches(1.6), rib: inches(0.22), seed: 3 });
    kit.webPlate('floor_side_r', [inches(1), y0 + inches(2.6), W / 2 - inches(1.1)], inches(16), inches(3.6), { color: plateDark, cell: inches(1.6), rib: inches(0.22), seed: 4 });

    // ---------- shooter tower (rear): organic web-pocketed dark plates 25in apart, ball tunnel, feeder, 3.5in
    // grip-tape drum, four black hood rollers across the top, bronze 3-spoke flywheel pulley, belts and idlers
    const SX0 = -L / 2 + inches(0.4);
    const SX1 = -L / 2 + inches(10);
    const tOutline: [number, number][] = [
      [-(SX1 - SX0) / 2, -(H - y0 + inches(1)) / 2],
      [(SX1 - SX0) / 2, -(H - y0 + inches(1)) / 2],
      [(SX1 - SX0) / 2, (H - y0 + inches(1)) / 2 - inches(1.5)],
      [(SX1 - SX0) / 2 - inches(2.5), (H - y0 + inches(1)) / 2],
      [-(SX1 - SX0) / 2, (H - y0 + inches(1)) / 2],
    ];
    const tc = (H + y0 + inches(1)) / 2 - inches(0.5);
    for (const s of [-1, 1]) {
      kit.webPlate(`shooter_plate${s}`, [(SX0 + SX1) / 2, tc, s * inches(12.5)], SX1 - SX0, H - y0, { color: plateDark, t: inches(0.1875), cell: inches(2.2), rib: inches(0.26), seed: s > 0 ? 11 : 12, outline: tOutline });
      kit.webPlate(`shooter_cover${s}`, [(SX0 + SX1) / 2 - inches(0.6), tc - inches(1.5), s * inches(13.6)], inches(7.5), inches(13), { color: 0x2b2e33, t: inches(0.12), cell: inches(2.8), rib: inches(0.3), seed: s > 0 ? 21 : 22 });
    }
    // Back face: web-pocketed black plate with the Limelight at its top center.
    kit.webPlate('shooter_back', [SX0 - inches(0.2), tc - inches(1), 0], W - inches(3), H - y0 - inches(3), { color: 0x24262a, plane: 'zy', cell: inches(3.2), rib: inches(0.3), seed: 31 });
    kit.limelight([SX0 - inches(0.7), H - inches(3.5), 0], Math.PI);
    kit.box('tunnel_backing', [-L / 2 + inches(8.8), inches(12), 0], [inches(0.2), inches(15), inches(24.5)], mat(0xd9dde2, { rough: 0.5 }));
    const tunnel = kit.group('ball_tunnel');
    for (let k = 0; k < 5; k++) kit.tubeRoller(`backing_${k}`, -L / 2 + inches(7.8) - k * inches(0.35), inches(6.5 + k * 2.4), -inches(12), inches(12), inches(0.62), 0x2a2d33, tunnel);
    for (let m = 0; m < 2; m++) kit.motor(`tunnel_x60_${m}`, [-L / 2 + inches(6 - m * 2), inches(6), (m ? -1 : 1) * inches(14.1)], 'z');
    const feeder = kit.tubeRoller('feeder', -L / 2 + inches(5.6), inches(15.6), -inches(12), inches(12), inches(1), 0x1d1f23);
    const drumC: [number, number, number] = [-L / 2 + inches(2.8), inches(17.6), 0];
    const drum = kit.drum('drum', drumC[0], drumC[1], inches(24.6), inches(1.75), undefined, M.grip());
    for (const s of [-1, 1]) for (const m of [0, 1]) kit.motor(`drum_motor${s}${m}`, [-L / 2 + inches(5.5 - m * 3), inches(8.5), s * inches(14.2)], 'z');
    // Bronze 3-spoke flywheel pulley + gray idlers and belts on the left side (CAD side view).
    kit.pulley('fly_pulley', [drumC[0] + inches(1.5), inches(9.5), -inches(14.1)], inches(2.6), { color: 0xc98a3c, spokes: 3, t: inches(0.4) });
    kit.pulley('fly_hub', [drumC[0] + inches(1.5), inches(9.5), -inches(14.4)], inches(1.2), { color: 0x9aa0a8, spokes: 3 });
    for (const [x, y] of [
      [-L / 2 + inches(7.5), inches(12.5)],
      [-L / 2 + inches(5), inches(14.5)],
      [-L / 2 + inches(8.5), inches(17)],
    ])
      kit.pulley('fly_idler', [x, y, -inches(14.1)], inches(0.7), { color: 0xa9afb6 });
    kit.belt('fly_belt_a', [drumC[0] + inches(1.5), inches(9.5)], [drumC[0], drumC[1]], -inches(14.3));
    kit.belt('fly_belt_b', [drumC[0] + inches(1.5), inches(9.5)], [-L / 2 + inches(7.5), inches(12.5)], -inches(14.3));
    kit.sectorPlate('hood_gear_big', [-L / 2 + inches(6), inches(9), inches(14.1)], inches(5), Math.PI * 0.1, Math.PI * 0.95, { color: 0x9aa0a8, teeth: 30 });
    const hood = kit.group('hood');
    const hp: [number, number, number] = [-L / 2 + inches(6), inches(20.4), 0];
    for (let k = 0; k < 4; k++) kit.tubeRoller(`hood_roller${k}`, hp[0] - inches(0.2) - k * inches(1.9), hp[1] - k * inches(0.35), -inches(12.2), inches(12.2), inches(0.95), 0x141518, hood);
    for (const s of [-1, 1]) kit.sectorPlate(`hood_sector${s}`, [hp[0], hp[1], s * inches(12.2)], inches(4.2), Math.PI * 1.0, Math.PI * 1.45, { parent: hood, color: plateDark, teeth: 18 });
    kit.box('hood_cover', [hp[0] + inches(1.5), hp[1] + inches(0.6), 0], [inches(3.5), inches(0.12), inches(24.4)], mat(0xd9dde2, { rough: 0.45 }), hood);
    kit.cyl('hood_jackshaft', [hp[0] + inches(1.2), hp[1] - inches(2.2), 0], inches(0.25), inches(26), 'z', M.steel(), undefined, 8);
    kit.motor('hood_x44', [hp[0] + inches(1.2), hp[1] - inches(4), inches(10)], 'z', undefined, true);
    kit.box('battery', [-L / 2 + inches(4), y0 + inches(3), inches(6)], [inches(3), inches(6), inches(7)], mat(0xc9822e, { rough: 0.6 }));

    // ---------- climber elevator carrying the vertical hopper extension (roof)
    const climb = kit.group('climber');
    for (const s of [-1, 1]) {
      kit.box(`climb_tube${s}`, [-L / 2 + inches(10.2), H - inches(6.5), s * inches(11)], [inches(0.75), inches(10), inches(0.75)], angle, climb);
      kit.box(`climb_rail${s}`, [-L / 2 + inches(10.2), inches(10), s * inches(11.9)], [inches(1), inches(16), inches(0.5)], M.tube());
    }
    kit.panel('roof', [inches(3), H - inches(0.6), 0], inches(20), W - inches(1.6), M.smoke(), 'xz', climb);
    kit.motor('climb_x60', [-L / 2 + inches(10.2), y0 + inches(1.5), 0], 'z');

    // ---------- horizontal hopper extension: smoked side panels + front aluminum X-truss panel, slides out over the
    // intake as it deploys (CAD "Extended" view)
    const EXT = inches(9);
    const ext = kit.group('hopper_ext');
    const ex0 = wx1 - inches(10);
    const ex1 = wx1 + EXT;
    for (const s of [-1, 1]) {
      const z = s * (W / 2 - inches(0.8));
      kit.panel(`ext_side${s}`, [(ex0 + ex1) / 2, (bumperTop + inches(3) + wallTop - inches(0.5)) / 2, z], ex1 - ex0, wallTop - bumperTop - inches(3.5), M.smoke(), 'xy', ext);
      kit.box(`ext_angle_top${s}`, [(ex0 + ex1) / 2, wallTop - inches(0.5), z], [ex1 - ex0, inches(0.7), inches(0.7)], angle, ext);
      kit.box(`ext_angle_front${s}`, [ex1, (bumperTop + wallTop) / 2 + inches(1.2), z], [inches(1.3), wallTop - bumperTop - inches(3), inches(0.15)], angle, ext);
      rivets(`ext_rivet${s}`, [ex1, bumperTop + inches(4), z + s * inches(0.15)], [ex1, wallTop - inches(1.2), z + s * inches(0.15)], 8, ext);
    }
    const xOut: [number, number][] = [
      [-(W - inches(1.8)) / 2, -inches(5.5)],
      [(W - inches(1.8)) / 2, -inches(5.5)],
      [(W - inches(1.8)) / 2, inches(5.5)],
      [-(W - inches(1.8)) / 2, inches(5.5)],
    ];
    kit.latticePlate('ext_front_x', [ex1, wallTop - inches(6.2), 0], W - inches(1.8), inches(11), { plane: 'zy', color: 0xc4c9cf, cell: inches(5.2), rib: inches(0.45), outline: xOut, parent: ext });
    kit.box('ext_front_lip', [ex1 + inches(0.2), bumperTop + inches(3.2), 0], [inches(0.5), inches(1.4), W - inches(1.8)], angle, ext);
    for (const c of ext.children) c.position.x -= EXT;

    // ---------- full-width slapdown intake: black plate arms, black 2in roller + kicker bar, 2x1 crash bar
    const ipiv: [number, number, number] = [L / 2 - inches(1.5), y0 + inches(7.5), 0];
    const armLen = inches(12.8);
    const rr = inches(1);
    const dyArm = ipiv[1] - (rr + inches(0.35));
    const intake = groundIntake(kit, 'intake', { bumper: { face, top: bumperTop }, pivot: [ipiv[0], ipiv[1]], rollerX: ipiv[0] + Math.sqrt(armLen * armLen - dyArm * dyArm), rollerR: rr, width: W, roller: 'silicone', wheel: 0x1a1b1e, armColor: 0x17181b, kicker: true });
    intakeGearbox(kit, 'intake', [ipiv[0], ipiv[1]], -W / 2 + inches(2));
    kit.tube('crash_bar', [intake.rollerCenter[0] + inches(1.8), inches(4.2), -W / 2 + inches(1)], [intake.rollerCenter[0] + inches(1.8), inches(4.2), W / 2 - inches(1)], [inches(2), inches(1)], intake.group, black);
    for (let k = 0; k < 2; k++) kit.cyl(`cf_guide_${k}`, [ipiv[0] + inches(3 + k * 2.5), ipiv[1] - inches(1.5 + k), 0], inches(0.31), W - inches(2), 'z', M.cf(), intake.group, 10);
    kit.led('led', [-L / 2 + inches(8), y0 + inches(1), W / 2 + inches(0.1)], [inches(10), inches(0.6), 0.006], LIME);

    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: intake.deployAngleDeg + 95, active: 0, speed: 560 }, intake.group);
    rig.joint({ id: 'hopper_ext', type: 'prismatic', driver: 'intake-deploy', pivot: [0, 0, 0], axis: [1, 0, 0], stowed: 0, active: EXT, speed: 0.6 }, ext);
    rig.joint({ id: 'floor', type: 'spin', driver: 'indexer', pivot: [fx(0), y0 + inches(1.1), 0], axis: [0, 0, 1], speed: 1500 }, 'floor_dead_0');
    rig.joint({ id: 'feeder', type: 'spin', driver: 'indexer', pivot: [-L / 2 + inches(5.6), inches(15.6), 0], axis: [0, 0, -1], speed: 1500 }, feeder);
    rig.joint({ id: 'drum', type: 'spin', driver: 'shooter-wheel', pivot: drumC, axis: [0, 0, -1], speed: 3400 }, drum);
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', pivot: hp, axis: [0, 0, 1], active: -35, speed: 180 }, hood);
    rig.joint({ id: 'climber', type: 'prismatic', driver: 'lift', pivot: [-L / 2 + inches(10.2), H, 0], axis: [0, 1, 0], active: inches(8.25), speed: 0.3 }, climb);
    const zones = [{ center: [intake.rollerCenter[0] + inches(1), inches(3.5), 0] as [number, number, number], size: [inches(6), inches(7), W - inches(1)] as [number, number, number] }];
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { intake: { ...r1678.def.intake!, zones } } };
  },
};
