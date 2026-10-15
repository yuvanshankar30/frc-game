import { z } from 'zod';

/**
 * RobotDefinition: everything the sim needs to know about a robot, independent of its meshes.
 *
 * Robot frame: +X forward, +Y up, +Z to the robot's right. Origin is the center of the
 * frame footprint on the floor. Lengths in meters, angles in degrees (converted at runtime).
 */

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

/**
 * Default swerve turn rate and angular acceleration, from released 2026 code: 1678 runs 11.0 rad/s at 50 rad/s², 2910
 * its max speed over the wheelbase radius (~14.6 rad/s). Robots without published numbers get ~1.6 rot/s.
 */
export const TURN_RATE = 10; // rad/s (~1.6 rot/s): top 2026 swerves run 11-15 (1678 11.0, 2910 ~14.6 from code)
export const TURN_ACCEL = 40; // rad/s² (1678: 50)

export const JOINT_DRIVERS = [
  'none',
  'intake-deploy',
  'intake-roller',
  'indexer',
  'shooter-wheel',
  'turret',
  'hood',
  'climber',
  'lift',
  'wheel',
  'steer',
] as const;
export type JointDriver = (typeof JOINT_DRIVERS)[number];

export const jointSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  /** revolute: value in degrees; prismatic: value in meters; spin: continuous rotation (deg/s at full activity) */
  type: z.enum(['revolute', 'prismatic', 'spin']),
  driver: z.enum(JOINT_DRIVERS).default('none'),
  /** Parent joint id; the joint's pivot moves with its parent. Null = chassis. */
  parent: z.string().nullable().default(null),
  pivot: vec3.default([0, 0, 0]),
  axis: vec3.default([0, 0, 1]),
  /** Value when the driver is idle. */
  stowed: z.number().default(0),
  /** Value when the driver is fully active (ignored for turret/hood, which follow the aim). */
  active: z.number().default(0),
  /** Max rate: deg/s for revolute & spin, m/s for prismatic. */
  speed: z.number().positive().default(180),
});
export type JointDef = z.infer<typeof jointSchema>;

export const partSchema = z.object({
  /** Unique node name in the robot model. */
  node: z.string(),
  /** Joint id this part moves with, or null for the chassis. */
  joint: z.string().nullable().default(null),
});
export type PartDef = z.infer<typeof partSchema>;

export const boxSchema = z.object({
  center: vec3,
  size: vec3,
});
export type BoxDef = z.infer<typeof boxSchema>;

