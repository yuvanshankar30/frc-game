import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type PlayerSetup } from './store';
import { useRobots } from './useRobots';
import { RobotPreview } from '../render/preview';
import { connectedGamepads } from '../core/input/Input';
import type { RobotDefinition } from '../robot/schema';

export function RobotStats({ def }: { def: RobotDefinition }) {
  const sh = def.shooter;
  const rows: [string, number, string][] = [
    ['Top speed', def.drivetrain.maxSpeed / 5, `${(def.drivetrain.maxSpeed * 3.281).toFixed(1)} ft/s`],
    ['Acceleration', def.drivetrain.maxAccel / 14, `${def.drivetrain.maxAccel.toFixed(0)} m/s²`],
    ['Capacity', def.storage.capacity / 100, `${def.storage.capacity} FUEL`],
    ['Fire rate', (sh?.rate ?? 0) / 30, sh ? `${sh.rate} BPS` : 'none'],
    ['Intake', (def.intake?.rate ?? 0) / 24, def.intake ? `${def.intake.rate}/s` : 'none'],
    ['Climb', (def.climber?.maxLevel ?? 0) / 3, def.climber?.maxLevel ? `LEVEL ${def.climber.maxLevel}` : 'none'],
  ];
  return (
    <div>
      {rows.map(([k, v, label]) => (
        <div className="stat" key={k}>
          <span>{k}</span>
          <div className="bar">
            <div style={{ width: `${Math.min(100, Math.max(3, v * 100))}%` }} />
          </div>
          <span className="val">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function robotChips(def: RobotDefinition) {
  const chips: string[] = [def.drivetrain.type];
  const sh = def.shooter;
  if (sh) {
    if (sh.turretMin !== null) chips.push(sh.barrels.length > 1 ? `${sh.barrels.length} turrets` : 'turret');
    else chips.push(sh.barrels.length > 1 ? `${sh.barrels.length}-lane drum` : 'fixed shooter');
    if (sh.hoodMin !== null) chips.push('hood');
    if (sh.sotm) chips.push('SOTM');
  }
  chips.push(def.climber?.maxLevel ? `L${def.climber.maxLevel} climb` : 'no climb');
  if (def.frame.height <= 0.565) chips.push('trench');
  return chips;
}

export function RobotSelect() {
  const { mode, players, setPlayers, setScreen, settings, setSettings } = useStore();
  const { robots, loading } = useRobots();
  const count = mode === 'twoPlayer' ? 2 : 1;
  const [active, setActive] = useState(0);
  const [pads, setPads] = useState(connectedGamepads());
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<RobotPreview | null>(null);

  // Normalize the player list for this mode.
  const [setup, setSetup] = useState<PlayerSetup[]>(() => {
    const base = [...players];
    while (base.length < count) {
      base.push({ robotId: 'builtin-2910', alliance: base.length % 2 ? 'red' : 'blue', device: 'keyboard2', station: 1 });
    }
    return base.slice(0, count).map((p, i) => (count === 2 && i === 1 && p.device === 'keyboard' ? { ...p, device: 'keyboard2' } : p));
  });

  useEffect(() => {
    const t = setInterval(() => setPads(connectedGamepads()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!canvas.current) return;
    preview.current = new RobotPreview(canvas.current);
    return () => preview.current?.dispose();
  }, []);

  const cur = setup[active];
  const entry = useMemo(() => robots.find((r) => r.id === cur?.robotId) ?? robots[0], [robots, cur]);

  useEffect(() => {
    if (!entry || !preview.current) return;
    preview.current.alliance = cur.alliance;
    void preview.current.show(entry.id);
  }, [entry, cur?.alliance]);

  const update = (patch: Partial<PlayerSetup>) => {
    setSetup((s) => s.map((p, i) => (i === active ? { ...p, ...patch } : p)));
  };

  const start = () => {
    setPlayers(setup);
    setScreen('game');
  };

  const devices = [
    { id: 'keyboard', label: 'Keyboard (WASD)' },
    { id: 'keyboard2', label: 'Keyboard 2 (IJKL / numpad)' },
    ...pads.map((p) => ({ id: `gamepad:${p.index}`, label: `Gamepad ${p.index + 1}: ${p.id.slice(0, 28)}` })),
  ];
  if (!pads.length) devices.push({ id: 'gamepad:0', label: 'Gamepad 1 (press a button to connect)' });

  const title = mode === 'match' ? 'Match' : mode === 'practice' ? 'Free Practice' : 'Local 2-Player';

  return (
    <div className="screen select">
      <div className="select-main">
        <div className="topbar">
          <button className="btn small" onClick={() => setScreen('menu')}>
            ← Back
          </button>
          <h1>{title}: choose your robot</h1>
          <div className="spacer" />
          {count > 1 && (
            <div className="seg">
              {setup.map((p, i) => (
                <button key={i} className={i === active ? `on ${p.alliance}` : ''} onClick={() => setActive(i)}>
                  Player {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
        {loading && <div className="note">Loading robots…</div>}
        <div className="grid">
          {robots.map((r) => (
            <div key={r.id} className={`card ${cur?.robotId === r.id ? 'selected' : ''}`} onClick={() => update({ robotId: r.id })}>
              <div className="stripe" style={{ background: r.def.color }} />
              <div className="team">{r.def.team ? `TEAM ${r.def.team}` : 'CUSTOM'} {r.def.author && `· ${r.def.author}`}</div>
              <div className="name">{r.def.name}</div>
              <div className="chips">
                {!r.builtin && <span className="chip custom">custom CAD</span>}
                {robotChips(r.def).map((c) => (
                  <span className="chip" key={c}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="note" style={{ marginTop: 16 }}>
          Want your own robot? Open the <a href="#" onClick={(e) => { e.preventDefault(); setScreen('editor'); }}>Robot Editor</a> to import CAD, or the{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); setScreen('garage'); }}>Garage</a> to load a .frcbot package.
        </div>
      </div>
      <div className="select-side">
        <div className="preview">
          <canvas ref={canvas} />
        </div>
        <div className="side-body">
          {entry && (
            <>
              <div className="team" style={{ color: 'var(--muted)', fontFamily: 'JetBrains Mono', fontSize: 13 }}>
                {entry.def.team && `TEAM ${entry.def.team} · `}
                {entry.def.author}
              </div>
              <h2>{entry.def.name}</h2>
              <p className="desc">{entry.def.description}</p>
              <RobotStats def={entry.def} />
              {entry.def.highlights.length > 0 && (
                <ul className="desc" style={{ paddingLeft: 18, marginTop: 10 }}>
                  {entry.def.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
              {entry.def.sources.length > 0 && (
                <div className="sources">
                  Sources:
                  <br />
                  {entry.def.sources.map((s) => (
                    <div key={s}>· {s}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="side-foot">
          <div className="row">
            <span className="label">Alliance</span>
            <div className="seg">
              <button className={cur.alliance === 'blue' ? 'on blue' : ''} onClick={() => update({ alliance: 'blue' })}>
                Blue
              </button>
              <button className={cur.alliance === 'red' ? 'on red' : ''} onClick={() => update({ alliance: 'red' })}>
                Red
              </button>
            </div>
            <span className="label" style={{ minWidth: 0, marginLeft: 8 }}>
              Station
            </span>
            <div className="seg">
              {[0, 1, 2].map((s) => (
                <button key={s} className={cur.station === s ? 'on' : ''} onClick={() => update({ station: s })}>
                  {s + 1}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <span className="label">Controls</span>
            <select value={cur.device} onChange={(e) => update({ device: e.target.value })} style={{ flex: 1 }}>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          {mode === 'match' && (
            <label className="row" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={settings.bots} onChange={(e) => setSettings({ bots: e.target.checked })} />
              Fill the other 5 slots with bot robots (3v3)
            </label>
          )}
          <button className="btn primary" onClick={start} disabled={!entry}>
            Start {title}
          </button>
        </div>
      </div>
    </div>
  );
}
