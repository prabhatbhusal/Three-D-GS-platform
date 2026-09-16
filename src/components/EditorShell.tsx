'use client';

import { useEffect, useReducer, useState } from 'react';
import { SCENES } from '../lib/scenes';
import { walkerCfg } from '../lib/walkerConfig';
import { subscribeViewpoints } from '../lib/viewpoints';
import { hotspotsFor, subscribeDoc, sceneDocFor } from '../lib/sceneDoc';
import { uiConfig, setUiConfig, useUiConfig } from '../lib/uiConfig';
import { saveScene } from '../lib/api';
import { HotspotMarkers } from './HotspotMarkers';
import { Uploader } from './Uploader';
import type { ViewerState, EditorApi } from '../@types/app.types';
import type { Hotspot, HotspotType } from '../@types/hotspot.types';
import type { Viewpoint } from '../@types/viewpoint.types';
import './editor.css';

const HS_TYPES: HotspotType[] = ['text', 'image', 'video', 'link', 'portal'];
const HS_ICON: Record<HotspotType, string> = { image: '▣', video: '▶', text: 'i', link: '↗', portal: '⤢' };

type Selection = { type: 'hotspot' | 'track'; id: string };
interface Pose { x: number; y: number; z: number; yaw: number; }

/* ================================================================= */

export function EditorShell({ state, onPreview }: { state: ViewerState | null; onPreview: () => void }) {
  const [pane, setPane] = useState<'scene' | 'look'>('scene');
  const [sel, setSel] = useState<Selection | null>(null);
  const [pose, setPose] = useState<Pose | null>(null);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [, bump] = useReducer((n) => n + 1, 0);
  useUiConfig();

  useEffect(() => subscribeViewpoints(bump), []);
  useEffect(() => subscribeDoc(bump), []);

  useEffect(() => {
    if (!state?.editor) return;
    const id = setInterval(() => setPose(state.editor.getPose()), 160);
    return () => clearInterval(id);
  }, [state?.editor]);

  // Drop a selection that no longer exists (deleted, or scene switched).
  useEffect(() => {
    if (!state || !sel) return;
    const inTracks = (state.viewpoints || []).some((v) => v.id === sel.id);
    const inHs = hotspotsFor(state.activeId).some((h) => h.id === sel.id);
    if (!inTracks && !inHs) setSel(null);
  }, [state, sel]);

  if (!state) return <div className="ed2-boot">Loading editor…</div>;

  const ed = state.editor;
  const tracks = state.viewpoints || [];
  const hotspots = hotspotsFor(state.activeId);
  const selHotspot = sel?.type === 'hotspot' ? hotspots.find((h) => h.id === sel.id) : null;
  const selTrack = sel?.type === 'track' ? tracks.find((t) => t.id === sel.id) : null;

  const addTrack = () => {
    const v = ed.newViewFromPose(`Track ${tracks.length + 1}`);
    if (v?.id) setSel({ type: 'track', id: v.id });
  };
  const addHotspot = (type: HotspotType) => {
    const h = ed.addHotspot(type);
    if (h?.id) setSel({ type: 'hotspot', id: h.id });
  };

  return (
    <div className="ed2">
      <TopBar onPreview={onPreview} />

      <SceneTree
        state={state} tracks={tracks} hotspots={hotspots} sel={sel}
        onSelect={setSel} onAddTrack={addTrack} onAddHotspot={addHotspot}
        onNewSpace={() => setUploaderOpen(true)}
      />

      {uploaderOpen && (
        <Uploader
          onClose={() => setUploaderOpen(false)}
          onCreated={(id) => { setUploaderOpen(false); state.select(id); }}
        />
      )}

      <div className="ed2-inspector">
        {selHotspot ? (
          <HotspotInspector
            ed={ed} hs={selHotspot} activeId={state.activeId}
            onDelete={() => { ed.removeHotspot(selHotspot.id); setSel(null); }}
          />
        ) : selTrack ? (
          <TrackInspector
            ed={ed} track={selTrack}
            onDelete={() => { ed.removeViewpoint(selTrack.id); setSel(null); }}
            onBump={bump}
          />
        ) : (
          <>
            <div className="ed2-panetabs">
              {(['scene', 'look'] as const).map((p) => (
                <button key={p} className={p === pane ? 'on' : ''} onClick={() => setPane(p)}>
                  {p === 'scene' ? 'Scene' : 'Look'}
                </button>
              ))}
            </div>
            {pane === 'scene' && <WorldInspector state={state} pose={pose} onBump={bump} />}
            {pane === 'look' && <CustomizeInspector onBump={bump} />}
          </>
        )}
      </div>

      <Filmstrip
        vps={tracks} selId={selTrack?.id}
        onSelect={(id) => setSel({ type: 'track', id })}
        onPlay={(vp) => ed.play(vp)}
        onAdd={addTrack}
      />

      <HotspotMarkers
        mode="edit" selId={selHotspot?.id}
        onSelect={(id) => setSel({ type: 'hotspot', id })}
      />

      <div className="ed2-hint-strip">
        drag 3D to look · <b>WASD</b> move · <b>H</b> hotspot · <b>N</b> fly · scroll = dolly
      </div>
    </div>
  );
}

