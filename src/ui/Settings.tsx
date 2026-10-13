import { useEffect, useState } from 'react';
import { useStore, DEFAULT_SETTINGS, type Settings } from './store';
import {
  ACTIONS, ACTION_LABELS, AXES, AXIS_LABELS, GAMEPAD_BUTTON_NAMES, keyLabel, DEFAULT_KEYBOARD, DEFAULT_KEYBOARD_P2, DEFAULT_GAMEPAD,
  type Action, type AxisKey, type KeyboardBindings,
} from '../core/input/bindings';
import { CAMERA_LABELS, CAMERA_MODES } from '../render/cameras';

type Listen = { set: 'keyboard' | 'keyboard2'; kind: 'action' | 'axis'; key: string } | { set: 'gamepad'; key: Action } | null;

export function SettingsScreen() {
  const { settings, setSettings, setScreen } = useStore();
  const [listen, setListen] = useState<Listen>(null);
  const [kbSet, setKbSet] = useState<'keyboard' | 'keyboard2'>('keyboard');

  // Capture the next key / button press for rebinding.
  useEffect(() => {
    if (!listen) return;
    if (listen.set !== 'gamepad') {
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape' && !(listen.kind === 'action' && listen.key === 'pause')) {
          setListen(null);
          return;
        }
        const kb: KeyboardBindings = structuredClone(settings[listen.set]);
        const list = listen.kind === 'action' ? kb.actions[listen.key as Action] : kb.axes[listen.key as AxisKey];
        if (!list.includes(e.code)) list.unshift(e.code);
        if (list.length > 2) list.length = 2;
        setSettings({ [listen.set]: kb } as Partial<Settings>);
        setListen(null);
      };
      window.addEventListener('keydown', onKey, { capture: true });
      return () => window.removeEventListener('keydown', onKey, { capture: true });
    }
    // Gamepad: poll for a pressed button.
    let raf = 0;
    const poll = () => {
      for (const pad of navigator.getGamepads?.() ?? []) {
        if (!pad) continue;
        const b = pad.buttons.findIndex((x) => x.pressed);
        if (b >= 0) {
          const gp = structuredClone(settings.gamepad);
          gp.actions[listen.key] = [b];
          setSettings({ gamepad: gp });
          setListen(null);
          return;
        }
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [listen, settings, setSettings]);

  const kb = settings[kbSet];
  const clearKey = (kind: 'action' | 'axis', key: string, code: string) => {
    const next: KeyboardBindings = structuredClone(kb);
    const list = kind === 'action' ? next.actions[key as Action] : next.axes[key as AxisKey];
    const i = list.indexOf(code);
    if (i >= 0) list.splice(i, 1);
    setSettings({ [kbSet]: next } as Partial<Settings>);
  };

  const keyRow = (kind: 'action' | 'axis', key: string, label: string, codes: string[]) => {
    const isListening = listen && listen.set === kbSet && 'kind' in listen && listen.kind === kind && listen.key === key;
    return (
      <div key={`${kind}-${key}`} style={{ display: 'contents' }}>
        <span>{label}</span>
        <span className="bind-keys">
          {codes.map((c) => (
            <span key={c} className="bind-key" title="Click to remove" onClick={() => clearKey(kind, key, c)}>
              {keyLabel(c)} ✕
            </span>
          ))}
          <span className={`bind-key ${isListening ? 'listening' : ''}`} onClick={() => setListen({ set: kbSet, kind, key })}>
            {isListening ? 'press a key…' : '+ bind'}
          </span>
        </span>
      </div>
    );
  };

  return (
    <div className="screen">
      <div className="settings">
        <div className="topbar">
          <button className="btn small" onClick={() => setScreen('menu')}>
            ← Back
          </button>
          <h1>Settings</h1>
          <div className="spacer" />
          <button className="btn small danger" onClick={() => setSettings(DEFAULT_SETTINGS)}>
            Reset all to defaults
          </button>
        </div>

        <div className="section">
          <h3>Gameplay</h3>
          <div className="field-row">
            <div>
              Aim assist
              <div className="hint">Turrets track the HUB, fixed shooters rotate the robot to aim, and SOTM robots lead their shots. Toggle in game too.</div>
            </div>
            <input type="checkbox" checked={settings.assist} onChange={(e) => setSettings({ assist: e.target.checked })} />
          </div>
          <div className="field-row">
            <div>
              Drive frame
              <div className="hint">Third-person controls follow the camera, or always use the driver-station (field-oriented) frame.</div>
            </div>
            <div className="seg">
              <button className={settings.driveFrame === 'camera' ? 'on' : ''} onClick={() => setSettings({ driveFrame: 'camera' })}>
                Camera
              </button>
              <button className={settings.driveFrame === 'driver-station' ? 'on' : ''} onClick={() => setSettings({ driveFrame: 'driver-station' })}>
                Driver station
              </button>
            </div>
          </div>
          <div className="field-row">
            <div>
              Keyboard rotation ramp <span className="hint">({settings.rotationRamp.toFixed(2)}s)</span>
              <div className="hint">How long a rotate key takes to reach full speed. 0 is instant.</div>
            </div>
            <input type="range" min={0} max={0.5} step={0.02} value={settings.rotationRamp} onChange={(e) => setSettings({ rotationRamp: Number(e.target.value) })} />
          </div>
          <div className="field-row">
            <div>
              Heading hold
              <div className="hint">Swerve and mecanum robots keep their heading when you aren't rotating, so bumps and contact don't knock them off line.</div>
            </div>
            <input type="checkbox" checked={settings.headingHold} onChange={(e) => setSettings({ headingHold: e.target.checked })} />
          </div>
          <div className="field-row">
            <div>
              Expert mode
              <div className="hint">
                No aim assist or heading hold. Rev the flywheel yourself (G / gamepad A toggles it) and hold Shoot to run the indexer. FUEL fed into a
                wheel that isn't up to speed falls short.
              </div>
            </div>
            <input type="checkbox" checked={settings.expert} onChange={(e) => setSettings({ expert: e.target.checked })} />
          </div>
          <div className="field-row">
            <div>Minimap</div>
            <input type="checkbox" checked={settings.minimap} onChange={(e) => setSettings({ minimap: e.target.checked })} />
          </div>
          <div className="field-row">
            <div>Default camera</div>
            <select value={settings.defaultCamera} onChange={(e) => setSettings({ defaultCamera: e.target.value as Settings['defaultCamera'] })}>
              {CAMERA_MODES.map((m) => (
                <option key={m} value={m}>
                  {CAMERA_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <div>AUTO → TELEOP delay (s)</div>
            <input type="number" min={0} max={10} step={1} value={settings.autoTeleopGap} onChange={(e) => setSettings({ autoTeleopGap: Number(e.target.value) })} style={{ width: 80 }} />
          </div>
        </div>

        <div className="section">
          <h3>Graphics &amp; audio</h3>
          <div className="field-row">
            <div>Shadows</div>
            <input type="checkbox" checked={settings.shadows} onChange={(e) => setSettings({ shadows: e.target.checked })} />
          </div>
          <div className="field-row">
            <div>Antialiasing</div>
            <input type="checkbox" checked={settings.antialias} onChange={(e) => setSettings({ antialias: e.target.checked })} />
          </div>
          <div className="field-row">
            <div>
              Max pixel ratio <span className="hint">({settings.pixelRatio.toFixed(1)}×)</span>
            </div>
            <input type="range" min={0.5} max={2} step={0.25} value={settings.pixelRatio} onChange={(e) => setSettings({ pixelRatio: Number(e.target.value) })} />
          </div>
          <div className="field-row">
            <div>
              Volume <span className="hint">({Math.round(settings.volume * 100)}%)</span>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => setSettings({ volume: Number(e.target.value) })} />
          </div>
        </div>

        <div className="section">
          <div className="row" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Keyboard</h3>
            <div className="spacer" />
            <div className="seg">
              <button className={kbSet === 'keyboard' ? 'on' : ''} onClick={() => setKbSet('keyboard')}>
                Player 1
              </button>
              <button className={kbSet === 'keyboard2' ? 'on' : ''} onClick={() => setKbSet('keyboard2')}>
                Player 2
              </button>
            </div>
            <button
              className="btn small"
              onClick={() => setSettings({ [kbSet]: structuredClone(kbSet === 'keyboard' ? DEFAULT_KEYBOARD : DEFAULT_KEYBOARD_P2) } as Partial<Settings>)}
            >
              Defaults
            </button>
          </div>
          <div className="bind-table">
            {AXES.map((a) => keyRow('axis', a, AXIS_LABELS[a], kb.axes[a]))}
            {ACTIONS.map((a) => keyRow('action', a, ACTION_LABELS[a], kb.actions[a]))}
          </div>
        </div>

        <div className="section">
          <div className="row" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Gamepad (Xbox layout)</h3>
            <div className="spacer" />
            <button className="btn small" onClick={() => setSettings({ gamepad: structuredClone(DEFAULT_GAMEPAD) })}>
              Defaults
            </button>
          </div>
          <div className="note" style={{ marginBottom: 10 }}>
            Left stick drives, right stick rotates. Deadzone: {settings.gamepad.deadzone.toFixed(2)}
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={settings.gamepad.deadzone}
              onChange={(e) => setSettings({ gamepad: { ...settings.gamepad, deadzone: Number(e.target.value) } })}
              style={{ marginLeft: 10, verticalAlign: 'middle' }}
            />
          </div>
          <div className="bind-table">
            {ACTIONS.map((a) => {
              const isListening = listen?.set === 'gamepad' && listen.key === a;
              return (
                <div key={a} style={{ display: 'contents' }}>
                  <span>{ACTION_LABELS[a]}</span>
                  <span className="bind-keys">
                    {settings.gamepad.actions[a].map((b) => (
                      <span key={b} className="bind-key">
                        {GAMEPAD_BUTTON_NAMES[b] ?? `B${b}`}
                      </span>
                    ))}
                    <span className={`bind-key ${isListening ? 'listening' : ''}`} onClick={() => setListen({ set: 'gamepad', key: a })}>
                      {isListening ? 'press a button…' : 'rebind'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
