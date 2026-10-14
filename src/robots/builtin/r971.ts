import * as THREE from 'three';
import { Kit, M, mat } from './kit';
import { swerveBase, groundIntake, intakeGearbox, Rig, type BuiltinRobot } from './common';
import { inches } from '../../util/units';
import { TURN_RATE, TURN_ACCEL } from '../../robot/schema';

/**
 * 971 Spartan Robotics — Mixtape.
 * Sources: 971 "2026 Second Robot Technical Documentation" (Mixtape · FRC 971), robot photo, released Onshape CAD
 * (top / iso / side / front / rear views), robot code github.com/frc971/971-second-robot-2026.
 *  - Drivetrain: rectangular swerve on SDS MK5, 25 × 30in "to fit turrets and climber", split brainpan, bottom-mounted
 *    battery on a pivoting flap, EVA foam bumpers with a fillet, superstructure mounted off the drivetrain tubes.
 *  - Layout (CAD): a silver aluminum truss deck (X-braced side plates, triangle-pocketed rails) over the rear half
 *    carries both turrets side by side; the tall smoked-polycarb hopper fills the front half, its top stepping down
 *    toward the turrets, and its front section slides out past the bumper with the intake.
 *  - Climber: one-stage telescoping arm to LEVEL 1 between the turrets, curved string-tensioned hook, 60:1 MAX
 *    Planetary on an X44; split bumper gap lets the hook reach the tower.
 *  - Ground intake (slapdown, 1678-inspired): single 1/16in-wall beater bar, SplineXL jackshaft driven by a central
 *    1:45 pivot gearbox over #35 chain, SRPP bars, 1/4in aluminum kicker plate; it pushes the hopper out.
 *  - Indexer + hopper: roller floor (X60 1:1), powered separator — two omni-wheel clusters splitting FUEL into two
 *    paths (X60 1:4), 1.25in kicker roller (X60 1:1) into each shooter, top roller against jams, 1/16in polycarb walls.
 *  - Turrets: two, each on an X44 with a 14:200 belt reduction, 10in ID X-contact bearings, custom 124T aluminum
 *    spur gear. Mixtape aims from any heading (the second robot's released code limits its turrets to ±95°).
 *  - Shooter: 4in 60A neoprene flywheels on two X60 (1:1), 50° range-of-motion arc hood (three curved bands on spoked
 *    side frames) on a lead screw (X44, 3:1), 1.25in kicker under the flywheels, 3/16in aluminum plates, PAHT-CF backing.
 *  - Capacity / BPS are estimates (~50 FUEL modeled, ~20 BPS from both turrets).
 */
const L = inches(25);
const W = inches(30);
const H = inches(21.5);
const TR = inches(5.4); // turret bearing radius (10in ID X-contact)
const DECK = inches(10); // top of the silver truss deck the turrets sit on
const DECK_X1 = -L / 2 + inches(12.6); // front edge of the deck = back of the hopper
const TZ = inches(7.6);
const TL_P: [number, number, number] = [-L / 2 + inches(6.2), DECK + inches(0.5), -TZ];
const TR_P: [number, number, number] = [-L / 2 + inches(6.2), DECK + inches(0.5), TZ];
const BOX_X0 = DECK_X1;
const BOX_X1 = L / 2 - inches(0.5);
const HOP_TOP = H - inches(0.4);
const EXT = inches(12); // hopper extension past the frame (reference: well out over the intake)
const ALU = 0xa9b0b8;
const SPONSORS = ['WCP', 'Qualcomm', 'J&J', 'Apple', 'INTUITIVE', 'Google', 'NASA', 'In Memory of Zach Marks', 'The Mintz Family'];

const hopperPanel = () => mat(0xc9d0d8, { opacity: 0.28, rough: 0.06 });