/* ----------------------------- top bar ---------------------------- */

function TopBar({ onPreview }: { onPreview: () => void }) {
  return (
    <div className="ed2-top">
      <div className="ed2-brand">
        <span className="ed2-dot" />
        <input
          className="ed2-proj"
          defaultValue={uiConfig.brand}
          onChange={(e) => setUiConfig({ brand: e.target.value })}
        />
      </div>
      <button className="ed2-preview" onClick={onPreview}>▶ Preview</button>
    </div>
  );
}

/* --------------------------- scene tree -------------------------- */

interface SceneTreeProps {
  state: ViewerState;
  tracks: Viewpoint[];
  hotspots: Hotspot[];
  sel: Selection | null;
  onSelect: (sel: Selection) => void;
  onAddTrack: () => void;
  onAddHotspot: (type: HotspotType) => void;
  onNewSpace: () => void;
}

function SceneTree({ state, tracks, hotspots, sel, onSelect, onAddTrack, onAddHotspot, onNewSpace }: SceneTreeProps) {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="ed2-left">
      <div className="ed2-tree-grp">
        Scenes
        <span className="ed2-tree-add" onClick={onNewSpace} title="New space">＋</span>
      </div>
      {SCENES.map((s) => (
        <button
          key={s.id}
          className={`ed2-tree-row ${s.id === state.activeId ? 'on' : ''}`}
          onClick={() => state.select(s.id)}
        >
          <span className="ed2-tree-ic">◈</span>{s.name}
        </button>
      ))}

      <div className="ed2-tree-grp">
        Hotspots <span className="ed2-tree-n">{hotspots.length}</span>
        <span className="ed2-tree-add" onClick={() => setAddOpen((v) => !v)}>＋</span>
      </div>
      {addOpen && (
        <div className="ed2-tree-addmenu">
          {HS_TYPES.map((t) => (
            <button key={t} onClick={() => { onAddHotspot(t); setAddOpen(false); }}>
              {HS_ICON[t]} {t}
            </button>
          ))}
        </div>
      )}
      {hotspots.map((h) => (
        <button
          key={h.id}
          className={`ed2-tree-row ${sel?.id === h.id ? 'on' : ''}`}
          onClick={() => onSelect({ type: 'hotspot', id: h.id })}
        >
          <span className="ed2-tree-ic">{HS_ICON[h.type] || '•'}</span>
          <span className="ed2-tree-nm">{h.label}</span>
        </button>
      ))}
      {!hotspots.length && <div className="ed2-tree-empty">press <b>H</b> to place one</div>}

      <div className="ed2-tree-grp">
        Camera tracks <span className="ed2-tree-n">{tracks.length}</span>
        <span className="ed2-tree-add" onClick={onAddTrack}>＋</span>
      </div>
      {tracks.map((t) => (
        <button
          key={t.id}
          className={`ed2-tree-row ${sel?.id === t.id ? 'on' : ''}`}
          onClick={() => onSelect({ type: 'track', id: t.id })}
        >
          <span className="ed2-tree-ic">▸</span>
          <span className="ed2-tree-nm">{t.label}</span>
          {!t.session && <span className="ed2-tree-lock">baked</span>}
        </button>
      ))}
    </div>
  );
}

