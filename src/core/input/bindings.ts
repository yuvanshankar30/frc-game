/** Digital actions a driver can trigger. Analog drive axes are handled separately. */
export const ACTIONS = ['shoot', 'intake', 'climb', 'feed', 'eject', 'reset', 'camera', 'pause', 'assist'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  shoot: 'Shoot (hold)',
  intake: 'Intake (hold)',
  climb: 'Climb / descend',
  feed: 'Request human player FUEL',
  eject: 'Eject FUEL (outtake)',
  reset: 'Reset robot',
  camera: 'Cycle camera',
  pause: 'Pause',
  assist: 'Toggle aim assist',
};

export const AXES = ['forward', 'back', 'left', 'right', 'rotLeft', 'rotRight'] as const;
export type AxisKey = (typeof AXES)[number];

export const AXIS_LABELS: Record<AxisKey, string> = {
  forward: 'Drive forward',
  back: 'Drive back',
  left: 'Strafe left',
  right: 'Strafe right',
  rotLeft: 'Rotate left',
  rotRight: 'Rotate right',
};

export interface KeyboardBindings {
  actions: Record<Action, string[]>;
  axes: Record<AxisKey, string[]>;
}

export interface GamepadBindings {
  /** Standard-mapping button indices. */
  actions: Record<Action, number[]>;
  deadzone: number;
}

export const DEFAULT_KEYBOARD: KeyboardBindings = {
  actions: {
    shoot: ['Space'],
    intake: ['ShiftLeft', 'KeyJ'],
    climb: ['KeyC'],
    feed: ['KeyF'],
    eject: ['KeyX'],
    reset: ['KeyR'],
    camera: ['KeyV'],
    pause: ['Escape', 'KeyP'],
    assist: ['KeyT'],
  },
  axes: {
    forward: ['KeyW'],
    back: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    rotLeft: ['KeyQ', 'ArrowLeft'],
    rotRight: ['KeyE', 'ArrowRight'],
  },
};

/** Second keyboard player (local 2P without gamepads). */
export const DEFAULT_KEYBOARD_P2: KeyboardBindings = {
  actions: {
    shoot: ['Enter', 'NumpadEnter'],
    intake: ['ShiftRight', 'Numpad0'],
    climb: ['Slash', 'Numpad5'],
    feed: ['Period', 'Numpad3'],
    eject: ['Comma', 'Numpad1'],
    reset: ['Backspace'],
    camera: ['Backslash'],
    pause: [],
    assist: ['Quote'],
  },
  axes: {
    forward: ['KeyI', 'Numpad8'],
    back: ['KeyK', 'Numpad2'],
    left: ['KeyJ', 'Numpad4'],
    right: ['KeyL', 'Numpad6'],
    rotLeft: ['KeyU', 'Numpad7'],
    rotRight: ['KeyO', 'Numpad9'],
  },
};

// Standard gamepad: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 12-15 dpad
export const DEFAULT_GAMEPAD: GamepadBindings = {
  actions: {
    shoot: [7, 5],
    intake: [6, 4],
    climb: [3],
    feed: [2],
    eject: [1],
    reset: [8],
    camera: [12],
    pause: [9],
    assist: [13],
  },
  deadzone: 0.12,
};

export const GAMEPAD_BUTTON_NAMES = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home',
];

export function keyLabel(code: string) {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code;
  return code.replace('Left', ' L').replace('Right', ' R');
}