/** Flat panel from a polygon in the XY plane (robot side walls), at depth z. */
function polyPanel(kit: Kit, name: string, pts: [number, number][], z: number, material: THREE.Material, parent?: THREE.Object3D) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]);
  sh.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), material);
  m.position.z = z;
  return kit.add(m, name, parent);
}

/** Hole-punched aluminum edge rail between two points (XY at depth z). */
function edgeRail(kit: Kit, name: string, a: [number, number], b: [number, number], z: number, parent?: THREE.Object3D) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const m = kit.box(name, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z], [len, inches(0.7), inches(0.7)], M.alu(), parent);
  m.rotation.z = Math.atan2(dy, dx);
  const n = Math.floor(len / inches(1.5));
  const hole = mat(0x3a3e44, { rough: 1 });
  for (let k = 1; k < n; k++) {
    const t = k / n;
    kit.cyl(`${name}_hole${k}`, [a[0] + dx * t, a[1] + dy * t, z + Math.sign(z || 1) * inches(0.36)], inches(0.1), inches(0.02), 'z', hole, parent, 6);
  }
  return m;
}

/** Aluminum X-braced side plate (outline + two diagonals) in the XY ('xy') or ZY ('zy') plane. */
function xPanel(kit: Kit, name: string, c: [number, number, number], w: number, h: number, plane: 'xy' | 'zy', parent?: THREE.Object3D) {
  const g = kit.group(name, parent);
  const a = mat(ALU, { metal: 0.75, rough: 0.35 });
  const t = inches(0.125);
  const b = inches(0.6);
  const box = (n: string, u: number, v: number, du: number, dv: number, rot = 0) =>
    kit.box(n, plane === 'xy' ? [c[0] + u, c[1] + v, c[2]] : [c[0], c[1] + v, c[2] + u], plane === 'xy' ? [du, dv, t] : [t, dv, du], a, g, plane === 'xy' ? [0, 0, rot] : [-rot, 0, 0]);
  box(`${name}_top`, 0, h / 2 - b / 2, w, b);
  box(`${name}_bot`, 0, -h / 2 + b / 2, w, b);
  box(`${name}_l`, -w / 2 + b / 2, 0, b, h);
  box(`${name}_r`, w / 2 - b / 2, 0, b, h);
  const d = Math.hypot(w - b, h - b);
  const ang = Math.atan2(h - b, w - b);
  box(`${name}_d1`, 0, 0, d, b * 0.8, ang);
  box(`${name}_d2`, 0, 0, d, b * 0.8, -ang);
  return g;
}