export const robotSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string(),
  name: z.string(),
  team: z.string().default(''),
  author: z.string().default(''),
  description: z.string().default(''),
  /** Where the stats came from (binder, reveal thread, CAD release...). */
  sources: z.array(z.string()).default([]),
  /** Human-readable highlights shown on the robot select card. */
  highlights: z.array(z.string()).default([]),
  /** Accent color used in menus. */
  color: z.string().default('#888888'),

  frame: z.object({
    /** Frame perimeter, without bumpers. length = along X (forward), width = along Z. */
    length: z.number().positive(),
    width: z.number().positive(),
    /** Overall height of the robot in its starting configuration. */
    height: z.number().positive(),
    bumperThickness: z.number().nonnegative().default(0.0826),
    bumperBottom: z.number().nonnegative().default(0.065),
    bumperHeight: z.number().positive().default(0.127),
    mass: z.number().positive().default(58),
    /** Center of mass height above the floor. */
    comHeight: z.number().positive().default(0.18),
    wheelRadius: z.number().positive().default(0.0508),
    /** Inset of wheel centers from the frame edges. */
    wheelInset: z.number().nonnegative().default(0.07),
  }),

  drivetrain: z.object({
    type: z.enum(['swerve', 'tank', 'mecanum']),
    maxSpeed: z.number().positive().default(4.5),
    maxAccel: z.number().positive().default(9),
    maxOmega: z.number().positive().default(TURN_RATE),
    maxAlpha: z.number().positive().default(TURN_ACCEL),
  }),

  intake: z
    .object({
      /** Boxes in the robot frame where FUEL gets captured while intaking (e.g. front + side intakes). */
      zones: z.array(boxSchema).min(1),
      /** FUEL per second the intake can swallow. */
      rate: z.number().positive().default(12),
      /** If true, the intake only works once the deploy joint is (mostly) out. */
      requiresDeploy: z.boolean().default(true),
      /** Once deployed the intake latches out for the rest of the match (e.g. 4414's steel latches). */
      latch: z.boolean().default(false),
      /**
       * While feeding (and not intaking), the deploy joints push into the hopper to crowd FUEL toward the indexer:
       * positions are fractions of the travel from deployed (0) to stowed (1). With `period` > 0 they pump between
       * `from` and `to` (971 "juice", 1678 contract-hopper); with 0 they hold at `to` (2910 retract-while-shooting).
       */
      compress: z
        .object({ from: z.number().min(0).max(1).default(0), to: z.number().min(0).max(1), period: z.number().nonnegative().default(0) })
        .nullable()
        .default(null),
    })
    .nullable()
    .default(null),

  storage: z.object({
    capacity: z.number().int().nonnegative().default(30),
    preload: z.number().int().nonnegative().max(8).default(8),
    /** Hopper volume (robot frame) used to draw the FUEL being carried. */
    box: boxSchema.nullable().default(null),
    /** How the indexer moves carried FUEL while feeding: a spinning rotor/spindexer (swirl about `center`, robot-frame x,z) or a floor that drives toward the shooter. */
    indexer: z.object({ mode: z.enum(['rotor', 'floor']).default('floor'), center: z.tuple([z.number(), z.number()]).default([0, 0]), rps: z.number().default(2.25) }).nullable().default(null),
    /** Net over the hopper: FUEL can push it up by `stretch` meters above the box top (drawn draped over the pile). */
    net: z.object({ stretch: z.number().nonnegative().default(0.12), color: z.string().default('#15171b') }).nullable().default(null),
  }),

  shooter: z
    .object({
      /**
       * Each barrel is one FUEL lane: `exit` is where FUEL leaves the robot (robot frame, turret at 0°),
       * `pivot` is the turret axis it swings around. Wide drums use several lanes; twin turrets use two.
       */
      barrels: z.array(z.object({ exit: vec3, pivot: vec3.default([0, 0, 0]) })).min(1),
      /** Launch elevation in degrees. If a hood exists, it ranges over [hoodMin, hoodMax]. */
      angle: z.number().default(55),
      hoodMin: z.number().nullable().default(null),
      hoodMax: z.number().nullable().default(null),
      minSpeed: z.number().positive().default(4),
      maxSpeed: z.number().positive().default(14),
      /** FUEL per second. */
      rate: z.number().positive().default(6),
      /** Random spread (degrees, 1σ). */
      spread: z.number().nonnegative().default(1.2),
      /** Turret yaw limits in degrees (relative to forward). Null = fixed shooter. */
      turretMin: z.number().nullable().default(null),
      turretMax: z.number().nullable().default(null),
      turretSpeed: z.number().positive().default(360),
      /** Shooter pointing direction at turret 0, yaw degrees relative to robot forward (180 = shoots backward). */
      yawOffset: z.number().default(0),
      /** Shoot-on-the-move: aim compensates for robot velocity. */
      sotm: z.boolean().default(false),
      /**
       * How well the shot holds up while the robot drives / turns (0–1). Motion adds aim and speed error (localization
       * lag, chassis vibration, turret / hood tracking); 1 is an elite shoot-on-the-move robot, 0 one that has to stop.
       */
      sotmSkill: z.number().min(0).max(1).default(0.5),
      /** Fastest the robot may drive (m/s) and still take a HUB shot (its code's gate); null = no limit. Passing is never limited. */
      maxScoreSpeed: z.number().positive().nullable().default(null),
      /** The hood folds down to its lowest angle whenever the robot isn't shooting. */
      hoodStowsIdle: z.boolean().default(false),
      /** With hoodStowsIdle: the angle (deg, may be under hoodMin) the hood folds to when idle; default hoodMin. */
      hoodStowAngle: z.number().nullable().default(null),
    })
    .nullable()
    .default(null),

  climber: z
    .object({
      maxLevel: z.number().int().min(0).max(3),
      /** Seconds for the climb animation to reach the max level. */
      climbTime: z.number().positive().default(4),
      /** Whether this robot can climb in AUTO (only LEVEL 1 counts in AUTO). */
      canAutoClimb: z.boolean().default(true),
    })
    .nullable()
    .default(null),

  /**
   * A part that rises above the frame in play (a telescoping hopper roof, say) and tucks down to clear the TRENCH when
   * the robot nears one. Its height is real: raised, it hits the TRENCH arm. Joints with the 'lift' driver follow it.
   */
  lift: z
    .object({
      /** Travel when raised (m). */
      height: z.number().positive(),
      /** Top of the lifting part (hooks included) when down, robot frame (m); defaults to frame.height. */
      top: z.number().positive().nullable().default(null),
      /** Travel when tucked for the TRENCH (m). */
      trench: z.number().nonnegative().default(0),
      /** Tuck when within this distance of a TRENCH and driving toward it (m). */
      distance: z.number().positive().default(1.5),
      /** Travel speed (m/s). */
      speed: z.number().positive().default(0.3),
      /**
       * 'raised': up whenever it can be (tucked only for the TRENCH). 'expand': an expanding hopper (1678): down until
       * the hopper is full, then it rises to make room for up to `capacity` FUEL, and it follows the pile back down as
       * the robot shoots. It can only tuck as low as the FUEL it's holding allows.
       */
      mode: z.enum(['raised', 'expand']).default('raised'),
      /** 'expand' mode: FUEL held with it fully raised (storage.capacity is with it down). */
      capacity: z.number().int().nonnegative().nullable().default(null),
    })
    .nullable()
    .default(null),

  joints: z.array(jointSchema).default([]),
  parts: z.array(partSchema).default([]),

  /** Model placement: applied to the imported model root before part mapping. */
  model: z
    .object({
      position: vec3.default([0, 0, 0]),
      rotation: vec3.default([0, 0, 0]), // euler degrees, order YXZ (yaw applied after the up-axis fix)
      scale: z.number().positive().default(1),
    })
    .default({ position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 }),

  /** 'builtin:<id>' for procedural robots, 'package' for meshes from a .frcbot. */
  source: z.string().default('package'),
});