/* --------------------------- Scene pane -------------------------- */

function WorldInspector({ state, pose, onBump }: { state: ViewerState; pose: Pose | null; onBump: () => void }) {
  const u = walkerCfg.unitScale || 1;
  const fmt = (n?: number) => (n ?? 0).toFixed(2);

  return (
    <>
      <Section title="Background">
        <div className="ed2-row">
          <input
            type="color" defaultValue={uiConfig.background}
            onChange={(e) => { setUiConfig({ background: e.target.value }); state.editor.setBackground(e.target.value); }}
          />
          <span className="ed2-muted">clear colour</span>
        </div>
      </Section>

      <Section title="Start view">
        <p className="ed2-pose">
          {pose ? `[${fmt(pose.x)}, ${fmt(pose.y)}, ${fmt(pose.z)}]  yaw ${fmt(pose.yaw)}` : '…'}
        </p>
        <div className="ed2-row">
          <button onClick={() => state.editor.setSceneSpawn()}>Set to current</button>
          <button onClick={() => state.editor.copySpawn()}>Copy</button>
        </div>
      </Section>

      <Section title="Movement mode">
        <Segmented
          value={walkerCfg.mode}
          options={[['walk', 'Walk'], ['fly', 'Fly'], ['orbit', 'Orbit']] as const}
          onChange={(m) => { walkerCfg.mode = m; onBump(); }}
        />
        <p className="ed2-muted ed2-fine">Fly and Orbit are studio-only authoring tools — the tour offers only Walk (CLAUDE.md §6.1).</p>
      </Section>

      <Section title="Feel">
        <Slider label="Eye level" value={walkerCfg.eyeHeight}
          min={0.2 * u} max={3 * u} step={0.01 * u}
          display={`${(walkerCfg.eyeHeight / u).toFixed(2)} m`}
          onChange={(x) => { walkerCfg.eyeHeight = x; onBump(); }} />
        <Slider label="Wall clearance" value={walkerCfg.radius}
          min={0.05 * u} max={1.5 * u} step={0.01 * u}
          display={`${(walkerCfg.radius / u).toFixed(2)} m`}
          onChange={(x) => { walkerCfg.radius = x; onBump(); }} />
        <Slider label="Near clip — fixes edge spikes" value={walkerCfg.near}
          min={0.02} max={1} step={0.01} display={walkerCfg.near.toFixed(2)}
          onChange={(x) => { walkerCfg.near = x; onBump(); }} />
        <Slider label="Movement speed" value={walkerCfg.speedMul}
          min={0.25} max={3} step={0.05} display={`${walkerCfg.speedMul.toFixed(2)}×`}
          onChange={(x) => { walkerCfg.speedMul = x; onBump(); }} />
        <div className="ed2-seg-mini">
          {([['Slow', 0.5], ['Normal', 1], ['Fast', 2]] as const).map(([l, v]) => (
            <button key={l} className={walkerCfg.speedMul === v ? 'on' : ''}
              onClick={() => { walkerCfg.speedMul = v; onBump(); }}>{l}</button>
          ))}
        </div>
        <p className="ed2-muted ed2-fine">unit scale ≈ {u.toFixed(3)}</p>
      </Section>

      <div className="ed2-row">
        <button className="ed2-export" onClick={() => state.editor.exportScene()}>
          ⧉ Copy scene JSON
        </button>
        <SaveToServerButton sceneId={state.activeId} />
      </div>
    </>
  );
}

/** Pushes the current scene doc to the Node API (server/src/routes/scenes.js
 *  PUT /api/scenes/:id). Requires an editor session cookie — there's no
 *  sign-in screen yet, so until one exists this only works once something
 *  (curl, a future login form) has called POST /api/auth/login. */
