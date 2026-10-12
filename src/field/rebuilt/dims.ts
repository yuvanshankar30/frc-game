/**
 * 2026 REBUILT field dimensions, from the 2026 FRC Game Manual (Section 5, ARENA).
 * All values in meters. Values marked `approx` are placements only shown in drawings.
 *
 * Field frame: +X points from the BLUE alliance wall toward the RED alliance wall,
 * +Y is up, +Z spans the field width. Origin is the field center on the carpet.
 * The RED half is the BLUE half rotated 180° about the Y axis.
 */
import { inches } from '../../util/units';

export const FIELD = {
  length: inches(651.2),
  width: inches(317.7),
  guardrailHeight: inches(20),
  allianceZoneDepth: inches(158.6),
  neutralZoneDepth: inches(283),
  tapeWidth: inches(2),
  allianceWallHeight: inches(78), // approx (driver station wall incl. polycarb)
};

export const HUB = {
  footprint: inches(47),
  openingHeight: inches(72),
  openingDiameter: inches(41.7), // hexagonal opening, across flats
  /** HUB center, from the blue wall (WPILib AprilTags 18-21 / 24-27). */
  centerFromWall: inches(182.11),
  /** FUEL exit on the NEUTRAL ZONE face. */
  exitWidth: inches(35.6),
  exitHeight: inches(30.1),
  /** Net behind the HUB (NEUTRAL ZONE side) that catches overshots. */
  netWidth: inches(58.4),
  netOffset: inches(10.3),
  get centerX() {
    return -FIELD.length / 2 + this.centerFromWall;
  },
};

export const BUMP = {
  width: inches(73), // across the field (Z)
  depth: inches(44.4), // along the field (X)
  height: inches(6.513),
  rampAngleDeg: 15,
};

export const TRENCH = {
  width: inches(65.65),
  depth: inches(47),
  height: inches(40.25),
  clearWidth: inches(50.34),
  clearHeight: inches(22.25),
};

export const DEPOT = {
  width: inches(42),
  depth: inches(27),
  barrierWidth: inches(3),
  barrierHeight: inches(1),
  fuel: 24,
  /** Along the alliance wall; centre measured from the field drawing (WPILib y ≈ 232.7in). */
  centerZ: -inches(232.7 - 158.85),
};

export const OUTPOST = {
  areaWidth: inches(71),
  feedWidth: inches(31.8),
  feedHeight: inches(7),
  feedBottom: inches(28.1),
  corralWidth: inches(32),
  corralBottom: inches(1.88),
  chuteFuel: 24,
  /** Centered on AprilTag 29 (WPILib y = 26.22in). */
  centerZ: -inches(26.22 - 158.85),
};

export const TOWER = {
  width: inches(49.25),
  depth: inches(45),
  height: inches(78.25),
  baseWidth: inches(39),
  baseDepth: inches(45.18),
  baseHeight: inches(1), // approx plate thickness
  uprightHeight: inches(72.1),
  uprightThickness: inches(1.5),
  uprightDepth: inches(3.5),
  uprightSpacing: inches(32.25),
  rungDiameter: inches(1.66),
  rungHeights: [inches(27), inches(45), inches(63)] as const,
  rungOverhang: inches(5.875),
  /** Centered on AprilTag 31 (WPILib y = 147.47in), against the alliance wall. */
  centerZ: -inches(147.47 - 158.85),
  /** Rungs run parallel to the alliance wall at this distance from it (field drawing). */
  rungX: inches(41),
};

export const FUEL = {
  diameter: inches(5.91),
  radius: inches(5.91) / 2,
  mass: 0.215,
  preloadMax: 8,
  neutralZoneCount: 360,
};

export const ROBOT_RULES = {
  maxPerimeter: inches(110),
  maxHeight: inches(30),
  maxExtension: inches(12),
  bumperZoneBottom: inches(2.5),
  bumperZoneTop: inches(5.75),
  maxBumperThickness: inches(4),
  maxMassWithBumpers: 61.23,
};

/**
 * Lateral placement of the bump/trench line, mirrored to both sides of each HUB.
 * The trench underpass is centered on AprilTags 17/22/23/28 (25.37in from the guardrail).
 */
export const LANE = {
  bumpCenterZ: HUB.footprint / 2 + BUMP.width / 2,
  trenchClearCenterZ: FIELD.width / 2 - TRENCH.clearWidth / 2,
  /** Inner post of the trench, between the underpass and the bump. */
  trenchPostInner: FIELD.width / 2 - TRENCH.clearWidth,
  trenchPostOuter: FIELD.width / 2 - TRENCH.width,
};

/** Starting FUEL grid in the NEUTRAL ZONE (from the field drawing: 12 along X by 30 along Z). */
export const NEUTRAL_FUEL = { cols: 12, rows: 30, spacing: inches(6) };
