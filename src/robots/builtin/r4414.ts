import * as THREE from 'three';
import { Kit, M, mat } from './kit';
import { swerveBase, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';
import { TURN_RATE, TURN_ACCEL } from '../../robot/schema';

/**
 * 4414 HighTide — RIPCURRENT (2026 World Champions, Daly division captain).
 * Source: 4414 2026 Technical Binder (2026.team4414.com) — CAD renders and subsystem notes:
 *  - Drivetrain: teal pre-drilled tube, chamfered corners, swerve geared 7.67:1; "left drive rail split to bias the
 *    battery to the very edge" for the Dye Rotor; two cross rails structure the rotor. "25 × 32in" per binder;
 *    that is a 114in perimeter (> R104's 110in), so the frame is modeled at 23.5 × 31.5in.
 *  - Bumpers: "structural bumpers that double as hopper walls and shooter mount", WCP bumper cones.
 *  - Hopper walls: smoked polycarbonate on teal pocketed truss, chamfered rear corners, carbon-fiber end plates.
 *  - Intake: 3in 1/8in-wall polycarbonate roller (2× X60, 3.45:1) + 1.5in bottom roller (X44, 1.5:1), sliding on
 *    doubled 0.25in polycarbonate 10DP racks (X44 each side, 3.33:1); deploys between ~1.3in bumper gaps at the start
 *    of the match; it retracts when not intaking and pumps in and out to feed the Dye Rotor while shooting; extending carbon-fiber hopper box ("85+ under the trench, 100+ with
 *    net over the bump").
 *  - Dye Rotor (V10): round spoked pan, curved outer wall on standoffs, central tower with stacked omni wheels, spiral
 *    hook with passive omni rollers onto 3in TTB urethane wheels — single-stream feed, ~12–14 BPS gap-free.
 *  - Shooter (V11): A-frame hood side plates pivoting on the flywheel axis (binder Q&A: coaxial), dual GT2 belts over
 *    them, hood roller at the apex, 85.3:1 7075 sector gear on one X44; they nest into the base when stowed (1/8in
 *    clearance). Four Kraken X44 on a 3in flywheel with .25in copper mass disks. Turret 55.7:1 on one X44, flex-wheel
 *    cable-chain tensioner; the shooter is carried by the X-contact bearing on top of the Dye Rotor.
 *  - Hopper: 85+ FUEL under the TRENCH, 100+ with the net over the bump; .033 panels on the structural bumpers.
 *  - No climber.
 */
const L = inches(23.5);
const W = inches(31.5);
const H = inches(21.5);
const EXT = inches(10);
const LIFT = inches(8.5);
const TEAL = 0x1a9e9a;
const DARK = 0x1d1f23;
/** Turret bearing (X-contact, on top of the Dye Rotor's feed column): the shooter turns about its axis. */
const TP: [number, number, number] = [-inches(2.5), inches(15), -inches(1.5)];
/** Hood pivot = flywheel axis (binder Q&A: "the physical pivot is coaxial with the shooter wheels"). */
const FW: [number, number, number] = [TP[0] + inches(2.6), TP[1] + inches(2.2), TP[2]];
/** The hood (the A-frame side plates) is modeled at a 60° launch; it tilts 2/3° per degree of launch angle and folds
 * back into the turret base when idle, which keeps the robot under the TRENCH arm. */
const HOOD_K = 2 / 3;
const ROTOR: [number, number, number] = [-inches(1.5), 0, inches(1)];

export const r4414: BuiltinRobot = {
  def: {
    id: 'builtin-4414',
    name: 'RIPCURRENT',
    team: '4414',
    author: 'HighTide',
    color: '#1a9e9a',
    description:
      'The 2026 champion. Structural bumpers double as smoked hopper walls on a teal truss. A rack-driven intake slides out from under a carbon-fiber hopper box that holds 85+ FUEL, and pumps back in while shooting to push FUEL into the rotor. The Dye Rotor single-streams FUEL up a spiral hook into an A-frame turret with a 3in flywheel that shoots on the move.',
    highlights: ['2026 World Champion (Daly captain)', 'Rack slide intake + 85+ FUEL hopper', 'Dye Rotor → single stream ~14 BPS', '55.7:1 turret, 4× X44 flywheel, SOTM', 'Hood folds into the base: fits under the TRENCH', 'No climber'],
    sources: ['4414 2026 Technical Binder: 2026.team4414.com (CAD renders, Dye Rotor V10, Shooter V11, subsystem notes)', 'Chief Delphi: Team 4414 HighTide 2026 Tech Binder (RIPCURRENT)'],
    frame: { length: L, width: W, height: H, mass: 60, comHeight: 0.17, bumperThickness: inches(3.5), bumperHeight: inches(5.5) },
    drivetrain: { type: 'swerve', maxSpeed: 4.1, maxAccel: 10, maxOmega: TURN_RATE, maxAlpha: TURN_ACCEL },
    intake: {
      zones: [{ center: [L / 2 + inches(3.5) + EXT - inches(1), inches(3.2), 0], size: [inches(6), inches(6.5), W - inches(3)] }],
      rate: 16,
      requiresDeploy: true,
      // While feeding, the rack slide pumps back in (6 of its 10in) to shove the pile into the Dye Rotor.
      compress: { from: 0, to: 0.6, period: 0.9 },
    },
    storage: {
      capacity: 100, // "85+ balls under the trench, 100+ with net over the bump"
      preload: 8,
      // Back wall to just past the bumper face (ahead of that the extension has no floor: FUEL rolls in under its
      // panel), up to the turret plate. The rest of a full load rides out of sight under the net.
      box: { center: [(-L / 2 + inches(1) + L / 2 + inches(4.5)) / 2, inches(8.45), 0], size: [L + inches(3.5), inches(11.5), W - inches(1.5)] },
      net: { stretch: inches(5), color: '#101114' },
      indexer: { mode: 'rotor', center: [-inches(1.5), inches(1)], rps: 2.25 },
    },
    shooter: {
      barrels: [{ exit: [0, 0, 0] }],
      angle: 60,
      hoodMin: 45,
      hoodMax: 76,
      // The hood side plates nest into the turret base when stowed (binder Q&A), under the TRENCH arm.
      hoodStowsIdle: true,
      hoodStowAngle: -10, // folds ~47° back from a 60° shot
      minSpeed: 4,
      maxSpeed: 16,
      rate: 14,
      spread: 0.9,
      turretMin: -190,
      turretMax: 190,
      turretSpeed: 540,
      yawOffset: 0,
      sotm: true,
      sotmSkill: 0.85, // SOTM on a stiff 55.7:1 turret; world champion shooting from anywhere
    },
    climber: null,
    source: 'builtin:4414',
  },
  build() {
    const kit = new Kit('4414-ripcurrent');
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [-inches(5), -W / 2 + inches(4.5)] });
    const y0 = base.railTop;
    const dark = mat(DARK, { metal: 0.45, rough: 0.45 });

    // ---------- drivetrain: teal pre-drilled tube with chamfered corners + rotor cross rails
    const tealTube = mat(TEAL, { metal: 0.5, rough: 0.4 });
    for (const s of [-1, 1]) {
      kit.tube('teal_rail', [-L / 2 + inches(3), y0 - inches(0.5), s * (W / 2 - inches(1))], [L / 2 - inches(3), y0 - inches(0.5), s * (W / 2 - inches(1))], undefined, undefined, tealTube);
      kit.tube('teal_cross', [s * inches(5.5), y0 - inches(0.5), -W / 2 + inches(2)], [s * inches(5.5), y0 - inches(0.5), W / 2 - inches(2)], undefined, undefined, tealTube);
      for (const sx of [-1, 1]) {
        const c = kit.box('chamfer', [sx * (L / 2 - inches(1.8)), y0 - inches(0.5), s * (W / 2 - inches(1.8))], [inches(4), inches(1), inches(2)], tealTube);
        c.rotation.y = (sx * s * Math.PI) / 4;
      }
    }

    // ---------- structural bumper walls (binder "Bumpers"): .033 dark hopper panels riveted to bent aluminum on the
    // bumper backing, a teal pocketed truss rim along the top of the back and sides, full-height teal truss towers at
    // the chamfered back corners, and a carbon-fiber strip where the extension slides in.
    const wallTop = H - inches(0.2);
    const wallH = wallTop - y0;
    const wy = y0 + wallH / 2;
    const CH = inches(3); // rear chamfer
    const panel = mat(0x3d424a, { opacity: 0.68, rough: 0.3, metal: 0.15 });
    const rimH = inches(1.6);
    const rivetM = mat(0x9da3aa, { metal: 0.8, rough: 0.3 });
    const rivetRow = (name: string, a: [number, number, number], b: [number, number, number], n: number) => {
      for (let k = 0; k <= n; k++) {
        const u = k / n;
        kit.cyl(`${name}_${k}`, [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], inches(0.1), inches(0.05), Math.abs(b[2] - a[2]) > Math.abs(b[0] - a[0]) ? 'x' : 'z', rivetM, undefined, 8);
      }
    };
    const sideX0 = -L / 2 + CH;
    const sideX1 = L / 2 - inches(1);
    for (const s of [-1, 1]) {
      const z = s * (W / 2 + inches(0.15));
      kit.box('wall_side', [(sideX0 + sideX1) / 2, wy, z], [sideX1 - sideX0, wallH, inches(0.06)], panel);
      // Teal truss rim along the top, from the chamfer to the carbon strip.
      kit.truss('rim_side', [sideX0, wallTop - rimH, z + s * inches(0.18)], [sideX1 - inches(3.2), wallTop - rimH, z + s * inches(0.18)], rimH, { color: TEAL, member: inches(0.22), bay: inches(1.8) });
      rivetRow(`wall_rivets_bot${s}`, [sideX0 + inches(0.6), y0 + inches(0.5), z + s * inches(0.05)], [sideX1 - inches(0.6), y0 + inches(0.5), z + s * inches(0.05)], 16);
      // Carbon-fiber end strip, riveted, where the extension slides in.
      kit.panel('cf_end', [sideX1 - inches(1.6), wy, z + s * inches(0.12)], inches(3.2), wallH, M.cf());
      rivetRow(`cf_rivets${s}`, [sideX1 - inches(0.5), y0 + inches(1), z + s * inches(0.2)], [sideX1 - inches(0.5), wallTop - inches(1), z + s * inches(0.2)], 12);
      rivetRow(`cf_rivets_b${s}`, [sideX1 - inches(2.7), y0 + inches(1), z + s * inches(0.2)], [sideX1 - inches(2.7), wallTop - inches(1), z + s * inches(0.2)], 12);
      // Chamfered rear corner: a panel framed by a full-height teal truss tower.
      const ca: [number, number, number] = [-L / 2 - inches(0.35), y0, s * (W / 2 - CH)];
      const cb: [number, number, number] = [-L / 2 + CH, y0, s * (W / 2 + inches(0.35))];
      const cp = kit.box('wall_chamfer', [(ca[0] + cb[0]) / 2, wy, (ca[2] + cb[2]) / 2], [CH * 1.45, wallH, inches(0.06)], panel);
      cp.rotation.y = s * Math.PI * 0.25;
      kit.truss('truss_chamfer', ca, cb, wallH, { color: TEAL, member: inches(0.28) });
    }
    kit.box('wall_back', [-L / 2 - inches(0.15), wy, 0], [inches(0.06), wallH, W - 2 * CH], panel);
    kit.truss('rim_back', [-L / 2 - inches(0.33), wallTop - rimH, -(W / 2 - CH)], [-L / 2 - inches(0.33), wallTop - rimH, W / 2 - CH], rimH, { color: TEAL, member: inches(0.22), bay: inches(1.8) });
    rivetRow('wall_rivets_back', [-L / 2 - inches(0.2), y0 + inches(0.5), -(W / 2 - CH - inches(0.5))], [-L / 2 - inches(0.2), y0 + inches(0.5), W / 2 - CH - inches(0.5)], 18);
    kit.sponsors('fabworks', [-L / 2 - inches(0.2), wallTop - inches(5), 0], inches(10), inches(2.6), ['fabworks'], 'zy', -1, undefined, '#c9ced4');
    // Green status LED strip along the top of the left wall.
    kit.led('led_strip', [(sideX0 + sideX1) / 2, wallTop + inches(0.1), -(W / 2 + inches(0.3))], [sideX1 - sideX0 - inches(4), inches(0.25), inches(0.3)], 0x39ff5a);

    // ---------- turret plate (binder "Turret"): a keyhole of pocketed plate, the bearing ring around the turret plus an
    // arm back to a crossbar on the back wall, under the rim. The shooter rides the X-contact bearing on the rotor column.
    const deckY = TP[1] - inches(0.4);
    const key = new THREE.Shape();
    key.absarc(0, 0, inches(7.4), 0, Math.PI * 2, false);
    const keyHole = new THREE.Path();
    keyHole.absarc(0, 0, inches(5.2), 0, Math.PI * 2, true);
    key.holes.push(keyHole);
    const keyGeo = new THREE.ExtrudeGeometry(key, { depth: inches(0.19), bevelEnabled: false, curveSegments: 40 });
    keyGeo.rotateX(-Math.PI / 2);
    keyGeo.translate(TP[0], deckY, TP[2]);
    kit.add(new THREE.Mesh(keyGeo, dark), 'deck_ring');
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      kit.cyl(`deck_slot_${k}`, [TP[0] + Math.cos(a) * inches(6.3), deckY + inches(0.2), TP[2] + Math.sin(a) * inches(6.3)], inches(0.18), inches(0.03), 'y', mat(0x0d0e10), undefined, 8);
    }
    kit.pocketPlate('deck_arm', [(TP[0] - inches(7) - L / 2) / 2, deckY + inches(0.1), TP[2]], -L / 2 - TP[0] + inches(7), inches(5), { color: DARK, plane: 'xz', cell: inches(1.8), rib: inches(0.3) });
    kit.pocketPlate('deck_cross', [-L / 2 + inches(1.6), deckY + inches(0.1), 0], inches(3.2), W - 2 * CH, { color: DARK, plane: 'xz', cell: inches(1.8), rib: inches(0.3) });

    // ---------- extending hopper + intake (binder "Intake" CAD: a U-shaped carbon-fiber box on 10DP racks)
    // The whole front of the hopper telescopes: a full-height CF front panel and two tall side panels slide forward on
    // the racks (through ~1.3in gaps in the bumper), overlapping the fixed smoked walls so the hopper stays closed. The
    // roller carriage rides at the foot of the side panels; stowed it sits up behind the front panel, above the bumper
    // (inside the starting perimeter), and on deploy it drops to the carpet ahead of the bumper.
    // Built in the deployed pose; the stowed pose is set by shifting the slide back EXT and lifting the carriage LIFT.
    const slide = kit.group('slide');
    const drop = kit.group('intake_carriage', slide);
    const bt = inches(3.5); // bumper thickness
    const bumperTop = inches(2.5) + inches(5.5);
    const face = L / 2 + bt; // front bumper face
    const nose = face + EXT; // deployed front panel; stowed it's flush with the bumper face
    const bx0 = nose - inches(15); // rear edge of the extension sides (still overlaps the fixed walls when deployed)
    const boxTop = wallTop - inches(0.6);
    const extPanel = mat(0x33373d, { metal: 0.55, rough: 0.4 });
    const mainC: [number, number, number] = [nose - inches(2.3), inches(2.6), 0];
    const botC: [number, number, number] = [nose - inches(0.9), inches(1.05), 0];
    const mouthTop = bumperTop + inches(1.5); // FUEL rolls in under the front panel
    const zs = W / 2 - inches(0.25);
    // Extension side panels: tall at the back, with the binder's scooped cutout toward the front panel.
    const sidePts: [number, number][] = [
      [bx0, bumperTop + inches(0.3)],
      [nose, bumperTop + inches(0.3)],
      [nose, boxTop - inches(2.5)],
      [nose - inches(4), boxTop - inches(2.5)],
      [nose - inches(6.5), boxTop],
      [bx0, boxTop],
    ];
    // Roller carriage side plates (carry the roller bearings) from the carpet up past the bumper line.
    const plateTop = bumperTop + inches(2);
    const plateBack = nose - inches(5);
    const plateFront = nose + inches(0.4);
    const platePts: [number, number][] = [
      [plateBack, plateTop],
      [plateBack, inches(0.9)],
      [plateFront - inches(0.8), inches(0.6)],
      [plateFront, inches(1.6)],
      [plateFront, plateTop],
    ];
    const extrude = (pts: [number, number][], z: number) => {
      const sh = new THREE.Shape();
      sh.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) sh.lineTo(q[0], q[1]);
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: inches(0.12), bevelEnabled: false });
      geo.translate(0, 0, z - inches(0.06));
      return geo;
    };
    for (const s of [-1, 1]) {
      const z = s * zs;
      kit.add(new THREE.Mesh(extrude(sidePts, z), extPanel), `ext_side_${s}`, slide);
      // Rivet rows along the top and front edges of the extension sides.
      for (let k = 0; k < 9; k++) kit.cyl(`ext_rivet_top_${s}_${k}`, [bx0 + inches(0.8) + k * ((nose - inches(7) - bx0) / 8), boxTop - inches(0.5), z + s * inches(0.08)], inches(0.1), inches(0.05), 'z', rivetM, slide, 8);
      for (let k = 0; k < 7; k++) kit.cyl(`ext_rivet_nose_${s}_${k}`, [nose - inches(0.6), mouthTop + inches(0.8) + k * ((boxTop - inches(3.5) - mouthTop) / 6), z + s * inches(0.08)], inches(0.11), inches(0.05), 'z', rivetM, slide, 8);
      kit.add(new THREE.Mesh(extrude(platePts, z - s * inches(0.35)), M.cf()), `intake_plate_${s}`, drop);
      // Riveted aluminum edge angle along the bottom of the extension + the front edge.
      kit.box(`ext_angle_bot_${s}`, [(bx0 + nose) / 2, bumperTop + inches(0.6), z - s * inches(0.35)], [nose - bx0, inches(0.6), inches(0.6)], M.anodBlack(), slide);
      kit.box(`ext_angle_nose_${s}`, [nose - inches(0.35), (mouthTop + boxTop - inches(2.5)) / 2, z - s * inches(0.35)], [inches(0.6), boxTop - inches(2.5) - mouthTop, inches(0.6)], M.anodBlack(), slide);
      // Oversized bent aluminum impact guard on the outside of the carriage (slides along the field perimeter).
      kit.box(`impact_guard_${s}`, [nose - inches(2.4), inches(3.6), s * (zs + inches(0.25))], [inches(5.2), inches(4.4), inches(0.12)], M.anodBlack(), drop);
      for (const [c, r] of [
        [mainC, inches(0.55)],
        [botC, inches(0.4)],
      ] as const) kit.cyl(`ext_bearing_${s}`, [c[0], c[1], s * (zs + inches(0.12))], r, inches(0.12), 'z', M.steel(), drop, 16);
      // 2× X60 on the carriage plates (3.45:1 belt to the main roller).
      const mp: [number, number] = [nose - inches(3.9), bumperTop + inches(0.4)];
      kit.motor(`intake_x60_${s}`, [mp[0], mp[1], s * (zs - inches(1.4))], 'z', drop);
      kit.pulley(`intake_pulley_m_${s}`, [mp[0], mp[1], s * (zs - inches(0.6))], inches(0.6), { parent: drop, color: 0x2a2c31 });
      kit.pulley(`intake_pulley_r_${s}`, [mainC[0], mainC[1], s * (zs - inches(0.6))], inches(1.2), { parent: drop, color: 0x2a2c31, spokes: 5 });
      kit.belt(`intake_belt_a_${s}`, [mp[0] - inches(0.6), mp[1]], [mainC[0] - inches(1.2), mainC[1]], s * (zs - inches(0.6)), drop);
      kit.belt(`intake_belt_b_${s}`, [mp[0] + inches(0.6), mp[1]], [mainC[0] + inches(1.2), mainC[1]], s * (zs - inches(0.6)), drop);
      // 10DP racks (doubled 0.25in polycarbonate) running back through the bumper gaps into the frame.
      const rz = s * (W / 2 - inches(1.6));
      const r0 = L / 2 - inches(9) + EXT;
      const r1 = plateBack;
      kit.box(`rack_${s}`, [(r0 + r1) / 2, inches(5.2), rz], [r1 - r0, inches(0.9), inches(0.5)], M.black(), slide);
      const nT = Math.floor((r1 - r0) / inches(0.65));
      for (let k = 0; k < nT; k++) kit.box(`rack_tooth_${s}_${k}`, [r0 + inches(0.4) + k * inches(0.65), inches(5.75), rz], [inches(0.25), inches(0.25), inches(0.5)], M.black(), slide);
      kit.motor(`rack_x44_${s}`, [L / 2 - inches(3), inches(7.5), s * (W / 2 - inches(3))], 'y', undefined, true);
      kit.pulley(`rack_pinion_${s}`, [L / 2 - inches(3), inches(6.2), rz], inches(0.6), { color: 0x2a2c31 });
    }
    // Full-width CF front panel over the intake mouth, with the binder's center cutout for extra capacity.
    const fpTop = boxTop - inches(2.5);
    const cut = inches(12);
    for (const s of [-1, 1]) kit.box(`ext_front_${s}`, [nose - inches(0.05), (mouthTop + fpTop) / 2, s * (zs + cut / 2) / 2], [inches(0.1), fpTop - mouthTop, zs - cut / 2], extPanel, slide);
    kit.box('ext_front_mid', [nose - inches(0.05), (mouthTop + fpTop - inches(3)) / 2, 0], [inches(0.1), fpTop - inches(3) - mouthTop, cut], extPanel, slide);
    kit.box('ext_front_lip', [nose - inches(0.3), mouthTop, 0], [inches(0.6), inches(0.5), 2 * zs], M.anodBlack(), slide);
    // 3in main roller + 1.5in bottom roller (X44 1.5:1) low between the plates, dark grip tubing.
    kit.tubeRoller('intake_main', mainC[0], mainC[1], -zs + inches(0.4), zs - inches(0.4), inches(1.5), 0x34383f, drop);
    kit.tubeRoller('intake_bottom', botC[0], botC[1], -zs + inches(0.4), zs - inches(0.4), inches(0.75), 0x2a2d33, drop);
    kit.motor('intake_x44', [botC[0] - inches(1.6), botC[1] + inches(2.6), -(zs - inches(1.4))], 'z', drop, true);
    kit.belt('intake_bot_belt', [botC[0] - inches(1.6), botC[1] + inches(2.6)], [botC[0], botC[1]], -(zs - inches(0.6)), drop);
    // Stowed pose: everything on the slide back by EXT, the carriage lifted above the bumper behind the front panel.
    for (const c of slide.children) if (c !== drop) c.position.x -= EXT;
    for (const c of drop.children) {
      c.position.x -= EXT;
      c.position.y += LIFT;
    }

    // ---------- Dye Rotor (V10): spoked pan, curved wall on standoffs, center tower, spiral hook
    const ry = y0 + inches(0.4);
    const rotor = kit.group('dye_rotor');
    kit.cyl('rotor_pan', [ROTOR[0], ry, ROTOR[2]], inches(10.4), inches(0.2), 'y', dark, rotor, 56);
    // Raised paddle fins that sweep FUEL around (visible when the rotor turns).
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.3;
      kit.box(`rotor_fin_${k}`, [ROTOR[0] + Math.cos(a) * inches(6.5), ry + inches(1.4), ROTOR[2] + Math.sin(a) * inches(6.5)], [inches(7), inches(2.4), inches(0.3)], mat(0xd8dde2, { metal: 0.3, rough: 0.4 }), rotor, [0, -a, 0]);
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      kit.box(`rotor_spoke_${k}`, [ROTOR[0] + Math.cos(a) * inches(5.5), ry + inches(0.25), ROTOR[2] + Math.sin(a) * inches(5.5)], [inches(9.8), inches(0.35), inches(0.5)], k % 2 ? mat(0x2b2e34, { metal: 0.4 }) : mat(TEAL, { metal: 0.5, rough: 0.35 }), rotor, [0, -a, 0]);
    }
    const ringGeo = new THREE.TorusGeometry(inches(7), inches(0.25), 6, 48);
    const ring = new THREE.Mesh(ringGeo, mat(0x2b2e34, { metal: 0.4 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(ROTOR[0], ry + inches(0.3), ROTOR[2]);
    kit.add(ring, 'rotor_ring', rotor);
    // Stationary curved outer wall (≈270°) on standoffs + base plate.
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(inches(10.8), inches(10.8), inches(4.5), 56, 1, true, 0.6, Math.PI * 1.5), mat(0x23262b, { metal: 0.3, rough: 0.55 }));
    (wall.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    wall.position.set(ROTOR[0], ry + inches(2.3), ROTOR[2]);
    kit.add(wall, 'rotor_wall');
    for (let k = 0; k < 12; k++) {
      const a = 0.6 + (k / 11) * Math.PI * 1.5;
      kit.standoff('rotor_standoff', [ROTOR[0] + Math.cos(a) * inches(11.1), ry, ROTOR[2] + Math.sin(a) * inches(11.1)], [ROTOR[0] + Math.cos(a) * inches(11.1), ry + inches(4.5), ROTOR[2] + Math.sin(a) * inches(11.1)]);
    }
    // Center tower: stacked omni wheels + ring structure, turret column above.
    kit.cyl('tower_core', [ROTOR[0], ry + inches(3.5), ROTOR[2]], inches(2.3), inches(6.5), 'y', dark, undefined, 24);
    for (let k = 0; k < 3; k++) kit.omni(`tower_omni_${k}`, [ROTOR[0] + inches(2.4), ry + inches(1.6 + k * 1.9), ROTOR[2] - inches(1.4)], inches(1.5), inches(0.9), 'x', undefined, 0x30333a);
    // Spiral hook with passive omni rollers rising toward the turret feed.
    const hook = kit.group('hook');
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * 1.15 + k * 0.22;
      const rr = inches(7.6) - k * inches(0.45);
      kit.omni(`hook_omni_${k}`, [ROTOR[0] + Math.cos(a) * rr, ry + inches(2) + k * inches(0.55), ROTOR[2] + Math.sin(a) * rr], inches(0.62), inches(0.5), 'y', hook, 0x3a3d44);
      kit.box(`hook_rail_${k}`, [ROTOR[0] + Math.cos(a) * (rr + inches(0.9)), ry + inches(2) + k * inches(0.55), ROTOR[2] + Math.sin(a) * (rr + inches(0.9))], [inches(1.4), inches(0.25), inches(0.3)], dark, hook, [0, -a, 0]);
    }
    kit.cyl('ttb_wheel_a', [ROTOR[0] - inches(3), ry + inches(7.5), ROTOR[2] - inches(2)], inches(1.5), inches(1.1), 'z', mat(0x9a6a3a, { rough: 0.7 }));
    kit.cyl('ttb_wheel_b', [ROTOR[0] - inches(3), ry + inches(7.5), ROTOR[2] - inches(4)], inches(1.5), inches(1.1), 'z', mat(0x9a6a3a, { rough: 0.7 }));
    // Three rotor motors (Krakens with Talon FX) standing at the rotor edge.
    for (let k = 0; k < 3; k++) kit.motor(`rotor_motor_${k}`, [ROTOR[0] + inches(4 + k * 1.2), ry + inches(1.4), ROTOR[2] + inches(9.5 - k * 2.6)], 'y');

    // ---------- turret (binder "Shooter V11" / "Turret"): feed column up from the rotor to the X-contact bearing, a
    // turret base with the 4× X44 stacked on the flywheel axis, and the A-frame hood. The hood side plates are trussed
    // arches carrying a hood roller at the apex, driven by dual GT2 belts running up their legs; they pivot about the
    // 3in copper-weighted flywheel and nest into the base when stowed. Turret: 55.7:1 on one X44, cable chain on a
    // constant-force-spring tensioner.
    kit.cyl('turret_column', [TP[0], (ry + inches(6.5) + TP[1]) / 2, TP[2]], inches(2.6), TP[1] - ry - inches(6.5), 'y', dark, undefined, 24);
    for (let k = 0; k < 4; k++) kit.omni(`column_omni_${k}`, [TP[0] + inches(2.4), ry + inches(7.5) + k * inches(1.6), TP[2]], inches(0.7), inches(0.6), 'z', undefined, 0x30333a);
    kit.bearingRing('turret_bearing', [TP[0], TP[1], TP[2]], inches(4.6), undefined, 0x2a2c31);
    const turretG = kit.group('t_turret');
    // Turret base: ring plate with the big spur gear under it and a low U-cradle the hood nests into.
    const tb = new THREE.Shape();
    tb.absarc(0, 0, inches(5.6), 0, Math.PI * 2, false);
    const bh = new THREE.Path();
    bh.absarc(0, 0, inches(3.2), 0, Math.PI * 2, true);
    tb.holes.push(bh);
    const baseGeo = new THREE.ExtrudeGeometry(tb, { depth: inches(0.25), bevelEnabled: false, curveSegments: 40 });
    baseGeo.rotateX(-Math.PI / 2);
    baseGeo.translate(TP[0], TP[1] + inches(0.35), TP[2]);
    kit.add(new THREE.Mesh(baseGeo, dark), 't_plate', turretG);
    kit.cyl('t_gear', [TP[0], TP[1] - inches(0.2), TP[2]], inches(5.3), inches(0.28), 'y', mat(0x3a3d42, { metal: 0.6, rough: 0.35 }), turretG, 64);
    for (const s of [-1, 1]) {
      const z = TP[2] + s * inches(2.55);
      const cr = new THREE.Shape();
      cr.moveTo(TP[0] - inches(4.6), TP[1] + inches(0.6));
      cr.lineTo(FW[0] + inches(1.6), TP[1] + inches(0.6));
      cr.lineTo(FW[0] + inches(1.6), FW[1] + inches(0.4));
      cr.absarc(FW[0], FW[1], inches(1.6), 0, Math.PI, false);
      cr.lineTo(TP[0] - inches(4.6), FW[1] - inches(0.6));
      cr.closePath();
      const cg = new THREE.ExtrudeGeometry(cr, { depth: inches(0.19), bevelEnabled: false });
      cg.translate(0, 0, z - inches(0.095));
      kit.add(new THREE.Mesh(cg, dark), `t_cradle_${s}`, turretG);
    }
    // 4× Kraken X44 stacked on the flywheel axis outboard of the cradle, the turret X44 and the hood X44.
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) kit.motor(`t_fly_x44_${s}${k}`, [FW[0] - inches(0.2), FW[1] - inches(0.4), TP[2] + s * inches(3.6 + k * 1.5)], 'z', turretG, true);
    kit.motor('t_turret_x44', [TP[0] - inches(4), TP[1] - inches(1.4), TP[2] + inches(3.6)], 'y', turretG, true);
    kit.motor('t_hood_x44', [TP[0] - inches(3.2), TP[1] + inches(1.4), TP[2] - inches(3.6)], 'z', turretG, true);
    kit.sectorPlate('t_hood_sector', [FW[0], FW[1], TP[2] - inches(2.95)], inches(3.2), Math.PI * 0.55, Math.PI * 1.2, { parent: turretG, color: 0x9aa0a8, teeth: 20 });
    // 3in flywheel: urethane stealth wheels with .25in copper mass disks.
    const fly = kit.group('t_flywheel', turretG);
    kit.cyl('t_fly_body', FW, inches(1.5), inches(4), 'z', mat(0x111213, { rough: 0.9 }), fly, 28);
    for (const k of [-1.2, 0, 1.2]) kit.cyl('t_fly_copper', [FW[0], FW[1], FW[2] + k * inches(1)], inches(1.42), inches(0.25), 'z', M.copper(), fly, 28);
    // Hood: two trussed arch side plates (A-frame), apex hood roller, GT2 belts up the legs.
    const hood = kit.group('t_hood', turretG);
    const legF: [number, number] = [FW[0], FW[1]]; // front leg foot = the flywheel axis
    const legB: [number, number] = [FW[0] - inches(6.4), FW[1] - inches(0.2)];
    const apex: [number, number] = [FW[0] - inches(2.6), FW[1] + inches(6.2)];
    for (const s of [-1, 1]) {
      const z = TP[2] + s * inches(2.4);
      const arch = new THREE.Shape();
      const w = inches(0.75);
      arch.moveTo(legB[0] - w / 2, legB[1]);
      arch.quadraticCurveTo(legB[0] - inches(0.6), apex[1] + inches(0.4), apex[0], apex[1] + w);
      arch.quadraticCurveTo(legF[0] + inches(1.3), apex[1] + inches(0.4), legF[0] + w, legF[1]);
      arch.lineTo(legF[0] - w / 2, legF[1]);
      arch.quadraticCurveTo(legF[0] + inches(0.2), apex[1] - inches(1.4), apex[0], apex[1] - inches(0.5));
      arch.quadraticCurveTo(legB[0] + inches(0.6), apex[1] - inches(1.4), legB[0] + w / 2, legB[1]);
      arch.closePath();
      const ag = new THREE.ExtrudeGeometry(arch, { depth: inches(0.125), bevelEnabled: false, curveSegments: 14 });
      ag.translate(0, 0, z - inches(0.06));
      kit.add(new THREE.Mesh(ag, dark), `t_aframe_${s}`, hood);
      // Truss webbing inside the arch.
      for (let k = 0; k < 4; k++) {
        const u = (k + 0.5) / 4;
        const px = legB[0] + (legF[0] - legB[0]) * u;
        const py = legB[1] + Math.sin(u * Math.PI) * (apex[1] - legB[1]) * 0.78;
        kit.box(`t_web_${s}${k}`, [px, (py + legB[1]) / 2 + inches(0.3), z], [inches(0.22), py - legB[1], inches(0.12)], dark, hood, [0, 0, (k % 2 ? 1 : -1) * 0.5]);
      }
      kit.belt(`t_belt_f_${s}`, [legF[0], legF[1]], [apex[0], apex[1]], z + s * inches(0.18), hood);
      kit.belt(`t_belt_b_${s}`, [legB[0], legB[1]], [apex[0], apex[1]], z + s * inches(0.18), hood);
      kit.pulley(`t_apex_pulley_${s}`, [apex[0], apex[1], z + s * inches(0.28)], inches(0.75), { parent: hood, color: 0x2a2c31, spokes: 3 });
      kit.pulley(`t_back_pulley_${s}`, [legB[0], legB[1], z + s * inches(0.28)], inches(0.6), { parent: hood, color: 0x2a2c31 });
    }
    kit.cyl('t_apex_shaft', [apex[0], apex[1], TP[2]], inches(0.25), inches(5.4), 'z', M.steel(), hood, 8);
    const hoodRoller = kit.tubeRoller('t_hood_roller', apex[0], apex[1], TP[2] - inches(2), TP[2] + inches(2), inches(0.9), 0x1a1b1e, hood);
    kit.cyl('t_back_shaft', [legB[0], legB[1], TP[2]], inches(0.25), inches(5.4), 'z', M.steel(), hood, 8);
    // Sushi-wheel feeder (3× 1in) up the back of the chute, and the turret Limelight on the base.
    for (let k = 0; k < 3; k++) kit.cyl(`t_sushi_${k}`, [TP[0] + inches(1.2), TP[1] + inches(0.9) + k * inches(0.05), TP[2] - inches(1.2) + k * inches(1.2)], inches(0.5), inches(0.7), 'z', mat(0x2a8a4a, { rough: 0.6 }), turretG, 12);
    kit.camera('t_camera', [TP[0] - inches(4.4), TP[1] + inches(1.4), TP[2] + inches(2.2)], Math.PI, turretG);
    // Cable chain from the turret base to the wall, on its constant-force-spring flex-wheel tensioner.
    kit.box('cable_chain', [TP[0] - inches(5.5), TP[1] - inches(0.9), TP[2] + inches(3)], [inches(1), inches(0.8), inches(6)], M.black(), undefined, [0, 0.6, 0]);
    kit.cyl('cable_tensioner', [TP[0] - inches(7.5), TP[1] - inches(0.9), TP[2] + inches(5.5)], inches(0.8), inches(0.6), 'y', mat(0x2a2c31, { rough: 0.6 }), undefined, 16);

    // ---------- hopper net (binder: "100+ with net over the bump"): over the hopper ahead of the turret, under the rim.
    const netX0 = TP[0] + inches(7.6);
    const netX1 = L / 2 + inches(3.2);
    kit.box('hopper_net_top', [(netX0 + netX1) / 2, wallTop - inches(0.2), 0], [netX1 - netX0, 0.003, W - inches(0.6)], M.net());

    // ---------- battery at the very left edge (split rail), cameras, LEDs
    kit.box('battery_lead_pos', [-inches(4), y0 + inches(8), -W / 2 + inches(4)], [inches(6), inches(0.4), inches(0.4)], mat(0xd02020));
    kit.camera('cam_front', [L / 2 - inches(1), H - inches(1.5), W / 2 - inches(3)], 0);
    kit.camera('cam_back', [-L / 2 + inches(1), H - inches(1.5), -W / 2 + inches(3)], Math.PI);

    rig.joint({ id: 'slide', type: 'prismatic', driver: 'intake-deploy', pivot: [0, 0, 0], axis: [1, 0, 0], stowed: 0, active: EXT, speed: 0.8 }, slide);
    rig.joint({ id: 'carriage', type: 'prismatic', driver: 'intake-deploy', parent: 'slide', pivot: [0, 0, 0], axis: [0, 1, 0], stowed: 0, active: -LIFT, speed: 0.7 }, drop);
    rig.joint({ id: 'rotor', type: 'spin', driver: 'indexer', pivot: [ROTOR[0], 0, ROTOR[2]], axis: [0, 1, 0], speed: 810 }, rotor);
    rig.joint({ id: 'turret', type: 'revolute', driver: 'turret', pivot: TP, axis: [0, 1, 0], speed: 540 }, turretG);
    // Hood joint: 0 = the modeled 60° pose; +folds back into the base. Launch 45°→76° maps to +10°→−10.7°.
    const sh = r4414.def.shooter!;
    rig.joint({ id: 'hood', type: 'revolute', driver: 'hood', parent: 'turret', pivot: FW, axis: [0, 0, 1], stowed: (60 - sh.hoodMin!) * HOOD_K, active: (60 - sh.hoodMax!) * HOOD_K, speed: 300 }, hood);
    rig.joint({ id: 'flywheel', type: 'spin', driver: 'shooter-wheel', parent: 'turret', pivot: FW, axis: [0, 0, -1], speed: 4200 }, fly);
    rig.joint({ id: 'hood_roller', type: 'spin', driver: 'shooter-wheel', parent: 'hood', pivot: [apex[0], apex[1], TP[2]], axis: [0, 0, 1], speed: 3000 }, hoodRoller);

    const exit: [number, number, number] = [FW[0] + inches(1.2), FW[1] + inches(2.4), TP[2]];
    const shooter = { ...r4414.def.shooter!, barrels: [{ exit, pivot: TP }] };
    const zones = [{ center: [mainC[0] + inches(1.2), inches(3), 0] as [number, number, number], size: [inches(6), inches(6), W] as [number, number, number] }];
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { shooter, intake: { ...r4414.def.intake!, zones } } };
  },
};