function SaveToServerButton({ sceneId }: { sceneId: string }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const save = async () => {
    setStatus('saving');
    try {
      await saveScene(sceneId, sceneDocFor(sceneId));
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  return (
    <span className="ed2-row">
      <button className="ed2-export" onClick={save} disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : '💾 Save to server'}
      </button>
      {status === 'error' && <span className="ed2-muted ed2-fine">{message}</span>}
    </span>
  );
}

/* --------------------------- Hotspot inspector ----------------- */

interface HotspotInspectorProps {
  ed: EditorApi;
  hs: Hotspot;
  activeId: string;
  onDelete: () => void;
}

function HotspotInspector({ ed, hs, activeId, onDelete }: HotspotInspectorProps) {
  const p = hs.payload || {};
  const set = (patch: Partial<Hotspot>) => ed.updateHotspot(hs.id, patch);
  const setPayload = (patch: Hotspot['payload']) => set({ payload: { ...p, ...patch } });

  return (
    <>
      <Section title={`Hotspot · ${hs.type}`}>
        <select className="ed2-name" value={hs.type} onChange={(e) => set({ type: e.target.value as HotspotType })}>
          {HS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          className="ed2-name" style={{ marginTop: 6 }}
          value={hs.label} onChange={(e) => set({ label: e.target.value })}
        />
      </Section>

      <Section title="Placement">
        <p className="ed2-pose">[{hs.position.map((n) => n.toFixed(2)).join(', ')}]</p>
        <div className="ed2-row">
          <button onClick={() => ed.placeHotspotAtCamera(hs.id)}>Place at camera</button>
          <button onClick={() => ed.lookAtHotspot(hs.id)}>Look at</button>
        </div>
        <Slider label="Trigger radius" value={hs.radius} min={0.1} max={3} step={0.05}
          display={`${hs.radius.toFixed(2)} m`} onChange={(x) => set({ radius: x })} />
      </Section>

      <Section title="Content">
        {hs.type === 'text' && (
          <textarea className="ed2-name ed2-area" rows={4}
            value={p.text || ''} onChange={(e) => setPayload({ text: e.target.value })} />
        )}
        {hs.type === 'image' && (
          <>
            <input className="ed2-name" placeholder="image URL"
              value={p.url || ''} onChange={(e) => setPayload({ url: e.target.value })} />
            <input className="ed2-name" style={{ marginTop: 6 }} placeholder="caption"
              value={p.caption || ''} onChange={(e) => setPayload({ caption: e.target.value })} />
          </>
        )}
        {hs.type === 'video' && (
          <input className="ed2-name" placeholder="video URL (mp4)"
            value={p.url || ''} onChange={(e) => setPayload({ url: e.target.value })} />
        )}
        {hs.type === 'link' && (
          <>
            <input className="ed2-name" placeholder="https://…"
              value={p.url || ''} onChange={(e) => setPayload({ url: e.target.value })} />
            <input className="ed2-name" style={{ marginTop: 6 }} placeholder="button text"
              value={p.text || ''} onChange={(e) => setPayload({ text: e.target.value })} />
          </>
        )}
        {hs.type === 'portal' && (
          <select className="ed2-name" value={p.sceneId || ''}
            onChange={(e) => setPayload({ sceneId: e.target.value })}>
            <option value="">— pick a scene —</option>
            {SCENES.filter((s) => s.id !== activeId).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </Section>

      <div className="ed2-row ed2-viewactions">
        <button className="ed2-del" onClick={onDelete}>🗑 Delete hotspot</button>
      </div>
    </>
  );
}

/* --------------------------- Track inspector ------------------- */

interface TrackInspectorProps {
  ed: EditorApi;
  track: Viewpoint;
  onDelete: () => void;
  onBump: () => void;
}

function TrackInspector({ ed, track, onDelete, onBump }: TrackInspectorProps) {
  const editable = !!track.session;
  return (
    <>
      <Section title="Camera track">
        <input
          className="ed2-name" defaultValue={track.label} key={track.id} disabled={!editable}
          onChange={(e) => editable && ed.renameView(track.id, e.target.value)}
        />
        {!editable && <p className="ed2-muted ed2-fine">baked in code — read-only</p>}
      </Section>

      <Section title="Timing">
        <Slider label="Length" value={track.seconds || 4} min={1} max={12} step={0.5}
          display={`${track.seconds || 4}s`}
          onChange={(x) => editable && (ed.setViewSeconds(track.id, x), onBump())} />
      </Section>

      <Section title={`Path — ${track.path?.length || 0} waypoint(s)`}>
        {editable && (
          <div className="ed2-row">
            <button onClick={() => ed.updateViewToCurrent(track.id)}>Set to current</button>
            <button onClick={() => ed.appendWpTo(track.id)}>＋ Waypoint</button>
          </div>
        )}
        <ol className="ed2-wps">
          {(track.path || []).map((w, i) => (
            <li key={i}>
              <span>#{i + 1} [{w.pos.map((n) => n.toFixed(1)).join(', ')}]</span>
              {editable && track.path.length > 1 && (
                <button onClick={() => ed.removeWpFrom(track.id, i)}>✕</button>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <div className="ed2-row ed2-viewactions">
        <button className="ed2-play" onClick={() => ed.play(track)}>▶ Play</button>
        {editable && <button className="ed2-del" onClick={onDelete}>🗑 Delete</button>}
      </div>
      <button className="ed2-export" onClick={() => ed.exportAll()}>⧉ Copy tracks JSON</button>
    </>
  );
}

/* -------------------------- Look pane ------------------------- */

function CustomizeInspector({ onBump }: { onBump: () => void }) {
  const ui = uiConfig;
  return (
    <>
      <Section title="Brand">
        <input className="ed2-name" defaultValue={ui.brand}
          onChange={(e) => setUiConfig({ brand: e.target.value })} />
        <Toggle label="Show brand on tour" value={ui.showBrand}
          onChange={(v) => { setUiConfig({ showBrand: v }); onBump(); }} />
        <div className="ed2-row">
          <input type="color" defaultValue={ui.accent}
            onChange={(e) => { setUiConfig({ accent: e.target.value }); onBump(); }} />
          <span className="ed2-muted">accent colour</span>
        </div>
      </Section>

      <Section title="View labels">
        <Toggle label="Show labels in the dock" value={ui.showLabels}
          onChange={(v) => { setUiConfig({ showLabels: v }); onBump(); }} />
        <Segmented value={ui.labelAlign}
          options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']] as const}
          onChange={(a) => { setUiConfig({ labelAlign: a }); onBump(); }} />
      </Section>
    </>
  );
}

/* --------------------------- filmstrip ------------------------- */

interface FilmstripProps {
  vps: Viewpoint[];
  selId?: string;
  onSelect: (id: string) => void;
  onPlay: (vp: Viewpoint) => void;
  onAdd: () => void;
}

function Filmstrip({ vps, selId, onSelect, onPlay, onAdd }: FilmstripProps) {
  return (
    <div className="ed2-strip">
      {vps.map((vp) => (
        <button
          key={vp.id}
          className={`ed2-tile ${vp.id === selId ? 'on' : ''}`}
          onClick={() => (vp.id === selId ? onPlay(vp) : onSelect(vp.id))}
          title={vp.id === selId ? 'click again to play' : vp.label}
        >
          {vp.thumb ? <img src={vp.thumb} alt="" /> : <span className="ed2-tile-ph" />}
          <span className="ed2-tile-nm">{vp.label}</span>
        </button>
      ))}
      <button className="ed2-tile ed2-tile-add" onClick={onAdd}>＋</button>
    </div>
  );
}

/* --------------------------- primitives ----------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ed2-sect">
      <div className="ed2-lbl">{title}</div>
      {children}
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step, display, onChange }: SliderProps) {
  return (
    <label className="ed2-slider">
      <span className="ed2-slider-top">
        <span>{label}</span>
        <span className="ed2-slider-val">{display}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="ed2-seg">
      {options.map(([v, l]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className={`ed2-toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}>
      <span className="ed2-toggle-knob" />
      <span>{label}</span>
    </button>
  );
}
