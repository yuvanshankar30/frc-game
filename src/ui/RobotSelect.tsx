import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type PlayerSetup } from './store';
import { useRobots } from './useRobots';
import { RobotPreview } from '../render/preview';
import { robotThumb } from '../render/thumbs';
import { connectedGamepads } from '../core/input/Input';
import type { RobotDefinition } from '../robot/schema';
import { FEATURES } from '../game/features';

export function RobotStats({ def }: { def: RobotDefinition }) {
  const sh = def.shooter;
  const ftps = (def.drivetrain.maxSpeed * 3.281).toFixed(1);
  const cells: [string, React.ReactNode][] = [
    ['Top speed', <>{ftps}<small> ft/s</small></>],
    ['Hopper', <>{def.storage.capacity}<small> fuel</small></>],
    ['Fire rate', sh ? <>{sh.rate}<small> bps</small></> : '—'],
    ['Shooter', sh ? (sh.turretMin !== null ? (sh.barrels.length > 1 ? `${sh.barrels.length}× turret` : 'Turret') : `${sh.barrels.length}-lane drum`) : '—'],
    ['Intake', def.intake ? <>{def.intake.rate}<small> /s</small></> : '—'],
    ...(FEATURES.climbing ? [['Climb', def.climber?.maxLevel ? `L${def.climber.maxLevel}` : 'None'] as [string, React.ReactNode]] : []),
    ['Drive', def.drivetrain.type[0].toUpperCase() + def.drivetrain.type.slice(1)],
    ['Frame', <>{(def.frame.length / 0.0254).toFixed(1)}×{(def.frame.width / 0.0254).toFixed(1)}<small> in</small></>],
    ['Height', <>{(def.frame.height / 0.0254).toFixed(1)}<small> in</small></>],
  ];
  return (
    <div className="spec">
      {cells.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

/** Rendered robot thumbnail for cards. */
export function RobotThumb({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    robotThumb(id).then((u) => alive && setSrc(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  return src ? <img src={src} alt="" draggable={false} /> : <div className="spinner" />;
}

export function robotChips(def: RobotDefinition) {
  const chips: string[] = [def.drivetrain.type];
  const sh = def.shooter;
  if (sh) {
    if (sh.turretMin !== null) chips.push(sh.barrels.length > 1 ? `${sh.barrels.length} turrets` : 'turret');
    else chips.push(sh.barrels.length > 1 ? `${sh.barrels.length}-lane drum` : 'fixed shooter');
    if (sh.hoodMin !== null) chips.push('hood');
    if (sh.sotm) chips.push('shoots moving');
  }
  if (FEATURES.climbing) chips.push(def.climber?.maxLevel ? `L${def.climber.maxLevel} climb` : 'no climb');
  if (def.frame.height <= 0.565) chips.push('fits trench');
  return chips;
}

export function RobotSelect() {
  const { mode, players, setPlayers, setScreen } = useStore();
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

  const title = mode === 'match' ? 'Match' : mode === 'practice' ? 'Practice' : 'Multiplayer';

  return (
    <div className="screen select">
      <div className="select-main">
        <div className="topbar">
          <button className="btn small" onClick={() => setScreen('menu')}>
            ← Back
          </button>
          <h1>{title} — select robot</h1>
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
            <div key={r.id} className={`card ${cur?.robotId === r.id ? 'selected' : ''} ${r.builtin ? '' : 'custom'}`} onClick={() => update({ robotId: r.id })}>
              <div className="stripe" style={{ background: r.def.color }} />
              <div className="thumb">
                <RobotThumb id={r.id} />
              </div>
              <div className="meta">
                <div className="team">{r.def.team ? `Team ${r.def.team}` : 'Custom'}{r.def.author ? ` · ${r.def.author}` : ''}</div>
                <div className="name">{r.def.name}</div>
                <div className="specline">{(r.builtin ? robotChips(r.def) : ['custom', ...robotChips(r.def)]).join(' · ')}</div>
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
              <div className="eyebrow">
                {entry.def.team && `Team ${entry.def.team} · `}
                {entry.def.author}
              </div>
              <h2>{entry.def.name}</h2>
              <p className="desc">{entry.def.description}</p>
              <RobotStats def={entry.def} />
              {entry.def.highlights.length > 0 && (
                <ul className="highlights">
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
          <button className="btn primary" onClick={start} disabled={!entry}>
            Start {title}
          </button>
        </div>
      </div>
    </div>
  );
}
