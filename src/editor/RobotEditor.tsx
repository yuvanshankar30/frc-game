import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useStore } from '../ui/store';
import { EditorViewport, JOINT_COLORS, type GizmoTarget } from './EditorViewport';
import { importCad, loadGlb, exportGlb, type ImportResult } from '../cad/loaders';
import { robotSchema, checkRules, JOINT_DRIVERS, type RobotDefinition, type JointDef } from '../robot/schema';
import { saveCustomRobot, getCustomRobot } from '../cad/storage';
import { invalidateThumb } from '../render/thumbs';
import { packFrcbot, downloadBlob, unpackFrcbot } from '../cad/frcbot';
import { BUILTINS, buildBuiltin } from '../robots/registry';
import { toast } from '../ui/toast';
import { NumIn, NumM, Vec3In, Field, Check, Select } from './fields';
import { newRobotDefinition, fitFrameToBounds } from './defaults';

type Tab = 'model' | 'robot' | 'joints' | 'mechanisms' | 'save';

const DRIVER_HELP: Record<string, string> = {
  none: 'Does not move',
  'intake-deploy': 'Moves stowed → active while intaking',
  'intake-roller': 'Spins while intaking',
  indexer: 'Spins while shooting / intaking',
  'shooter-wheel': 'Spins with the flywheel',
  turret: 'Follows the turret aim (value = stowed + turret yaw)',
  hood: 'Follows the hood angle (hoodMin → stowed, hoodMax → active)',
  climber: 'Moves stowed → active while climbing',
  wheel: 'Spins with drive speed',
  steer: 'Swerve module azimuth (yaw axis), follows module angle',
};

interface TreeRow {
  name: string;
  depth: number;
  mesh: boolean;
  hasChildren: boolean;
  parent: string | null;
}

