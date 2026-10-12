import type { Action, GamepadBindings, KeyboardBindings } from './bindings';
import { ACTIONS } from './bindings';

/** One frame of driver input in the reference (camera / driver station) frame. */
export interface DriverState {
  /** -1..1 forward relative to the reference direction. */
  x: number;
  /** -1..1 right relative to the reference direction. */
  z: number;
  /** -1..1 rotation, positive = CCW (turn left). */
  rot: number;
  held: Record<Action, boolean>;
  pressed: Record<Action, boolean>;
}

const emptyActions = () => Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<Action, boolean>;

/** Tracks raw keyboard state globally. */
class KeyboardState {
  down = new Set<string>();
  private attached = false;

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  any(codes: string[]) {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export const keyboard = new KeyboardState();

export type DeviceSpec = { kind: 'keyboard'; bindings: KeyboardBindings } | { kind: 'gamepad'; index: number; bindings: GamepadBindings };

/** Reads one driver's controls from a keyboard binding set or a gamepad. */
export class DriverInput {
  private prev = emptyActions();
  constructor(public device: DeviceSpec) {
    keyboard.attach();
  }

  read(): DriverState {
    const held = emptyActions();
    let x = 0;
    let z = 0;
    let rot = 0;
    const d = this.device;
    if (d.kind === 'keyboard') {
      const k = d.bindings;
      x = +keyboard.any(k.axes.forward) - +keyboard.any(k.axes.back);
      z = +keyboard.any(k.axes.right) - +keyboard.any(k.axes.left);
      rot = +keyboard.any(k.axes.rotLeft) - +keyboard.any(k.axes.rotRight);
      for (const a of ACTIONS) held[a] = keyboard.any(k.actions[a]);
    } else {
      const pad = navigator.getGamepads?.()[d.index];
      if (pad) {
        const dz = d.bindings.deadzone;
        const ax = (i: number) => {
          const v = pad.axes[i] ?? 0;
          return Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz);
        };
        x = -ax(1);
        z = ax(0);
        rot = -ax(2);
        for (const a of ACTIONS) held[a] = d.bindings.actions[a].some((b) => (pad.buttons[b]?.value ?? 0) > 0.4);
      }
    }
    const pressed = emptyActions();
    for (const a of ACTIONS) pressed[a] = held[a] && !this.prev[a];
    this.prev = held;
    return { x, z, rot, held, pressed };
  }
}

export function connectedGamepads(): { index: number; id: string }[] {
  const pads = navigator.getGamepads?.() ?? [];
  const out: { index: number; id: string }[] = [];
  for (const p of pads) if (p) out.push({ index: p.index, id: p.id });
  return out;
}