/** One Mixtape turret + arc-hood shooter (shooter points +X at joint value 0). */
function turretAssembly(kit: Kit, name: string, p: [number, number, number]) {
  const [px, py, pz] = p;
  const tg = kit.group(`${name}_turret`);
  const dark = mat(0x18191c, { metal: 0.4, rough: 0.5 });
  const outer = Math.sign(pz) || 1;
  // Fixed: X-contact bearing + X44 pinion drive (14:200 belt reduction).
  kit.bearingRing(`${name}_bearing`, [px, py, pz], TR, undefined, 0x8d939b);
  kit.motor(`${name}_x44`, [px + inches(2.5), py - inches(1.4), pz + outer * (TR + inches(0.4))], 'y', undefined, true);
  // Rotating: custom 124T spur gear (pocketed, as seen from the top) + deck.
  const gearG = kit.group(`${name}_gear_g`, tg);
  gearG.position.set(px, py + inches(0.35), pz);
  gearG.rotation.x = -Math.PI / 2;
  kit.sectorPlate(`${name}_gear124`, [0, 0, 0], TR + inches(0.85), 0, Math.PI * 2, { parent: gearG, teeth: 62, t: inches(0.25), color: 0xc2c7cd });
  kit.pulley(`${name}_gear_web`, [0, 0, inches(0.13)], TR + inches(0.2), { parent: gearG, spokes: 8, t: inches(0.04), color: 0x6d737b });
  kit.cyl(`${name}_deck`, [px, py + inches(0.65), pz], inches(4.2), inches(0.19), 'y', dark, tg, 32);
  // Black shooter side plates + PAHT-CF backing.
  const flyC: [number, number, number] = [px + inches(0.4), py + inches(5.2), pz];
  for (const s of [-1, 1]) {
    kit.pocketPlate(`${name}_plate${s}`, [px - inches(0.4), py + inches(3.4), pz + s * inches(2.5)], inches(7), inches(5.6), { color: ALU, parent: tg, cell: inches(1.3), rib: inches(0.3), t: inches(0.1875) });
  }
  kit.box(`${name}_backing`, [px - inches(3.6), py + inches(3.6), pz], [inches(0.35), inches(5.6), inches(4.6)], mat(0x2b2b2b, { rough: 0.85 }), tg);
  // Flywheel: 4in 60A neoprene, two X60s direct on the shaft (the big black cans on each side).
  const fly = kit.group(`${name}_flywheel`, tg);
  kit.cyl(`${name}_fly_shaft`, flyC, inches(0.25), inches(5.4), 'z', M.steel(), fly, 8);
  for (let k = -1; k <= 1; k++) kit.cyl(`${name}_neoprene${k}`, [flyC[0], flyC[1], pz + k * inches(1.35)], inches(2), inches(1.1), 'z', mat(0x15161a, { rough: 0.95 }), fly, 28);
  for (const s of [-1, 1]) {
    kit.cyl(`${name}_fly_x60${s}`, [flyC[0], flyC[1], pz + s * inches(3.9)], inches(1.25), inches(2.2), 'z', mat(0x1c1d21, { metal: 0.45, rough: 0.4 }), tg, 24);
    kit.cyl(`${name}_fly_x60cap${s}`, [flyC[0], flyC[1], pz + s * inches(5.05)], inches(0.7), inches(0.15), 'z', mat(0xd8dadc, { metal: 0.6, rough: 0.3 }), tg, 16);
  }
  // 1.25in kicker under the flywheel.
  const kickC: [number, number, number] = [flyC[0] - inches(2), flyC[1] - inches(2.6), pz];
  const kicker = kit.tubeRoller(`${name}_kicker`, kickC[0], kickC[1], pz - inches(2.1), pz + inches(2.1), inches(0.625), 0x9aa1aa, tg);
  // Arc hood: three curved bands over the top/back of the flywheel on spoked side frames, pivoting on the flywheel
  // axis (50° of travel on a lead screw).
  const hoodPivot = flyC;
  const hood = kit.group(`${name}_hood`, tg);
  const HR = inches(4.4);
  const bandM = mat(0x16171a, { rough: 0.6 });
  for (const dz of [-1.6, 0, 1.6]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(HR, inches(0.32), 6, 28, 1.95), bandM);
    band.position.set(flyC[0], flyC[1], pz + inches(dz));
    band.rotation.z = 0.6;
    kit.add(band, `${name}_hood_band`, hood);
  }
  for (const s of [-1, 1]) {
    const zz = pz + s * inches(2.3);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(HR + inches(0.2), inches(0.18), 4, 28, 1.95), dark);
    rim.position.set(flyC[0], flyC[1], zz);
    rim.rotation.z = 0.6;
    kit.add(rim, `${name}_hood_rim`, hood);
    for (let k = 0; k < 5; k++) {
      const a = 0.6 + (k / 4) * 1.95;
      kit.box(`${name}_hood_spoke${k}`, [flyC[0] + Math.cos(a) * HR * 0.55, flyC[1] + Math.sin(a) * HR * 0.55, zz], [HR * 0.9, inches(0.3), inches(0.18)], dark, hood, [0, 0, a]);
    }
  }
  kit.cyl(`${name}_leadscrew`, [px - inches(3.2), py + inches(4.5), pz - outer * inches(1.4)], inches(0.16), inches(5), 'y', M.steel(), tg, 8);
  kit.motor(`${name}_hood_x44`, [px - inches(3.2), py + inches(1.6), pz - outer * inches(1.4)], 'y', tg, true);
  kit.camera(`${name}_cam`, [px + inches(3.4), py + inches(1.6), pz], 0, tg);
  return { tg, fly, flyC, kicker, kickC, hood, hoodPivot, exit: [flyC[0] + inches(2.8), flyC[1] + inches(3.6), pz] as [number, number, number] };
}