export function RobotEditor() {
  const { setScreen, editingRobot, setPlayers, setMode, setEditingRobot } = useStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  const vp = useRef<EditorViewport | null>(null);
  const raw = useRef<THREE.Object3D | null>(null);
  const [rawVersion, setRawVersion] = useState(0);
  const [def, setDef] = useState<RobotDefinition>(() => newRobotDefinition('My Robot'));
  const [tab, setTab] = useState<Tab>('model');
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selJoint, setSelJoint] = useState<string | null>(null);
  const [assign, setAssign] = useState(false);
  const [gizmo, setGizmo] = useState<GizmoTarget>(null);
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [busy, setBusy] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importInfo, setImportInfo] = useState<ImportResult | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [over, setOver] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [tint, setTint] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = useCallback((fn: (d: RobotDefinition) => void) => {
    setDef((d) => {
      const n = structuredClone(d);
      fn(n);
      return n;
    });
    setDirty(true);
  }, []);

  // Viewport lifecycle.
  useEffect(() => {
    if (!canvas.current) return;
    const v = new EditorViewport(canvas.current);
    vp.current = v;
    return () => v.dispose();
  }, []);

  // Load the robot being edited (custom) or a built-in as a template.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!editingRobot) return;
      setBusy('Loading robot…');
      try {
        const b = BUILTINS.find((x) => x.def.id === editingRobot);
        if (b) {
          const built = buildBuiltin(b);
          if (cancelled) return;
          raw.current = built.model;
          setDef({ ...built.def, id: `custom-${b.def.team}-${Date.now().toString(36)}`, name: `${built.def.name} (copy)`, source: 'package' });
        } else {
          const c = await getCustomRobot(editingRobot);
          if (!c) throw new Error('Robot not found');
          const model = await loadGlb(c.glb);
          if (cancelled) return;
          raw.current = model;
          setDef(c.def);
        }
        setRawVersion((x) => x + 1);
        setTab('joints');
        setTimeout(() => vp.current?.frameCamera(), 50);
      } catch (e) {
        toast(`Could not load: ${(e as Error).message}`);
      } finally {
        setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingRobot]);

  // Push def / model changes into the viewport.
  useEffect(() => {
    const v = vp.current;
    if (!v) return;
    v.setRobot(def, raw.current);
    if (assign && selJoint) {
      v.highlightNodes(def.parts.filter((p) => p.joint === selJoint).map((p) => p.node), 0xffd400);
    } else if (tint) {
      v.tintByJoint(def);
    }
    if (selNode && !assign) v.highlightNodes([selNode]);
    v.attachGizmo(gizmo, gizmoMode);
  }, [def, rawVersion, selNode, assign, selJoint, gizmo, gizmoMode, tint]);

  // Picking + gizmo callbacks (re-bound so they see fresh state).
  useEffect(() => {
    const v = vp.current;
    if (!v) return;
    v.onPick = (node, shift) => {
      if (!node) {
        if (!assign) setSelNode(null);
        return;
      }
      // Shift-click selects the parent assembly instead of the single mesh.
      let name = node;
      if (shift && raw.current) {
        const obj = raw.current.getObjectByName(node);
        if (obj?.parent && obj.parent !== raw.current) name = obj.parent.name;
      }
      if (assign && selJoint) toggleAssign(name);
      else {
        setSelNode(name);
        expandTo(name);
      }
    };
    v.onGizmoChange = (t, obj) => {
      const p = obj.position.toArray().map(round) as [number, number, number];
      update((d) => {
        switch (t.kind) {
          case 'model':
            d.model.position = p;
            d.model.rotation = [obj.rotation.x, obj.rotation.y, obj.rotation.z].map((r) => round((r * 180) / Math.PI)) as [number, number, number];
            break;
          case 'pivot': {
            const j = d.joints.find((x) => x.id === t.joint);
            if (j) j.pivot = p;
            break;
          }
          case 'intake': {
            const z = d.intake?.zones[t.index];
            if (z) {
              z.center = p;
              z.size = obj.scale.toArray().map((s) => round(Math.abs(s))) as [number, number, number];
            }
            break;
          }
          case 'hopper':
            if (d.storage.box) {
              d.storage.box.center = p;
              d.storage.box.size = obj.scale.toArray().map((s) => round(Math.abs(s))) as [number, number, number];
            }
            break;
          case 'barrel': {
            const b = d.shooter?.barrels[t.index];
            if (b) {
              if (t.which === 'exit') b.exit = p;
              else b.pivot = p;
            }
            break;
          }
        }
      });
    };
  });

  const toggleAssign = (node: string) => {
    if (!selJoint) return;
    update((d) => {
      const i = d.parts.findIndex((p) => p.node === node);
      if (i >= 0 && d.parts[i].joint === selJoint) d.parts.splice(i, 1);
      else if (i >= 0) d.parts[i].joint = selJoint;
      else d.parts.push({ node, joint: selJoint });
    });
  };

  // ---------------------------------------------------------------- import

  const doImport = async (files: File[]) => {
    if (!files.length) return;
    const pkg = files.find((f) => /\.(frcbot|zip)$/i.test(f.name));
    setBusy('Importing…');
    setWarnings([]);
    try {
      if (pkg) {
        const { def: d, glb } = await unpackFrcbot(await pkg.arrayBuffer());
        raw.current = await loadGlb(glb);
        setDef(d);
        setImportInfo(null);
      } else {
        const res = await importCad(files, (m) => setBusy(m));
        raw.current = res.model;
        setImportInfo(res);
        setWarnings(res.warnings);
        const name = files[0].name.replace(/\.[^.]+$/, '');
        const d = newRobotDefinition(name);
        d.model.scale = res.unitScale;
        d.model.rotation = res.upAxis === 'z' ? [-90, 0, 0] : [0, 0, 0];
        // Auto-center + fit the frame.
        setDef(autoPlace(d, res.model));
      }
      setRawVersion((x) => x + 1);
      setDirty(true);
      setSelNode(null);
      setTab('model');
      setTimeout(() => vp.current?.frameCamera(), 60);
    } catch (e) {
      console.error(e);
      toast(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  // ---------------------------------------------------------------- tree

  const tree = useMemo<TreeRow[]>(() => {
    const out: TreeRow[] = [];
    const r = raw.current;
    if (!r) return out;
    const walk = (o: THREE.Object3D, depth: number, parent: string | null) => {
      for (const c of o.children) {
        out.push({ name: c.name, depth, mesh: (c as THREE.Mesh).isMesh === true, hasChildren: c.children.length > 0, parent });
        walk(c, depth + 1, c.name);
      }
    };
    walk(r, 0, null);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawVersion]);

  useEffect(() => {
    // Expand the first two levels by default.
    setExpanded(new Set(tree.filter((t) => t.depth < 1 && t.hasChildren).map((t) => t.name)));
  }, [tree]);

  const expandTo = (name: string) => {
    const byName = new Map(tree.map((t) => [t.name, t]));
    const next = new Set(expanded);
    let cur = byName.get(name)?.parent ?? null;
    while (cur) {
      next.add(cur);
      cur = byName.get(cur)?.parent ?? null;
    }
    setExpanded(next);
  };

  const visibleRows = useMemo(() => {
    if (filter) return tree.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()));
    const byName = new Map(tree.map((t) => [t.name, t]));
    return tree.filter((t) => {
      let p = t.parent;
      while (p) {
        if (!expanded.has(p)) return false;
        p = byName.get(p)?.parent ?? null;
      }
      return true;
    });
  }, [tree, expanded, filter]);

  const jointColor = (id: string | null) => {
    const i = def.joints.findIndex((j) => j.id === id);
    return i >= 0 ? `#${JOINT_COLORS[i % JOINT_COLORS.length].toString(16).padStart(6, '0')}` : 'transparent';
  };
  const partMap = useMemo(() => new Map(def.parts.map((p) => [p.node, p.joint])), [def.parts]);

  // ---------------------------------------------------------------- save

  const issues = useMemo(() => {
    const parsed = robotSchema.safeParse(def);
    const zodIssues = parsed.success ? [] : parsed.error.issues.map((i) => ({ level: 'error' as const, message: `${i.path.join('.')}: ${i.message}` }));
    return [...zodIssues, ...checkRules(def)];
  }, [def]);
  const hasErrors = issues.some((i) => i.level === 'error');

  const save = async (): Promise<string | null> => {
    if (!raw.current) {
      toast('Import a model first');
      return null;
    }
    if (hasErrors) {
      toast('Fix the errors in the Save tab first');
      setTab('save');
      return null;
    }
    setBusy('Saving…');
    try {
      const glb = await exportGlb(raw.current);
      const parsed = robotSchema.parse({ ...def, source: 'package' });
      await saveCustomRobot(parsed, glb);
      invalidateThumb(parsed.id);
      setDirty(false);
      setEditingRobot(parsed.id);
      toast(`Saved ${parsed.name}`);
      return parsed.id;
    } catch (e) {
      toast(`Save failed: ${(e as Error).message}`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const exportPkg = async () => {
    if (!raw.current) return;
    setBusy('Packing…');
    try {
      const glb = await exportGlb(raw.current);
      const blob = await packFrcbot(robotSchema.parse(def), glb);
      downloadBlob(blob, `${(def.team ? def.team + '-' : '') + def.name.replace(/[^\w-]+/g, '_')}.frcbot`);
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const testDrive = async () => {
    const id = await save();
    if (!id) return;
    setPlayers([{ robotId: id, alliance: 'blue', device: 'keyboard', station: 1 }]);
    setMode('practice');
    setScreen('game');
  };

  const back = () => {
    if (dirty && raw.current) setConfirmLeave(true);
    else setScreen('garage');
  };

  // ---------------------------------------------------------------- joints helpers

  const addJoint = () => {
    const id = uniqueId(def.joints.map((j) => j.id), 'joint');
    const pivot: [number, number, number] = selNode && vp.current ? centerOf(selNode) : [0, def.frame.height / 2, 0];
    update((d) => {
      d.joints.push({ id, name: selNode ?? id, type: 'revolute', driver: 'intake-deploy', parent: null, pivot, axis: [0, 0, 1], stowed: 0, active: 90, speed: 180 });
      if (selNode && !d.parts.some((p) => p.node === selNode)) d.parts.push({ node: selNode, joint: id });
    });
    setSelJoint(id);
    setGizmo({ kind: 'pivot', joint: id });
  };

  const centerOf = (node: string): [number, number, number] => {
    const v = vp.current;
    if (!v) return [0, 0, 0];
    let found: THREE.Object3D | undefined;
    v.scene.traverse((o) => {
      if (!found && o.name === node && o.userData !== undefined) found = o;
    });
    if (!found) return [0, 0, 0];
    const b = new THREE.Box3().setFromObject(found);
    return b.getCenter(new THREE.Vector3()).toArray().map(round) as [number, number, number];
  };

  const updateJoint = (id: string, patch: Partial<JointDef>) =>
    update((d) => {
      const j = d.joints.find((x) => x.id === id);
      if (j) Object.assign(j, patch);
    });

  const deleteJoint = (id: string) => {
    update((d) => {
      d.joints = d.joints.filter((j) => j.id !== id);
      for (const j of d.joints) if (j.parent === id) j.parent = null;
      d.parts = d.parts.filter((p) => p.joint !== id);
    });
    if (selJoint === id) setSelJoint(null);
    setAssign(false);
    setGizmo(null);
  };

  // ---------------------------------------------------------------- render

  const noModel = !raw.current;
  const selRow = tree.find((t) => t.name === selNode);

  return (
    <div
      className="screen editor"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void doImport(Array.from(e.dataTransfer.files));
      }}
    >
      {/* ---------------- left: part tree ---------------- */}
      <div className="editor-left">
        <div className="row" style={{ padding: '12px 12px 0' }}>
          <button className="btn small" onClick={back}>
            ← Back
          </button>
          <div className="spacer" />
          <button className="btn small" onClick={() => fileInput.current?.click()}>
            Import CAD…
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept=".step,.stp,.iges,.igs,.brep,.glb,.gltf,.stl,.obj,.frcbot,.zip"
            onChange={(e) => e.target.files && void doImport(Array.from(e.target.files))}
          />
        </div>
        <div className="panel-h">Parts ({tree.filter((t) => t.mesh).length} meshes)</div>
        {!noModel && (
          <div style={{ padding: '0 12px 8px' }}>
            <input placeholder="Filter parts…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: '100%' }} />
          </div>
        )}
        <div className="tree">
          {noModel && <div className="note" style={{ padding: 8 }}>No model yet. Drop CAD files on the viewport.</div>}
          {visibleRows.slice(0, 1500).map((t) => {
            const j = partMap.get(t.name);
            return (
              <div
                key={t.name}
                className={`tree-row ${selNode === t.name ? 'sel' : ''}`}
                style={{ paddingLeft: 6 + (filter ? 0 : t.depth * 12) }}
                onClick={() => (assign && selJoint ? toggleAssign(t.name) : setSelNode(t.name))}
                title={t.name}
              >
                {t.hasChildren && !filter ? (
                  <span
                    style={{ width: 12, color: 'var(--muted)' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const n = new Set(expanded);
                      if (n.has(t.name)) n.delete(t.name);
                      else n.add(t.name);
                      setExpanded(n);
                    }}
                  >
                    {expanded.has(t.name) ? '▾' : '▸'}
                  </span>
                ) : (
                  <span style={{ width: 12 }} />
                )}
                <span className="dot" style={{ background: j ? jointColor(j) : 'transparent', border: j ? 'none' : '1px solid #3a4560' }} />
                <span style={{ opacity: t.mesh ? 1 : 0.8, fontWeight: t.mesh ? 400 : 600 }}>{t.name}</span>
              </div>
            );
          })}
          {visibleRows.length > 1500 && <div className="note">…{visibleRows.length - 1500} more (use the filter)</div>}
        </div>
      </div>

      {/* ---------------- center: viewport ---------------- */}
      <div className="editor-view">
        <canvas ref={canvas} />
        <div className="editor-toolbar">
          <button className="btn small" onClick={() => vp.current?.frameCamera()}>
            Frame
          </button>
          {(['front', 'side', 'top', 'iso'] as const).map((v) => (
            <button key={v} className="btn small" onClick={() => vp.current?.setView(v)}>
              {v}
            </button>
          ))}
          <button className={`btn small ${tint ? 'active' : ''}`} onClick={() => setTint(!tint)}>
            Color by joint
          </button>
          {gizmo && (
            <>
              <span className="spacer" />
              <div className="seg">
                {(['translate', 'rotate', 'scale'] as const).map((m) => (
                  <button key={m} className={gizmoMode === m ? 'on' : ''} onClick={() => setGizmoMode(m)}>
                    {m}
                  </button>
                ))}
              </div>
              <button className="btn small" onClick={() => setGizmo(null)}>
                Done moving
              </button>
            </>
          )}
        </div>
        {assign && selJoint && (
          <div className="climb-hint" style={{ bottom: 18 }}>
            Click parts to add or remove them from “{def.joints.find((j) => j.id === selJoint)?.name || selJoint}” · Shift-click selects the parent assembly ·{' '}
            <button className="btn small" style={{ marginLeft: 6 }} onClick={() => setAssign(false)}>
              Done
            </button>
          </div>
        )}
        {noModel && (
          <div className="overlay" style={{ background: 'rgba(5,7,10,0.55)' }}>
            <div className={`dropzone ${over ? 'over' : ''}`} style={{ maxWidth: 520, background: 'var(--panel)' }}>
              <h2 style={{ color: 'var(--text)', marginTop: 0 }}>Import your robot CAD</h2>
              <p>
                Drop <b>STEP / STP / IGES</b> (converted in-browser with OpenCascade), <b>GLB / GLTF</b>, <b>STL</b> (several at once), <b>OBJ</b>, or a{' '}
                <b>.frcbot</b> package.
              </p>
              <p className="note">
                Tip: from Onshape, right-click the assembly → Export → STEP. Fusion: File → Export → .step. Keep fasteners hidden for a lighter model.
              </p>
              <button className="btn primary" onClick={() => fileInput.current?.click()}>
                Choose files…
              </button>
              <div className="note" style={{ marginTop: 12 }}>
                …or start from a built-in robot:{' '}
                {BUILTINS.map((b) => (
                  <a key={b.def.id} href="#" style={{ marginRight: 8 }} onClick={(e) => { e.preventDefault(); setEditingRobot(b.def.id); }}>
                    {b.def.team}
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
        {busy && (
          <div className="loading" style={{ background: 'rgba(11,13,18,0.8)' }}>
            <div className="spinner" />
            {busy}
          </div>
        )}
      </div>

      {/* ---------------- right: properties ---------------- */}
      <div className="editor-right">
        <div className="tabs">
          {(['model', 'robot', 'joints', 'mechanisms', 'save'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'save' ? `Save${hasErrors ? ' ⚠' : ''}` : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'model' && (
          <div className="form">
            {warnings.map((w) => (
              <div className="warnbox" key={w}>
                {w}
              </div>
            ))}
            {importInfo && (
              <div className="note">
                {importInfo.format.toUpperCase()} · {importInfo.triangles.toLocaleString()} triangles · guessed units {unitName(importInfo.unitScale)} · {importInfo.upAxis.toUpperCase()}-up
              </div>
            )}
            <h4>Units</h4>
            <Select
              label="Model units"
              value={String(def.model.scale)}
              options={[
                ['1', 'meters'],
                ['0.001', 'millimeters'],
                ['0.01', 'centimeters'],
                ['0.0254', 'inches'],
                [String(def.model.scale), `custom (${def.model.scale})`],
              ]}
              onChange={(v) => update((d) => void (d.model.scale = Number(v)))}
            />
            <NumM label="Scale factor" value={def.model.scale} step={0.0001} onChange={(v) => update((d) => void (d.model.scale = v || 1))} />
            <h4>Orientation</h4>
            <div className="note">Make the robot's front face +X (red arrow) with the wheels on the grid.</div>
            <div className="row">
              <span className="label">Up axis</span>
              <div className="seg">
                <button className={def.model.rotation[0] === 0 ? 'on' : ''} onClick={() => update((d) => void (d.model.rotation[0] = 0))}>
                  Y up
                </button>
                <button className={def.model.rotation[0] === -90 ? 'on' : ''} onClick={() => update((d) => void (d.model.rotation[0] = -90))}>
                  Z up
                </button>
                <button className={def.model.rotation[0] === 90 ? 'on' : ''} onClick={() => update((d) => void (d.model.rotation[0] = 90))}>
                  −Z up
                </button>
              </div>
            </div>
            <div className="row">
              <span className="label">Yaw</span>
              <button className="btn small" onClick={() => update((d) => void (d.model.rotation[1] = (((d.model.rotation[1] + 90 + 180) % 360) - 180)))}>
                ⟲ 90°
              </button>
              <button className="btn small" onClick={() => update((d) => void (d.model.rotation[1] = (((d.model.rotation[1] - 90 + 180 + 360) % 360) - 180)))}>
                ⟳ 90°
              </button>
              <button className="btn small" onClick={() => update((d) => void (d.model.rotation[1] = (((d.model.rotation[1] + 360) % 360) - 180)))}>
                180°
              </button>
            </div>
            <Vec3In label="Rotation (°)" value={def.model.rotation} unit="deg" onChange={(v) => update((d) => void (d.model.rotation = v))} />
            <Vec3In label="Offset" value={def.model.position} onChange={(v) => update((d) => void (d.model.position = v))} />
            <div className="row">
              <button className="btn small" disabled={noModel} onClick={() => setDef((d) => autoPlace(d, raw.current!))}>
                Center &amp; drop to floor
              </button>
              <button className="btn small" disabled={noModel} onClick={() => setGizmo({ kind: 'model' })}>
                Move with gizmo
              </button>
            </div>
            <div className="row">
              <button
                className="btn small"
                disabled={noModel}
                onClick={() => {
                  const b = vp.current?.modelBounds();
                  if (b) update((d) => fitFrameToBounds(d, b));
                }}
              >
                Fit frame to model
              </button>
            </div>
            <div className="note">
              The grey box is the frame perimeter, the translucent blue ring is the bumpers, and the red plane marks the 22.25in TRENCH clearance.
            </div>
          </div>
        )}

        {tab === 'robot' && (
          <div className="form">
            <Field label="Name">
              <input type="text" value={def.name} onChange={(e) => update((d) => void (d.name = e.target.value))} />
            </Field>
            <Field label="Team #">
              <input type="text" value={def.team} onChange={(e) => update((d) => void (d.team = e.target.value.slice(0, 6)))} />
            </Field>
            <Field label="Team name">
              <input type="text" value={def.author} onChange={(e) => update((d) => void (d.author = e.target.value))} />
            </Field>
            <Field label="Description">
              <textarea rows={3} value={def.description} onChange={(e) => update((d) => void (d.description = e.target.value))} />
            </Field>
            <Field label="Accent color">
              <input type="color" value={def.color} onChange={(e) => update((d) => void (d.color = e.target.value))} />
            </Field>
            <h4>Frame</h4>
            <NumIn label="Length (X)" value={def.frame.length} onChange={(v) => update((d) => void (d.frame.length = v))} />
            <NumIn label="Width (Z)" value={def.frame.width} onChange={(v) => update((d) => void (d.frame.width = v))} />
            <NumIn label="Height" value={def.frame.height} onChange={(v) => update((d) => void (d.frame.height = v))} />
            <NumIn label="Bumper thick." value={def.frame.bumperThickness} onChange={(v) => update((d) => void (d.frame.bumperThickness = v))} />
            <NumIn label="Bumper bottom" value={def.frame.bumperBottom} onChange={(v) => update((d) => void (d.frame.bumperBottom = v))} />
            <NumIn label="Bumper height" value={def.frame.bumperHeight} onChange={(v) => update((d) => void (d.frame.bumperHeight = v))} />
            <NumIn label="Wheel radius" value={def.frame.wheelRadius} onChange={(v) => update((d) => void (d.frame.wheelRadius = v))} />
            <NumIn label="Wheel inset" value={def.frame.wheelInset} onChange={(v) => update((d) => void (d.frame.wheelInset = v))} />
            <Field label="Mass (lb)">
              <input type="number" step={1} value={Math.round(def.frame.mass / 0.4536)} onChange={(e) => update((d) => void (d.frame.mass = Math.max(5, Number(e.target.value)) * 0.4536))} />
            </Field>
            <NumIn label="CoM height" value={def.frame.comHeight} onChange={(v) => update((d) => void (d.frame.comHeight = v))} />
            <h4>Drivetrain</h4>
            <Select
              label="Type"
              value={def.drivetrain.type}
              options={[
                ['swerve', 'Swerve'],
                ['tank', 'Tank / West Coast'],
                ['mecanum', 'Mecanum'],
              ]}
              onChange={(v) => update((d) => void (d.drivetrain.type = v as RobotDefinition['drivetrain']['type']))}
            />
            <Field label="Top speed (ft/s)">
              <input type="number" step={0.1} value={round1(def.drivetrain.maxSpeed * 3.281)} onChange={(e) => update((d) => void (d.drivetrain.maxSpeed = Math.max(0.5, Number(e.target.value)) / 3.281))} />
            </Field>
            <NumM label="Accel (m/s²)" value={def.drivetrain.maxAccel} onChange={(v) => update((d) => void (d.drivetrain.maxAccel = Math.max(0.5, v)))} />
            <Field label="Turn rate (°/s)">
              <input type="number" step={10} value={Math.round((def.drivetrain.maxOmega * 180) / Math.PI)} onChange={(e) => update((d) => void (d.drivetrain.maxOmega = Math.max(30, Number(e.target.value)) * (Math.PI / 180)))} />
            </Field>
            <NumM label="Turn accel (rad/s²)" value={def.drivetrain.maxAlpha} onChange={(v) => update((d) => void (d.drivetrain.maxAlpha = Math.max(1, v)))} />
          </div>
        )}

        {tab === 'joints' && (
          <div className="form">
            <div className="note">
              Joints move groups of CAD parts. Pick a part (in the viewport or the tree), click <b>Add joint</b>, place its pivot, then choose what drives it. The
              model's pose as imported is joint value 0.
            </div>
            <div className="row">
              <button className="btn small primary" disabled={noModel} onClick={addJoint}>
                + Add joint{selNode ? ` for “${selNode.slice(0, 18)}”` : ''}
              </button>
              {selRow?.parent && (
                <button className="btn small" onClick={() => setSelNode(selRow.parent)}>
                  Select parent ↑
                </button>
              )}
            </div>
            {selNode && (
              <div className="note">
                Selected: <b>{selNode}</b> → {partMap.get(selNode) ? `joint “${partMap.get(selNode)}”` : 'chassis'}{' '}
                {partMap.get(selNode) && (
                  <a href="#" onClick={(e) => { e.preventDefault(); update((d) => void (d.parts = d.parts.filter((p) => p.node !== selNode))); }}>
                    (move to chassis)
                  </a>
                )}
              </div>
            )}
            {def.joints.map((j, i) => (
              <JointCard
                key={j.id}
                j={j}
                color={`#${JOINT_COLORS[i % JOINT_COLORS.length].toString(16).padStart(6, '0')}`}
                selected={selJoint === j.id}
                joints={def.joints}
                partCount={def.parts.filter((p) => p.joint === j.id).length}
                assigning={assign && selJoint === j.id}
                onSelect={() => setSelJoint(j.id)}
                onChange={(patch) => updateJoint(j.id, patch)}
                onDelete={() => deleteJoint(j.id)}
                onAssign={() => {
                  setSelJoint(j.id);
                  setAssign(!(assign && selJoint === j.id));
                }}
                onPivot={() => {
                  setSelJoint(j.id);
                  setGizmo({ kind: 'pivot', joint: j.id });
                }}
                onPivotFromSelection={() => selNode && updateJoint(j.id, { pivot: centerOf(selNode) })}
                onPreview={(v) => vp.current?.setPreview(j.id, v)}
              />
            ))}
          </div>
        )}

        {tab === 'mechanisms' && (
          <MechanismsTab def={def} update={update} setGizmo={setGizmo} noModel={noModel} />
        )}

        {tab === 'save' && (
          <div className="form">
            <h4>Rules &amp; validation</h4>
            {issues.length === 0 && <div className="note tag-ok">✓ No issues found</div>}
            {issues.map((i) => (
              <div key={i.message} className={i.level === 'error' ? 'errbox' : 'warnbox'}>
                {i.level === 'error' ? '✕' : '⚠'} {i.message}
              </div>
            ))}
            <div className="note">
              {def.joints.length} joints · {def.parts.length} mapped parts · frame {(def.frame.length / 0.0254).toFixed(1)}×{(def.frame.width / 0.0254).toFixed(1)}×
              {(def.frame.height / 0.0254).toFixed(1)} in
            </div>
            <div className="row">
              <button className="btn primary" disabled={noModel || hasErrors} onClick={() => void save()}>
                Save to Garage
              </button>
              <button className="btn" disabled={noModel || hasErrors} onClick={() => void testDrive()}>
                Save &amp; test drive
              </button>
              <button className="btn" disabled={noModel || hasErrors} onClick={() => void exportPkg()}>
                Export .frcbot
              </button>
            </div>
            <div className="note">
              A <b>.frcbot</b> holds <code>robot.json</code> and <code>model.glb</code>. Share it with your team. Anyone can drop it into the Garage.
            </div>
            <h4>robot.json</h4>
            <textarea
              rows={14}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}
              value={JSON.stringify(def, null, 2)}
              onChange={(e) => {
                try {
                  const v = robotSchema.parse(JSON.parse(e.target.value));
                  setDef(v);
                  setDirty(true);
                } catch {
                  /* keep typing */
                }
              }}
            />
          </div>
        )}
      </div>

      {confirmLeave && (
        <div className="overlay">
          <div className="dialog">
            <h2>Leave without saving?</h2>
            <p className="note">Your changes to this robot haven't been saved to the Garage.</p>
            <div className="actions">
              <button className="btn" onClick={() => setConfirmLeave(false)}>
                Stay
              </button>
              <button className="btn danger" onClick={() => setScreen('garage')}>
                Discard &amp; leave
              </button>
              <button
                className="btn primary"
                onClick={async () => {
                  setConfirmLeave(false);
                  if (await save()) setScreen('garage');
                }}
              >
                Save &amp; leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- joint card

function JointCard(props: {
  j: JointDef;
  color: string;
  selected: boolean;
  joints: JointDef[];
  partCount: number;
  assigning: boolean;
  onSelect: () => void;
  onChange: (p: Partial<JointDef>) => void;
  onDelete: () => void;
  onAssign: () => void;
  onPivot: () => void;
  onPivotFromSelection: () => void;
  onPreview: (v: number | null) => void;
}) {
  const { j } = props;
  const [preview, setPreview] = useState<number | null>(null);
  const unit = j.type === 'prismatic' ? 'in' : '°';
  const toUi = (v: number) => (j.type === 'prismatic' ? v / 0.0254 : v);
  const fromUi = (v: number) => (j.type === 'prismatic' ? v * 0.0254 : v);
  const lo = Math.min(j.stowed, j.active);
  const hi = Math.max(j.stowed, j.active);
  const axisKey = j.axis.map((a) => Math.round(a)).join(',');
  return (
    <div className={`joint-item ${props.selected ? 'sel' : ''}`} onClick={props.onSelect}>
      <div className="row">
        <span className="dot" style={{ width: 10, height: 10, borderRadius: '50%', background: props.color }} />
        <input type="text" value={j.name} onChange={(e) => props.onChange({ name: e.target.value })} style={{ flex: 1 }} />
        <button className="btn small danger" onClick={props.onDelete}>
          ✕
        </button>
      </div>
      <Select
        label="Type"
        value={j.type}
        options={[
          ['revolute', 'Revolute (pivot)'],
          ['prismatic', 'Prismatic (slide)'],
          ['spin', 'Spin (roller / wheel)'],
        ]}
        onChange={(v) => props.onChange({ type: v as JointDef['type'], speed: v === 'prismatic' ? 0.6 : v === 'spin' ? 1500 : 180 })}
      />
      <Select label="Driven by" value={j.driver} options={JOINT_DRIVERS.map((d) => [d, d])} onChange={(v) => props.onChange({ driver: v as JointDef['driver'] })} />
      <div className="note" style={{ marginTop: -4 }}>
        {DRIVER_HELP[j.driver]}
      </div>
      <Select
        label="Parent"
        value={j.parent ?? ''}
        options={[['', 'chassis'], ...props.joints.filter((x) => x.id !== j.id).map((x) => [x.id, x.name || x.id] as [string, string])]}
        onChange={(v) => props.onChange({ parent: v || null })}
      />
      <Vec3In label="Pivot" value={j.pivot} onChange={(v) => props.onChange({ pivot: v })} />
      <div className="row">
        <button className="btn small" onClick={props.onPivot}>
          Move pivot
        </button>
        <button className="btn small" onClick={props.onPivotFromSelection}>
          Pivot = selected part center
        </button>
      </div>
      <Select
        label="Axis"
        value={['1,0,0', '0,1,0', '0,0,1', '-1,0,0', '0,-1,0', '0,0,-1'].includes(axisKey) ? axisKey : 'custom'}
        options={[
          ['1,0,0', '+X (forward)'],
          ['-1,0,0', '−X'],
          ['0,1,0', '+Y (up)'],
          ['0,-1,0', '−Y'],
          ['0,0,1', '+Z (right)'],
          ['0,0,-1', '−Z'],
          ['custom', 'custom'],
        ]}
        onChange={(v) => v !== 'custom' && props.onChange({ axis: v.split(',').map(Number) as [number, number, number] })}
      />
      {j.type !== 'spin' && (
        <>
          <Field label={`Stowed (${unit})`}>
            <input type="number" step={j.type === 'prismatic' ? 0.25 : 5} value={round1(toUi(j.stowed))} onChange={(e) => props.onChange({ stowed: fromUi(Number(e.target.value)) })} />
          </Field>
          <Field label={`Active (${unit})`}>
            <input type="number" step={j.type === 'prismatic' ? 0.25 : 5} value={round1(toUi(j.active))} onChange={(e) => props.onChange({ active: fromUi(Number(e.target.value)) })} />
          </Field>
        </>
      )}
      <Field label={`Speed (${j.type === 'prismatic' ? 'in/s' : '°/s'})`}>
        <input type="number" step={j.type === 'prismatic' ? 1 : 30} value={round1(j.type === 'prismatic' ? j.speed / 0.0254 : j.speed)} onChange={(e) => props.onChange({ speed: Math.max(0.01, j.type === 'prismatic' ? Number(e.target.value) * 0.0254 : Number(e.target.value)) })} />
      </Field>
      {j.type !== 'spin' && (
        <Field label="Preview">
          <input
            type="range"
            min={lo === hi ? lo - (j.type === 'prismatic' ? 0.3 : 180) : lo}
            max={lo === hi ? hi + (j.type === 'prismatic' ? 0.3 : 180) : hi}
            step={j.type === 'prismatic' ? 0.002 : 1}
            value={preview ?? j.stowed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPreview(v);
              props.onPreview(v);
            }}
            onPointerUp={() => {
              setPreview(null);
              props.onPreview(null);
            }}
          />
        </Field>
      )}
      <div className="row">
        <button className={`btn small ${props.assigning ? 'active' : ''}`} onClick={props.onAssign}>
          {props.assigning ? 'Assigning… (click parts)' : 'Assign parts'}
        </button>
        <span className="note">{props.partCount} parts</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- mechanisms tab

function MechanismsTab({
  def,
  update,
  setGizmo,
  noModel,
}: {
  def: RobotDefinition;
  update: (fn: (d: RobotDefinition) => void) => void;
  setGizmo: (g: GizmoTarget) => void;
  noModel: boolean;
}) {
  const f = def.frame;
  const sh = def.shooter;
  return (
    <div className="form">
      <h4>Intake</h4>
      <Check
        label="Has intake"
        value={!!def.intake}
        onChange={(v) =>
          update((d) => {
            d.intake = v
              ? { zones: [{ center: [f.length / 2 + f.bumperThickness + 0.08, 0.1, 0], size: [0.16, 0.16, f.width] }], rate: 12, requiresDeploy: d.joints.some((j) => j.driver === 'intake-deploy'), latch: false }
              : null;
          })
        }
      />
      {def.intake && (
        <>
          <Field label="FUEL / second">
            <input type="number" step={1} value={def.intake.rate} onChange={(e) => update((d) => void (d.intake!.rate = Math.max(1, Number(e.target.value))))} />
          </Field>
          <Check label="Needs deploy" value={def.intake.requiresDeploy} onChange={(v) => update((d) => void (d.intake!.requiresDeploy = v))} />
          <Check label="Latches out" value={def.intake.latch} onChange={(v) => update((d) => void (d.intake!.latch = v))} />
          {def.intake.zones.map((z, i) => (
            <div key={i} className="joint-item">
              <div className="row">
                <b style={{ fontSize: 12 }}>Capture zone {i + 1}</b>
                <span className="spacer" />
                <button className="btn small" disabled={noModel} onClick={() => setGizmo({ kind: 'intake', index: i })}>
                  Gizmo
                </button>
                {def.intake!.zones.length > 1 && (
                  <button className="btn small danger" onClick={() => update((d) => void d.intake!.zones.splice(i, 1))}>
                    ✕
                  </button>
                )}
              </div>
              <Vec3In label="Center" value={z.center} onChange={(v) => update((d) => void (d.intake!.zones[i].center = v))} />
              <Vec3In label="Size" value={z.size} onChange={(v) => update((d) => void (d.intake!.zones[i].size = v))} />
            </div>
          ))}
          <button
            className="btn small"
            onClick={() => update((d) => void d.intake!.zones.push({ center: [0, 0.1, f.width / 2 + f.bumperThickness + 0.08], size: [f.length, 0.16, 0.16] }))}
          >
            + Add zone (e.g. side intake)
          </button>
        </>
      )}

      <h4>Storage</h4>
      <Field label="Capacity">
        <input type="number" step={1} value={def.storage.capacity} onChange={(e) => update((d) => void (d.storage.capacity = Math.max(0, Math.round(Number(e.target.value)))))} />
      </Field>
      <Field label="Preload (≤8)">
        <input type="number" step={1} min={0} max={8} value={def.storage.preload} onChange={(e) => update((d) => void (d.storage.preload = Math.min(8, Math.max(0, Math.round(Number(e.target.value))))))} />
      </Field>
      <Check
        label="Show FUEL in hopper"
        value={!!def.storage.box}
        onChange={(v) => update((d) => void (d.storage.box = v ? { center: [0, f.height * 0.45, 0], size: [f.length * 0.8, f.height * 0.4, f.width * 0.85] } : null))}
      />
      {def.storage.box && (
        <button className="btn small" disabled={noModel} onClick={() => setGizmo({ kind: 'hopper' })}>
          Move / scale hopper box
        </button>
      )}

      <h4>Shooter</h4>
      <Check
        label="Has shooter"
        value={!!sh}
        onChange={(v) =>
          update((d) => {
            d.shooter = v
              ? robotSchema.shape.shooter.unwrap().unwrap().parse({ barrels: [{ exit: [0, f.height + 0.05, 0], pivot: [0, 0, 0] }] })
              : null;
          })
        }
      />
      {sh && (
        <>
          <Field label="Fire rate (BPS)">
            <input type="number" step={1} value={sh.rate} onChange={(e) => update((d) => void (d.shooter!.rate = Math.max(0.5, Number(e.target.value))))} />
          </Field>
          <NumM label="Min speed (m/s)" value={sh.minSpeed} onChange={(v) => update((d) => void (d.shooter!.minSpeed = Math.max(0.5, v)))} />
          <NumM label="Max speed (m/s)" value={sh.maxSpeed} onChange={(v) => update((d) => void (d.shooter!.maxSpeed = Math.max(1, v)))} />
          <Check
            label="Adjustable hood"
            value={sh.hoodMin !== null}
            onChange={(v) =>
              update((d) => {
                d.shooter!.hoodMin = v ? 40 : null;
                d.shooter!.hoodMax = v ? 75 : null;
              })
            }
          />
          {sh.hoodMin === null ? (
            <NumM label="Launch angle (°)" value={sh.angle} onChange={(v) => update((d) => void (d.shooter!.angle = v))} />
          ) : (
            <>
              <NumM label="Hood min (°)" value={sh.hoodMin} onChange={(v) => update((d) => void (d.shooter!.hoodMin = v))} />
              <NumM label="Hood max (°)" value={sh.hoodMax ?? 75} onChange={(v) => update((d) => void (d.shooter!.hoodMax = v))} />
            </>
          )}
          <Check
            label="Turret"
            value={sh.turretMin !== null}
            onChange={(v) =>
              update((d) => {
                d.shooter!.turretMin = v ? -180 : null;
                d.shooter!.turretMax = v ? 180 : null;
              })
            }
          />
          {sh.turretMin !== null && (
            <>
              <NumM label="Turret min (°)" value={sh.turretMin} onChange={(v) => update((d) => void (d.shooter!.turretMin = v))} />
              <NumM label="Turret max (°)" value={sh.turretMax ?? 180} onChange={(v) => update((d) => void (d.shooter!.turretMax = v))} />
              <NumM label="Turret speed (°/s)" value={sh.turretSpeed} onChange={(v) => update((d) => void (d.shooter!.turretSpeed = Math.max(10, v)))} />
            </>
          )}
          <Select
            label="Fires toward"
            value={String(sh.yawOffset)}
            options={[
              ['0', 'front'],
              ['180', 'back'],
              ['90', 'left'],
              ['-90', 'right'],
              ...(![0, 180, 90, -90].includes(sh.yawOffset) ? [[String(sh.yawOffset), `${sh.yawOffset}°`] as [string, string]] : []),
            ]}
            onChange={(v) => update((d) => void (d.shooter!.yawOffset = Number(v)))}
          />
          <NumM label="Spread (° 1σ)" value={sh.spread} onChange={(v) => update((d) => void (d.shooter!.spread = Math.max(0, v)))} />
          <Check label="Shoot on the move" value={sh.sotm} onChange={(v) => update((d) => void (d.shooter!.sotm = v))} />
          {sh.barrels.map((b, i) => (
            <div key={i} className="joint-item">
              <div className="row">
                <b style={{ fontSize: 12 }}>Lane / barrel {i + 1}</b>
                <span className="spacer" />
                <button className="btn small" disabled={noModel} onClick={() => setGizmo({ kind: 'barrel', index: i, which: 'exit' })}>
                  Exit gizmo
                </button>
                {sh.turretMin !== null && (
                  <button className="btn small" disabled={noModel} onClick={() => setGizmo({ kind: 'barrel', index: i, which: 'pivot' })}>
                    Turret axis
                  </button>
                )}
                {sh.barrels.length > 1 && (
                  <button className="btn small danger" onClick={() => update((d) => void d.shooter!.barrels.splice(i, 1))}>
                    ✕
                  </button>
                )}
              </div>
              <Vec3In label="Exit" value={b.exit} onChange={(v) => update((d) => void (d.shooter!.barrels[i].exit = v))} />
              {sh.turretMin !== null && <Vec3In label="Turret axis" value={b.pivot} onChange={(v) => update((d) => void (d.shooter!.barrels[i].pivot = v))} />}
            </div>
          ))}
          <button
            className="btn small"
            onClick={() =>
              update((d) => {
                const last = d.shooter!.barrels[d.shooter!.barrels.length - 1];
                d.shooter!.barrels.push({ exit: [last.exit[0], last.exit[1], last.exit[2] + 0.12], pivot: [...last.pivot] as [number, number, number] });
              })
            }
          >
            + Add lane / second turret
          </button>
        </>
      )}

      <h4>Climber</h4>
      <Select
        label="Max level"
        value={String(def.climber?.maxLevel ?? 0)}
        options={[
          ['0', 'No climber'],
          ['1', 'LEVEL 1 (off the carpet)'],
          ['2', 'LEVEL 2 (bumpers above LOW rung)'],
          ['3', 'LEVEL 3 (bumpers above MID rung)'],
        ]}
        onChange={(v) => update((d) => void (d.climber = Number(v) ? { maxLevel: Number(v), climbTime: d.climber?.climbTime ?? 4, canAutoClimb: d.climber?.canAutoClimb ?? true } : null))}
      />
      {def.climber && (
        <>
          <NumM label="Climb time (s)" value={def.climber.climbTime} onChange={(v) => update((d) => void (d.climber!.climbTime = Math.max(0.3, v)))} />
          <Check label="Can climb in AUTO" value={def.climber.canAutoClimb} onChange={(v) => update((d) => void (d.climber!.canAutoClimb = v))} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- helpers

function round(v: number) {
  return Math.round(v * 10000) / 10000;
}
function round1(v: number) {
  return Math.round(v * 100) / 100;
}
function unitName(s: number) {
  return s === 1 ? 'meters' : s === 0.001 ? 'millimeters' : s === 0.0254 ? 'inches' : s === 0.01 ? 'centimeters' : `×${s}`;
}
function uniqueId(existing: string[], base: string) {
  let i = existing.length + 1;
  while (existing.includes(`${base}${i}`)) i++;
  return `${base}${i}`;
}

/** Center the model on the frame origin and drop it to the floor; fit the frame to its bounds. */
function autoPlace(d: RobotDefinition, model: THREE.Object3D): RobotDefinition {
  const n = structuredClone(d);
  const g = new THREE.Group();
  const holder = new THREE.Group();
  holder.scale.setScalar(n.model.scale);
  holder.rotation.set((n.model.rotation[0] * Math.PI) / 180, (n.model.rotation[1] * Math.PI) / 180, (n.model.rotation[2] * Math.PI) / 180, 'YXZ');
  const clone = model.clone(true);
  holder.add(clone);
  g.add(holder);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  if (box.isEmpty()) return n;
  const c = box.getCenter(new THREE.Vector3());
  n.model.position = [round(-c.x), round(-box.min.y), round(-c.z)];
  const moved = box.clone().translate(new THREE.Vector3(-c.x, -box.min.y, -c.z));
  return fitFrameToBounds(n, moved);
}
