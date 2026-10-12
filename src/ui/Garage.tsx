import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { useRobots } from './useRobots';
import { RobotPreview } from '../render/preview';
import { RobotStats, RobotThumb, robotChips } from './RobotSelect';
import { packFrcbot, unpackFrcbot, downloadBlob } from '../cad/frcbot';
import { saveCustomRobot, deleteCustomRobot, getCustomRobot } from '../cad/storage';
import { exportGlb } from '../cad/loaders';
import { BUILTINS, buildBuiltin, type RobotEntry } from '../robots/registry';
import { checkRules } from '../robot/schema';
import { toast } from './toast';

export function Garage() {
  const { setScreen, setEditingRobot } = useStore();
  const { robots, refresh } = useRobots();
  const [sel, setSel] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RobotEntry | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<RobotPreview | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    preview.current = new RobotPreview(canvas.current);
    return () => preview.current?.dispose();
  }, []);

  const entry = robots.find((r) => r.id === sel) ?? robots[0];
  useEffect(() => {
    if (entry) void preview.current?.show(entry.id);
  }, [entry]);

  const importFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      try {
        if (!f.name.toLowerCase().endsWith('.frcbot') && !f.name.toLowerCase().endsWith('.zip')) {
          toast(`${f.name}: CAD files go through the Robot Editor`);
          setEditingRobot(null);
          setScreen('editor');
          return;
        }
        const { def, glb } = await unpackFrcbot(await f.arrayBuffer());
        // Avoid clobbering built-ins or existing robots with the same id.
        let id = def.id.startsWith('builtin-') ? `custom-${def.id}` : def.id;
        if (await getCustomRobot(id)) id = `${id}-${Date.now().toString(36)}`;
        await saveCustomRobot({ ...def, id }, glb);
        toast(`Imported ${def.team ? def.team + ' ' : ''}${def.name}`);
        setSel(id);
      } catch (e) {
        toast(`Import failed: ${(e as Error).message}`);
      }
    }
    await refresh();
  };

  const exportRobot = async (r: RobotEntry) => {
    try {
      let def = r.def;
      let glb: ArrayBuffer;
      if (r.builtin) {
        const b = BUILTINS.find((x) => x.def.id === r.id)!;
        const built = buildBuiltin(b);
        def = { ...built.def, id: `${r.id.replace('builtin-', 'custom-')}` };
        glb = await exportGlb(built.model);
      } else {
        const c = await getCustomRobot(r.id);
        if (!c) throw new Error('not found');
        glb = c.glb;
      }
      const blob = await packFrcbot(def, glb);
      downloadBlob(blob, `${(def.team ? def.team + '-' : '') + def.name.replace(/[^\w-]+/g, '_')}.frcbot`);
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`);
    }
  };

  const doDelete = async (r: RobotEntry) => {
    await deleteCustomRobot(r.id);
    setConfirmDelete(null);
    setSel(null);
    await refresh();
    toast(`Deleted ${r.def.name}`);
  };

  const issues = entry ? checkRules(entry.def) : [];

  return (
    <div
      className="screen select"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void importFiles(e.dataTransfer.files);
      }}
    >
      <div className="select-main">
        <div className="topbar">
          <button className="btn small" onClick={() => setScreen('menu')}>
            ← Back
          </button>
          <h1>Garage</h1>
          <div className="spacer" />
          <button className="btn small" onClick={() => fileInput.current?.click()}>
            Import .frcbot
          </button>
          <button
            className="btn small primary"
            onClick={() => {
              setEditingRobot(null);
              setScreen('editor');
            }}
          >
            New robot from CAD
          </button>
          <input ref={fileInput} type="file" accept=".frcbot,.zip" multiple hidden onChange={(e) => e.target.files && void importFiles(e.target.files)} />
        </div>
        <div className={`dropzone ${over ? 'over' : ''}`} style={{ marginBottom: 16 }}>
          Drop <b>.frcbot</b> packages here to add robots. Build new ones from STEP / GLB / STL / OBJ in the Robot Editor.
        </div>
        <div className="grid">
          {robots.map((r) => (
            <div key={r.id} className={`card ${entry?.id === r.id ? 'selected' : ''}`} onClick={() => setSel(r.id)}>
              <div className="stripe" style={{ background: r.def.color }} />
              <div className="thumb">
                <span className="num">{r.def.team || 'CSTM'}</span>
                <RobotThumb id={r.id} />
              </div>
              <div className="meta">
                <div className="team">{r.def.team ? `${r.def.team} · ` : ''}{r.def.author || 'Custom CAD'}</div>
                <div className="name">{r.def.name}</div>
                <div className="chips">
                  <span className={`chip ${r.builtin ? '' : 'custom'}`}>{r.builtin ? 'built-in' : 'custom'}</span>
                  {robotChips(r.def).map((c) => (
                    <span className="chip" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="select-side">
        <div className="preview">
          <canvas ref={canvas} />
        </div>
        <div className="side-body">
          {entry && (
            <>
              <h2>{entry.def.name}</h2>
              <p className="desc">{entry.def.description || 'No description.'}</p>
              <RobotStats def={entry.def} />
              {issues.length > 0 && (
                <div className="warnbox" style={{ marginTop: 10 }}>
                  {issues.map((i) => (
                    <div key={i.message}>⚠ {i.message}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {entry && (
          <div className="side-foot">
            <div className="row">
              <button
                className="btn"
                onClick={() => {
                  setEditingRobot(entry.id);
                  setScreen('editor');
                }}
              >
                {entry.builtin ? 'Open as template' : 'Edit'}
              </button>
              <button className="btn" onClick={() => void exportRobot(entry)}>
                Export .frcbot
              </button>
              {!entry.builtin && (
                <button className="btn danger" onClick={() => setConfirmDelete(entry)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {confirmDelete && (
        <div className="overlay">
          <div className="dialog">
            <h2>Delete {confirmDelete.def.name}?</h2>
            <p className="note">This removes the robot and its model from this browser. Export it first if you want a copy.</p>
            <div className="actions">
              <button className="btn" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button className="btn danger" onClick={() => void doDelete(confirmDelete)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