export type RobotDefinition = z.infer<typeof robotSchema>;
export type RobotDefinitionInput = z.input<typeof robotSchema>;

export function parseRobot(data: unknown): RobotDefinition {
  return robotSchema.parse(data);
}

export interface RuleCheck {
  level: 'error' | 'warn';
  message: string;
}

/** Light rules check against the 2026 robot construction rules. */
export function checkRules(def: RobotDefinition): RuleCheck[] {
  const out: RuleCheck[] = [];
  const perim = 2 * (def.frame.length + def.frame.width);
  if (perim > 2.794 + 1e-3) out.push({ level: 'warn', message: `Frame perimeter ${(perim / 0.0254).toFixed(1)}in exceeds 110in (R104)` });
  if (def.frame.height > 0.762 + 1e-3) out.push({ level: 'warn', message: `Height ${(def.frame.height / 0.0254).toFixed(1)}in exceeds 30in (R107)` });
  if (def.frame.bumperThickness > 0.1016 + 1e-3) out.push({ level: 'warn', message: 'Bumpers thicker than 4in (R403)' });
  if (def.frame.mass > 61.23 + 0.1) out.push({ level: 'warn', message: 'Mass over 135lb with bumpers (R408)' });
  const ids = new Set<string>();
  for (const j of def.joints) {
    if (ids.has(j.id)) out.push({ level: 'error', message: `Duplicate joint id "${j.id}"` });
    ids.add(j.id);
  }
  for (const j of def.joints) {
    if (j.parent && !ids.has(j.parent)) out.push({ level: 'error', message: `Joint "${j.id}" has unknown parent "${j.parent}"` });
  }
  for (const p of def.parts) {
    if (p.joint && !ids.has(p.joint)) out.push({ level: 'error', message: `Part "${p.node}" mapped to unknown joint "${p.joint}"` });
  }
  return out;
}
