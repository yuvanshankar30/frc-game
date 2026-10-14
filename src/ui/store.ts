import { create } from 'zustand';
import {
  BINDINGS_VERSION, DEFAULT_GAMEPAD, DEFAULT_KEYBOARD, DEFAULT_KEYBOARD_P2, type GamepadBindings, type KeyboardBindings,
} from '../core/input/bindings';
import type { Alliance, AllianceScore, RankingPoints } from '../game/scoring';
import type { Phase } from '../game/MatchController';
import type { CameraMode } from '../render/cameras';
import { kvGet, kvSet } from '../cad/storage';

export type Screen = 'menu' | 'select' | 'game' | 'editor' | 'settings' | 'garage';
export type GameMode = 'match' | 'practice' | 'twoPlayer';

export interface PlayerSetup {
  robotId: string;
  alliance: Alliance;
  /** 'keyboard', 'keyboard2' or 'gamepad:<index>' */
  device: string;
  station: number;
}

export interface Settings {
  keyboard: KeyboardBindings;
  keyboard2: KeyboardBindings;
  gamepad: GamepadBindings;
  driveFrame: 'camera' | 'driver-station';
  defaultCamera: CameraMode;
  assist: boolean;
  shadows: boolean;
  pixelRatio: number;
  antialias: boolean;
  volume: number;
  autoTeleopGap: number;
  /** Seconds for keyboard rotation to ramp to full (smooths digital keys). */
  rotationRamp: number;
  /** Swerve/mecanum hold their heading when not rotating (resists bumps and pushes). */
  headingHold: boolean;
  /** Show the minimap. */
  minimap: boolean;
  /** Expert mode: no aim assist or heading hold; the driver revs the flywheel and runs the indexer by hand. */
  expert: boolean;
  bindingsVersion: number;
}

export const DEFAULT_SETTINGS: Settings = {
  keyboard: DEFAULT_KEYBOARD,
  keyboard2: DEFAULT_KEYBOARD_P2,
  gamepad: DEFAULT_GAMEPAD,
  driveFrame: 'camera',
  defaultCamera: 'chase',
  assist: true,
  shadows: true,
  pixelRatio: 2,
  antialias: true,
  volume: 0.6,
  autoTeleopGap: 3,
  rotationRamp: 0.18,
  headingHold: true,
  minimap: true,
  expert: false,
  bindingsVersion: BINDINGS_VERSION,
};

export interface PlayerHud {
  robotName: string;
  team: string;
  alliance: Alliance;
  stored: number;
  capacity: number;
  climbLevel: number;
  climbState: string;
  /** Highest LEVEL this robot can climb to right now (LEVEL 1 in AUTO). */
  maxClimb: number;
  canClimb: boolean;
  aimOk: boolean;
  /** Out of its ALLIANCE ZONE: the shooter lobs FUEL home instead of at the HUB. */
  shuttling: boolean;
  distance: number;
  camera: CameraMode;
  assist: boolean;
  shots: number;
  scored: number;
  /** Shots fired / made while driving or turning. */
  movingShots: number;
  movingScored: number;
  intaked: number;
  /** Intake / shooter activity (0..1) and readiness, for status lights. */
  intaking: number;
  spin: number;
  ready: boolean;
  /** Balls per second over the last second. */
  bps: number;
  speed: number;
  /** Seconds until this player's HUB flips (Infinity if not in a shift cycle). */
  hubFlip: number;
  /** Inside its own ALLIANCE ZONE (where shots can reach the HUB past the net). */
  inZone: boolean;
}

export interface Hud {
  phase: Phase;
  shift: number;
  clock: number;
  phaseRemaining: number;
  hubActive: Record<Alliance, boolean>;
  score: Record<Alliance, AllianceScore & { total: number }>;
  outpost: Record<Alliance, number>;
  players: PlayerHud[];
  fps: number;
  mode: GameMode;
  paused: boolean;
  banner: string | null;
  /** Elapsed match time in seconds (for the shift timeline). */
  matchTime: number;
  firstInactive: Alliance | null;
  autoTeleopGap: number;
  results: null | {
    winner: Alliance | 'tie';
    rp: Record<Alliance, RankingPoints>;
  };
}

interface Store {
  screen: Screen;
  mode: GameMode;
  players: PlayerSetup[];
  settings: Settings;
  hud: Hud | null;
  /** Robot id selected in the garage/editor. */
  editingRobot: string | null;
  setScreen: (s: Screen) => void;
  setMode: (m: GameMode) => void;
  setPlayers: (p: PlayerSetup[]) => void;
  setSettings: (s: Partial<Settings>) => void;
  setHud: (h: Hud | null) => void;
  setEditingRobot: (id: string | null) => void;
}

export const useStore = create<Store>((set, get) => ({
  screen: 'menu',
  mode: 'match',
  players: [{ robotId: 'builtin-4414', alliance: 'blue', device: 'keyboard', station: 1 }],
  settings: DEFAULT_SETTINGS,
  hud: null,
  editingRobot: null,
  setScreen: (screen) => set({ screen }),
  setMode: (mode) => set({ mode }),
  setPlayers: (players) => {
    set({ players });
    void kvSet('players', players);
  },
  setSettings: (s) => {
    const settings = { ...get().settings, ...s };
    set({ settings });
    void kvSet('settings', settings);
  },
  setHud: (hud) => set({ hud }),
  setEditingRobot: (editingRobot) => set({ editingRobot }),
}));

/** Load persisted settings (merged with defaults so new fields get values). */
export async function loadPersisted() {
  const s = await kvGet<Partial<Settings>>('settings');
  if (s && (s.bindingsVersion ?? 1) < BINDINGS_VERSION) {
    // Default controls changed (J/L rotate): drop stale keyboard bindings.
    delete s.keyboard;
    delete s.keyboard2;
    s.bindingsVersion = BINDINGS_VERSION;
  }
  if (s) {
    useStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        ...s,
        keyboard: { actions: { ...DEFAULT_KEYBOARD.actions, ...s.keyboard?.actions }, axes: { ...DEFAULT_KEYBOARD.axes, ...s.keyboard?.axes } },
        keyboard2: { actions: { ...DEFAULT_KEYBOARD_P2.actions, ...s.keyboard2?.actions }, axes: { ...DEFAULT_KEYBOARD_P2.axes, ...s.keyboard2?.axes } },
        gamepad: { ...DEFAULT_GAMEPAD, ...s.gamepad, actions: { ...DEFAULT_GAMEPAD.actions, ...s.gamepad?.actions } },
      },
    });
  }
  const p = await kvGet<PlayerSetup[]>('players');
  if (p && p.length) useStore.setState({ players: p });
}