export const r971: BuiltinRobot = {
  def: {
    id: 'builtin-971',
    name: 'Mixtape',
    team: '971',
    author: 'Spartan Robotics',
    color: '#2f5fd8',
    description:
      'Two independent turrets side by side on a silver truss deck, each on a 10in X-contact bearing with a 124T spur gear, 4in neoprene flywheels and a curved lead-screw arc hood. Twin omni-wheel separators split FUEL from a powered roller floor into two streams. A tall polycarb hopper extension stands well out over a 1678-style slapdown, with a grid net across the top, and a telescoping arm between the turrets climbs LEVEL 1.',
    highlights: ['Dual independent turrets, aim from any heading', 'Omni-wheel separator → two streams', 'Slapdown intake slides the hopper out', 'Shoot-on-the-move', 'LEVEL 1 telescoping climber', 'Fits under the TRENCH'],
    sources: ['971 Mixtape Technical Documentation 2026 (drivetrain, climber, intake, indexer, turrets, shooter)', '971 Onshape CAD release (top / iso / side / front / rear views)', 'github.com/frc971/971-second-robot-2026 (robot code + photo)'],
    frame: { length: L, width: W, height: H, mass: 59, comHeight: 0.16, bumperThickness: inches(3.5), bumperHeight: inches(5) },
    drivetrain: { type: 'swerve', maxSpeed: 4.5, maxAccel: 10, maxOmega: TURN_RATE, maxAlpha: TURN_ACCEL },
    intake: {
      zones: [{ center: [L / 2 + inches(7.5), inches(3.5), 0], size: [inches(6), inches(7), W - inches(2)] }],
      rate: 14,
      requiresDeploy: true,
      // "Juice" (Superstructure.java): the pivot pumps between deployed and 55° of its 72° travel every second.
      compress: { from: 0, to: 55 / 72, period: 1 },
    },
    storage: {
      capacity: 50,
      preload: 8,
      box: { center: [(BOX_X0 + BOX_X1) / 2 + inches(2.25), inches(12.2), 0], size: [BOX_X1 - BOX_X0 + inches(3.5), inches(17.5), W - inches(2)] },
      net: { stretch: inches(3), color: '#15171b' },
    },
    shooter: {
      barrels: [{ exit: [0, 0, 0] }, { exit: [0, 0, 0] }],
      angle: 60,
      hoodMin: 30,
      hoodMax: 80,
      minSpeed: 4,
      maxSpeed: 15,
      rate: 20,
      spread: 1.0,
      // Mixtape's turrets reach the HUB from any heading, so the drivetrain never turns to aim. (The second robot's
      // released code stops each at ±95°; Mixtape's own limits aren't published.)
      turretMin: -180,
      turretMax: 180,
      turretSpeed: 600,
      // The turret model points +X at joint 0, but Mixtape's shooter faces the rear of the robot.
      yawOffset: 180,
      sotm: true,
      sotmSkill: 0.75, // code leads turret, hood and flywheel by robot velocity (ShooterHandler)
    },
    climber: { maxLevel: 1, climbTime: 2.6, canAutoClimb: true },
    source: 'builtin:971',
  },
  build() {
    const kit = new Kit('971-mixtape');
    const rig = new Rig();
    const base = swerveBase(kit, rig, L, W, { electronics: [inches(5), inches(6)] });
    const y0 = base.railTop;
    const alu = mat(ALU, { metal: 0.75, rough: 0.35 });

    // ---------- silver truss deck over the rear half (carries both turrets)
    const dx0 = -L / 2 + inches(0.6);
    const dmx = (dx0 + DECK_X1) / 2;
    const dw = DECK_X1 - dx0;
    const dh = DECK - y0;
    for (const s of [-1, 1]) {
      const z = s * (W / 2 - inches(0.6));
      // Dense isogrid side plates under the turrets (bright machined aluminum, as on the robot).
      kit.latticePlate(`deck_side${s}`, [dmx, y0 + dh / 2, z], dw, dh, { cell: inches(1.35), rib: inches(0.18), t: inches(0.19) });
      kit.pocketPlate(`deck_rail${s}`, [dmx, DECK - inches(0.6), z + s * inches(0.1)], dw, inches(1.2), { color: ALU, cell: inches(0.9), rib: inches(0.22), t: inches(0.1) });
      kit.latticePlate(`deck_rear${s}`, [dx0, y0 + dh / 2, s * (W / 4 + inches(1))], W / 2 - inches(3), dh, { cell: inches(1.35), rib: inches(0.18), t: inches(0.19), plane: 'zy' });
    }
    kit.pocketPlate('deck_rail_rear', [dx0 - inches(0.1), DECK - inches(0.6), 0], W - inches(1.2), inches(1.2), { color: ALU, cell: inches(0.9), rib: inches(0.22), t: inches(0.1), plane: 'zy' });
    kit.pocketPlate('deck_rail_front', [DECK_X1, DECK - inches(0.6), 0], W - inches(1.2), inches(1.2), { color: ALU, cell: inches(0.9), rib: inches(0.22), t: inches(0.1), plane: 'zy' });
    for (const sx of [dx0, DECK_X1]) for (const s of [-1, 1]) kit.box('deck_post', [sx, y0 + dh / 2, s * (W / 2 - inches(0.6))], [inches(1), dh, inches(1)], alu);

    // ---------- tall smoked-polycarb hopper over the front half; top steps down toward the turrets
    const hz = W / 2 - inches(0.5);
    const step = inches(4);
    const backTop = HOP_TOP - inches(4.5);
    const sidePts: [number, number][] = [
      [BOX_X0, y0],
      [BOX_X1, y0],
      [BOX_X1, HOP_TOP],
      [BOX_X0 + step, HOP_TOP],
      [BOX_X0, backTop],
    ];
    for (const s of [-1, 1] as const) {
      polyPanel(kit, `hopper_side${s}`, sidePts, s * hz, hopperPanel());
      for (let k = 0; k < sidePts.length; k++) edgeRail(kit, `hopper_rail${s}_${k}`, sidePts[k], sidePts[(k + 1) % sidePts.length], s * hz);
      kit.sponsors(`sponsors_${s}`, [(BOX_X0 + BOX_X1) / 2 + inches(1), y0 + inches(8), s * (hz + inches(0.02))], BOX_X1 - BOX_X0 - inches(3), inches(9), SPONSORS, 'xy', s, undefined, '#15171b');
      // Gray X-frame stiffener on the hopper wall (CAD).
      xPanel(kit, `hopper_x${s}`, [(BOX_X0 + BOX_X1) / 2 + inches(0.5), y0 + inches(7), s * (hz - inches(0.3))], inches(3.6), inches(5.4), 'xy');
    }
    kit.box('hopper_top_x0', [BOX_X0 + step, HOP_TOP, 0], [inches(0.7), inches(0.7), 2 * hz], M.alu());
    kit.box('hopper_top_x1', [BOX_X0, backTop, 0], [inches(0.7), inches(0.7), 2 * hz], M.alu());
    // Back panel down to the deck (FUEL rolls toward the separator).
    kit.box('hopper_back', [BOX_X0 - inches(0.4), (DECK + backTop) / 2 + inches(0.5), 0], [0.003, backTop - DECK, 2 * hz], hopperPanel(), undefined, [0, 0, 0.12]);

    // ---------- hopper slide-out (front section): rides out past the bumper with the intake
    const hop = kit.group('hopper_ext');
    const ex0 = BOX_X1 - inches(1.5);
    const ex1 = BOX_X1 + EXT;
    const eyb = inches(8.6);
    for (const s of [-1, 1]) {
      const z = s * (hz - inches(0.4));
      const pts: [number, number][] = [
        [ex0, eyb],
        [ex1, eyb + inches(1.5)],
        [ex1, HOP_TOP],
        [ex0, HOP_TOP],
      ];
      polyPanel(kit, `ext_side${s}`, pts, z, hopperPanel(), hop);
      for (let k = 0; k < 3; k++) edgeRail(kit, `ext_rail${s}_${k}`, pts[k], pts[k + 1], z, hop);
      // Black curved guide plate under the slide-out (CAD side view).
      const g = new THREE.Shape();
      g.moveTo(ex0, eyb);
      g.lineTo(ex1 - inches(1), eyb + inches(1.3));
      // Its lower edge stays just above the bumper as the extension slides out over it.
      g.quadraticCurveTo(ex1 - inches(3), eyb - inches(0.6), ex1 - inches(5.5), eyb - inches(0.8));
      g.lineTo(ex0, eyb - inches(0.4));
      const gm = new THREE.Mesh(new THREE.ShapeGeometry(g), M.anodBlack());
      gm.position.z = z + s * inches(0.05);
      kit.add(gm, `ext_guide${s}`, hop);
    }
    kit.box('ext_front', [ex1, (eyb + inches(1.5) + HOP_TOP) / 2, 0], [0.003, HOP_TOP - eyb - inches(1.5), 2 * hz - inches(0.8)], hopperPanel(), hop);
    kit.box('ext_front_rail', [ex1, HOP_TOP, 0], [inches(0.7), inches(0.7), 2 * hz - inches(0.8)], M.alu(), hop);
    kit.box('ext_floor', [(ex0 + ex1) / 2, eyb + inches(0.75), 0], [ex1 - ex0, inches(0.08), 2 * hz - inches(1)], hopperPanel(), hop, [0, 0, Math.atan2(inches(1.5), ex1 - ex0)]);
    // Grid net over the whole top, hopper + extension (reference), part of the model so it shows everywhere.
    const netX0 = BOX_X0 + step;
    const netTop = kit.box('hopper_net_top', [(netX0 + ex1) / 2, HOP_TOP + inches(0.2), 0], [ex1 - netX0, 0.003, 2 * hz - inches(0.4)], M.net(), hop);
    netTop.renderOrder = 2;
    for (const s of [-1, 1]) kit.box(`hopper_net_rim${s}`, [(netX0 + ex1) / 2, HOP_TOP + inches(0.2), s * (hz - inches(0.2))], [ex1 - netX0, inches(0.4), inches(0.4)], M.alu(), hop);
    const topRoller = kit.tubeRoller('top_roller', ex1 - inches(1.5), HOP_TOP - inches(1.4), -hz + inches(1.2), hz - inches(1.2), inches(0.7), 0xb8bec5, hop);

    // ---------- indexer: roller floor → twin omni separators (split into two paths) → turret kickers
    const floor = kit.group('roller_floor');
    for (let k = 0; k < 6; k++) kit.tubeRoller(`floor_${k}`, BOX_X1 - inches(2) - k * inches(2), y0 + inches(0.8) + k * inches(0.1), -W / 2 + inches(1.5), W / 2 - inches(1.5), inches(0.6), 0x2a2d33, floor);
    kit.motor('floor_x60', [BOX_X1 - inches(5), y0 - inches(1.3), -W / 2 + inches(3)], 'y');
    const SEPX = BOX_X0 - inches(1.6);
    const seps = [-1, 1].map((s) => {
      const g = kit.group(`separator${s}`);
      for (let k = 0; k < 3; k++) kit.omni(`sep_omni${s}_${k}`, [SEPX, y0 + inches(1.5 + k * 1.6), s * inches(2.4)], inches(1.5), inches(0.9), 'y', g, 0x2a2d33);
      kit.cyl(`sep_shaft${s}`, [SEPX, y0 + inches(3), s * inches(2.4)], inches(0.25), inches(5.5), 'y', M.steel(), g, 8);
      return g;
    });
    kit.motor('sep_x60', [SEPX - inches(2), y0 - inches(1.3), 0], 'y');
    for (const s of [-1, 1]) kit.box(`split_ramp${s}`, [SEPX - inches(2.4), y0 + inches(3.2), s * inches(5)], [inches(4.5), inches(0.25), inches(5)], alu, undefined, [0, s * 0.5, 0.25]);

    // ---------- twin turrets on the deck
    const a = turretAssembly(kit, 'tl', TL_P);
    const b = turretAssembly(kit, 'tr', TR_P);
    for (const p of [TL_P, TR_P]) kit.pocketPlate('turret_base', [p[0], DECK - inches(0.05), p[2]], inches(12.4), inches(12.6), { color: ALU, plane: 'xz', cell: inches(1.6), rib: inches(0.3), t: inches(0.125) });

    // ---------- climber between the turrets: one-stage telescoping arm, curved string-tensioned hook, X44 + 60:1
    const cx = -L / 2 + inches(2.2);
    const climbTop = H - inches(2);
    for (const s of [-1, 1]) kit.pocketPlate(`climb_gusset${s}`, [cx + inches(1), DECK + inches(2.5), s * inches(1.2)], inches(4), inches(5), { color: ALU, cell: inches(1.3), rib: inches(0.28), t: inches(0.125) });
    kit.tube('climb_outer', [cx, y0, 0], [cx, climbTop, 0], [inches(1.5), inches(1.5)], undefined, alu);
    kit.motor('climb_x44', [cx + inches(2.2), y0 + inches(1.5), 0], 'y', undefined, true);
    const climb = kit.group('climber');
    kit.tube('climb_inner', [cx, y0 + inches(4), 0], [cx, climbTop + inches(1.2), 0], [inches(1.15), inches(1.15)], climb, M.anodBlack());
    const hook = new THREE.Mesh(new THREE.TorusGeometry(inches(1.5), inches(0.32), 8, 18, Math.PI * 1.15), M.anodBlack());
    hook.position.set(cx - inches(1.4), climbTop + inches(1.2), 0);
    hook.rotation.z = Math.PI * 0.05;
    kit.add(hook, 'climb_hook', climb);
    kit.cyl('climb_string', [cx - inches(0.2), climbTop - inches(5), inches(0.65)], inches(0.04), inches(12), 'y', mat(0xe8e2d0, { rough: 0.9 }), climb, 4);

    // ---------- slapdown intake (single beater bar, SplineXL jackshaft, kicker plate), dog-legs over the bumper
    const ipiv: [number, number, number] = [L / 2 - inches(2), y0 + inches(6.5), 0];
    const intake = groundIntake(kit, 'intake', { bumper: { face: L / 2 + inches(3.5), top: inches(2.56) + inches(5) }, pivot: [ipiv[0], ipiv[1]], rollerX: L / 2 + inches(3.5) + inches(3.5), rollerR: inches(1.25), width: W - inches(0.5), roller: 'silicone', wheel: 0xc0c6cd, armColor: 0x16171a, kicker: true });
    intakeGearbox(kit, 'intake', [ipiv[0], ipiv[1]], 0);
    kit.cyl('splinexl', [ipiv[0], ipiv[1], 0], inches(0.45), W - inches(2), 'z', mat(0x2b2e34, { metal: 0.6 }), intake.group, 8);

    kit.camera('cam_front', [BOX_X1 - inches(1), HOP_TOP - inches(1), 0], 0);
    kit.camera('cam_back', [-L / 2 + inches(1), DECK + inches(1), -inches(4)], Math.PI);

    // Stowed, the intake folds up inside the extension's front (under the net), not up past the top of the robot.
    rig.joint({ id: 'intake', type: 'revolute', driver: 'intake-deploy', pivot: ipiv, axis: [0, 0, 1], stowed: intake.deployAngleDeg + 72, active: 0, speed: 520 }, intake.group);
    rig.joint({ id: 'intake_roll', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.rollerCenter, axis: [0, 0, 1], speed: 2000 }, intake.roller);
    if (intake.kickerNode) rig.joint({ id: 'intake_kick', type: 'spin', driver: 'intake-roller', parent: 'intake', pivot: intake.kickerCenter!, axis: [0, 0, -1], speed: 2400 }, intake.kickerNode);
    // The extension stays out (its look in play); the intake works inside it.
    rig.joint({ id: 'hopper_ext', type: 'prismatic', driver: 'none', pivot: [0, 0, 0], axis: [1, 0, 0], stowed: 0, active: 0, speed: 0.6 }, hop);
    rig.joint({ id: 'top_roll', type: 'spin', driver: 'indexer', parent: 'hopper_ext', pivot: [ex1 - inches(1.5), HOP_TOP - inches(1.4), 0], axis: [0, 0, 1], speed: 1000 }, topRoller);
    rig.joint({ id: 'floor', type: 'spin', driver: 'indexer', pivot: [BOX_X1 - inches(2), y0 + inches(0.8), 0], axis: [0, 0, 1], speed: 1200 }, 'floor_0');
    seps.forEach((g, k) => rig.joint({ id: `separator${k}`, type: 'spin', driver: 'indexer', pivot: [SEPX, 0, (k ? 1 : -1) * inches(2.4)], axis: [0, k ? -1 : 1, 0], speed: 900 }, g));
    // Match the shooter zero to its rear-facing direction; the ±95° limits are relative to this 180° heading.
    rig.joint({ id: 'turret_l', type: 'revolute', driver: 'turret', pivot: TL_P, axis: [0, 1, 0], stowed: 180, speed: 600 }, a.tg);
    rig.joint({ id: 'turret_r', type: 'revolute', driver: 'turret', pivot: TR_P, axis: [0, 1, 0], stowed: 180, speed: 600 }, b.tg);
    for (const [t, id] of [
      [a, 'l'],
      [b, 'r'],
    ] as const) {
      rig.joint({ id: `hood_${id}`, type: 'revolute', driver: 'hood', parent: `turret_${id}`, pivot: t.hoodPivot, axis: [0, 0, 1], active: -28, speed: 200 }, t.hood);
      rig.joint({ id: `fly_${id}`, type: 'spin', driver: 'shooter-wheel', parent: `turret_${id}`, pivot: t.flyC, axis: [0, 0, -1], speed: 3600 }, t.fly);
      rig.joint({ id: `kick_${id}`, type: 'spin', driver: 'indexer', parent: `turret_${id}`, pivot: t.kickC, axis: [0, 0, -1], speed: 1500 }, t.kicker);
    }
    rig.joint({ id: 'climber', type: 'prismatic', driver: 'climber', pivot: [cx, y0, 0], axis: [0, 1, 0], active: inches(8), speed: 0.35 }, climb);

    const shooter = { ...r971.def.shooter!, barrels: [{ exit: a.exit, pivot: TL_P }, { exit: b.exit, pivot: TR_P }] };
    const zones = [{ center: [intake.rollerCenter[0] + inches(1), inches(3.5), 0] as [number, number, number], size: [inches(6), inches(7), W - inches(1)] as [number, number, number] }];
    return { model: kit.root, joints: rig.joints, parts: rig.parts, patch: { shooter, intake: { ...r971.def.intake!, zones } } };
  },
};
