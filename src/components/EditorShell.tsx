'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { transformFor, setTransform, subscribeTransform, gizmo, setGizmoMode } from '../lib/transform';
import { SCENES, SCENE_BY_ID, renameScene, setSessionSpawn } from '../lib/scenes';
import { walkerCfg } from '../lib/walkerConfig';
import { subscribeViewpoints } from '../lib/viewpoints';
import { hotspotsFor, subscribeDoc, sceneDocFor, loadSceneDoc, markSaved, hasUnsavedChanges } from '../lib/sceneDoc';
import { uiConfig, setUiConfig, useUiConfig } from '../lib/uiConfig';
import {
  saveScene, getSession, logout, getPublishState, publishSceneNow, unpublishScene, revertScene
} from '../lib/api';
import type { SessionUser, PublishState } from '../lib/api';
import { HotspotMarkers } from './HotspotMarkers';
import { Uploader } from './Uploader';
import { ThemeToggle } from './ThemeToggle';
import type { ViewerState, EditorApi } from '../@types/app.types';
import type { Hotspot, HotspotType } from '../@types/hotspot.types';
import type { Scene } from '../@types/scene.types';
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
  // Session-only, like every other studio edit (§19) — "Save to server" writes
  // it, because sceneDocFor() reads `title` off the same object.
  const doRename = (sceneId: string, name: string) => {
    if (renameScene(sceneId, name)) bump();
  };

  return (
    <div className="ed2">
      <TopBar onPreview={onPreview} sceneId={state.activeId} />

      <SceneTree
        state={state} tracks={tracks} hotspots={hotspots} sel={sel}
        onSelect={setSel} onAddTrack={addTrack} onAddHotspot={addHotspot}
        onNewSpace={() => setUploaderOpen(true)} onRename={doRename}
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

function TopBar({ onPreview, sceneId }: { onPreview: () => void; sceneId: string }) {
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
      <SaveToServerButton sceneId={sceneId} />
      <PublishButton sceneId={sceneId} />
      <ThemeToggle className="ed2-theme" />
      <Account />
    </div>
  );
}

/* ----------------------------- publish ---------------------------- */

const EMBED_SIZES = [
  { label: 'Responsive', w: '100%', h: '600' },
  { label: '1280 × 720', w: '1280', h: '720' },
  { label: '800 × 500', w: '800', h: '500' }
] as const;

function PublishButton({ sceneId }: { sceneId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="ed2-pubbtn" onClick={() => setOpen(true)}>Publish</button>
      {/* Portalled: the top bar is its own stacking context, so a dialog inside
       *  it could sit under the inspector. The .ed2 wrapper keeps the tokens. */}
      {open && createPortal(
        <div className="ed2"><PublishPanel sceneId={sceneId} onClose={() => setOpen(false)} /></div>,
        document.body
      )}
    </>
  );
}

/** §7.5: publish snapshots the saved draft; visitors only ever see a
 *  published version, so editing never changes a live tour. */
function PublishPanel({ sceneId, onClose }: { sceneId: string; onClose: () => void }) {
  const [info, setInfo] = useState<PublishState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [size, setSize] = useState(0);
  const [copied, setCopied] = useState('');

  const refresh = () => getPublishState(sceneId).then(setInfo).catch((e: Error) => setError(e.message));
  useEffect(() => { refresh(); }, [sceneId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label); setError(''); setNote('');
    try {
      const msg = await fn();
      if (msg) setNote(msg);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const publish = () => run('publish', async () => {
    if (hasUnsavedChanges(sceneId)) {
      await loadSceneDoc(sceneId);
      const sent = sceneDocFor(sceneId);
      await saveScene(sceneId, sent);
      markSaved(sceneId, sent);
    }
    const r = await publishSceneNow(sceneId);
    if (!r.published) throw new Error(r.blockers?.join(' ') || 'Publish was refused.');
    return `Published version ${r.version}. Visitors see it now.`;
  });
  const unpublish = () => run('unpublish', async () => {
    await unpublishScene(sceneId);
    return 'Unpublished. The link now shows a "not published" page.';
  });
  const revert = () => {
    if (!confirm('Throw away every change since the last publish?')) return;
    run('revert', async () => {
      const doc = await revertScene(sceneId);
      if (doc) {
        await loadSceneDoc(sceneId, 'draft', { force: true });
        renameScene(sceneId, doc.title);
        const p = doc.spawn?.position;
        if (Array.isArray(p) && p.length === 3) setSessionSpawn(sceneId, p as [number, number, number], doc.spawn.yaw ?? 0);
      }
      return 'Reverted to the published version.';
    });
  };

  const url = `${location.origin}/tour?space=${encodeURIComponent(sceneId)}`;
  const s = EMBED_SIZES[size];
  const snippet = `<iframe src="${url}&embed=1" width="${s.w}" height="${s.h}" style="border:0" allow="fullscreen; xr-spatial-tracking" allowfullscreen loading="lazy" title="3D tour"></iframe>`;
  const copy = (what: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(''), 1600); });
  };

  const live = info?.status === 'published';
  const when = info?.publishedAt ? new Date(info.publishedAt).toLocaleString() : '';

  return (
    <div className="up-scrim" onClick={onClose}>
      <div className="up-panel pub-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Publish">
        <header className="up-head">
          <h2>Publish {SCENE_BY_ID[sceneId]?.name ?? sceneId}</h2>
          <button className="up-x" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {!info && !error && <p className="up-sub">Checking…</p>}
        {info && (
          <p className={`pub-status ${live ? 'is-live' : ''}`}>
            <span className="ed2-save-dot" aria-hidden />
            {live
              ? `Live: visitors see version ${info.publishedVersion}, published ${when}. Edits stay private until you publish again.`
              : 'Not published. Visitors can’t open this space.'}
          </p>
        )}

        {!!info?.blockers.length && (
          <ul className="pub-list is-block">{info.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        )}
        {!!info?.warnings.length && (
          <ul className="pub-list is-warn">{info.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        )}

        <div className="pub-actions">
          <button className="up-create" onClick={publish} disabled={!!busy || !info || info.blockers.length > 0}>
            {busy === 'publish' ? 'Publishing…' : live ? 'Publish changes' : 'Publish space'}
          </button>
          {live && (
            <>
              <button className="pub-secondary" onClick={revert} disabled={!!busy}>
                {busy === 'revert' ? 'Reverting…' : 'Revert to published'}
              </button>
              <button className="pub-secondary is-danger" onClick={unpublish} disabled={!!busy}>
                {busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
              </button>
            </>
          )}
        </div>
        {note && <p className="pub-note">{note}</p>}
        {error && <p className="up-error">{error}</p>}

        {live && (
          <div className="pub-share">
            <p className="pub-label">Link</p>
            <div className="pub-copyrow">
              <input readOnly value={url} onFocus={(e) => e.target.select()} />
              <button onClick={() => copy('link', url)}>{copied === 'link' ? 'Copied' : 'Copy'}</button>
              <a href={url} target="_blank" rel="noreferrer">Open</a>
            </div>

            <p className="pub-label">Embed on a website</p>
            <div className="pub-sizes">
              {EMBED_SIZES.map((o, i) => (
                <button key={o.label} className={i === size ? 'on' : ''} onClick={() => setSize(i)}>{o.label}</button>
              ))}
            </div>
            <div className="pub-copyrow">
              <textarea readOnly rows={3} value={snippet} onFocus={(e) => e.target.select()} />
              <button onClick={() => copy('embed', snippet)}>{copied === 'embed' ? 'Copied' : 'Copy'}</button>
            </div>
            <p className="up-slot-hint">
              Paste this into the client&apos;s page. It needs no build step. Embed tokens aren&apos;t enforced yet, so anyone with the link can view it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact account menu on the editor top bar. Profile / Settings open a side
 *  panel, while Log out keeps the close action in the same menu surface. */
function Account() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailView, setDetailView] = useState<'profile' | 'settings' | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    getSession()
      .then((s) => { if (active) setUser(s?.user ?? null); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setDetailView(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const closeMenu = () => {
    setMenuOpen(false);
    setDetailView(null);
  };

  const openDetail = (view: 'profile' | 'settings') => {
    setMenuOpen(false);
    setDetailView(view);
  };

  const handleLogout = async () => {
    closeMenu();
    await logout().catch(() => {});
    setUser(null);
    location.assign('/login');
  };

  const initials = user?.name
    ? user.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('').slice(0, 2)
    : 'U';

  if (!user) return null;

  return (
    <div className="ed2-account" ref={menuRef}>
      <button
        type="button"
        className="ed2-user-trigger"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <span className="ed2-avatar" aria-hidden>{initials}</span>
        <span className="ed2-user-name">{user.name}</span>
        <svg viewBox="0 0 20 20" className={menuOpen ? 'ed2-caret open' : 'ed2-caret'} aria-hidden>
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {menuOpen && !detailView && (
          <motion.div
            className="ed2-user-menu"
            role="menu"
            aria-label="User account menu"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          >
            <button type="button" className="ed2-user-option" onClick={() => openDetail('profile')}>Profile</button>
            <button type="button" className="ed2-user-option" onClick={() => openDetail('settings')}>Settings</button>
            <button type="button" className="ed2-user-option ed2-user-option-danger" onClick={handleLogout}>Log out</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailView && (
          <motion.div
            className="ed2-account-backdrop"
            onClick={closeMenu}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.aside
              className="ed2-account-drawer open"
              role="dialog"
              aria-modal="true"
              aria-label={detailView === 'profile' ? 'Profile panel' : 'Settings panel'}
              onClick={(event) => event.stopPropagation()}
              initial={{ x: 42, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 42, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            >
              <div className="ed2-account-drawer-header">
                <div className="ed2-account-drawer-meta">
                  <span className="ed2-avatar" aria-hidden>{initials}</span>
                  <div>
                    <div className="ed2-account-label">{detailView === 'profile' ? 'Profile' : 'Settings'}</div>
                    <div className="ed2-account-email">{user.email}</div>
                  </div>
                </div>
                <button type="button" className="ed2-account-close" onClick={closeMenu} aria-label="Close panel">×</button>
              </div>

              <div className="ed2-account-drawer-body">
                <div className="ed2-sheet-card">
                  <div className="ed2-sheet-kicker">{detailView === 'profile' ? 'Account' : 'Preferences'}</div>
                  <h3>{detailView === 'profile' ? user.name : 'Studio settings'}</h3>
                  <p>
                    {detailView === 'profile'
                      ? user.email
                      : 'Theme, workspace preferences, and session details live here.'}
                  </p>
                </div>

                {detailView === 'profile' ? (
                  <div className="ed2-sheet-list">
                    <div><span>Name</span><strong>{user.name}</strong></div>
                    <div><span>Email</span><strong>{user.email}</strong></div>
                    <div><span>Role</span><strong>Editor</strong></div>
                  </div>
                ) : (
                  <div className="ed2-sheet-list">
                    <div><span>Theme</span><ThemeToggle className="ed2-theme" /></div>
                    <div><span>Notifications</span><strong>Enabled</strong></div>
                    <div><span>Session</span><strong>Secure</strong></div>
                  </div>
                )}
              </div>

              <div className="ed2-account-drawer-footer">
                <button type="button" className="ed2-account-dismiss" onClick={closeMenu}>Close</button>
                <button type="button" className="ed2-user-option ed2-user-option-danger" onClick={handleLogout}>Log out</button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --------------------------- scene tree -------------------------- */

/** One scene in the tree. Double-click (or F2 when it has focus) turns the row
 *  into a field; Enter or blur commits, Escape puts the old name back. */
function SceneRow({ scene, active, onSelect, onRename }: {
  scene: Scene;
  active: boolean;
  onSelect: () => void;
  onRename: (sceneId: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scene.name);

  const open = () => { setDraft(scene.name); setEditing(true); };

  if (editing) {
    const commit = () => { onRename(scene.id, draft); setEditing(false); };
    return (
      <input
        className="ed2-tree-rename"
        value={draft}
        autoFocus
        aria-label={`Rename ${scene.name}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setEditing(false);
        }}
        onFocus={(e) => e.target.select()}
      />
    );
  }

  return (
    <button
      className={`ed2-tree-row ${active ? 'on' : ''}`}
      onClick={onSelect}
      onDoubleClick={open}
      onKeyDown={(e) => { if (e.key === 'F2') { e.preventDefault(); open(); } }}
      title="Double-click to rename"
    >
      <span className="ed2-tree-ic">◈</span>
      <span className="ed2-tree-nm">{scene.name}</span>
    </button>
  );
}

interface SceneTreeProps {
  state: ViewerState;
  tracks: Viewpoint[];
  hotspots: Hotspot[];
  sel: Selection | null;
  onSelect: (sel: Selection) => void;
  onAddTrack: () => void;
  onAddHotspot: (type: HotspotType) => void;
  onNewSpace: () => void;
  onRename: (sceneId: string, name: string) => void;
}

function SceneTree({ state, tracks, hotspots, sel, onSelect, onAddTrack, onAddHotspot, onNewSpace, onRename }: SceneTreeProps) {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="ed2-left">
      <div className="ed2-tree-grp">
        Scenes
        <span className="ed2-tree-add" onClick={onNewSpace} title="New space">＋</span>
      </div>
      {SCENES.map((s) => (
        <SceneRow
          key={s.id}
          scene={s}
          active={s.id === state.activeId}
          onSelect={() => state.select(s.id)}
          onRename={onRename}
        />
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
      <PlacementSection state={state} />

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
      </div>
    </>
  );
}

/** Pushes the current scene doc to the Node API (server/src/routes/scenes.js
 *  PUT /api/scenes/:id). Requires an editor session cookie — there's no
 *  sign-in screen yet, so until one exists this only works once something
 *  (curl, a future login form) has called POST /api/auth/login. */
/** Saves the OPEN space only, and says exactly what went to the server. */
function SaveToServerButton({ sceneId }: { sceneId: string }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [lastSaved, setLastSaved] = useState<{ at: Date; summary: string } | null>(null);
  const dirty = hasUnsavedChanges(sceneId);

  useEffect(() => { setLastSaved(null); setStatus('idle'); }, [sceneId]);
  useEffect(() => {
    if (!lastSaved) return;
    const t = setTimeout(() => setLastSaved(null), 6000);
    return () => clearTimeout(t);
  }, [lastSaved]);

  const save = async () => {
    setStatus('saving');
    try {
      // Read the saved doc first: saving blind would overwrite fields the
      // studio doesn't edit (uploaded variants, transform, status).
      await loadSceneDoc(sceneId);
      const sent = sceneDocFor(sceneId);
      await saveScene(sceneId, sent);
      markSaved(sceneId, sent);
      const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
      setLastSaved({
        at: new Date(),
        summary: `"${sent.title}": ${n(sent.tracks.length, 'camera track')}, ${n(sent.hotspots.length, 'hotspot')}, start view, name`
      });
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  return (
    <div className="ed2-save">
      <span
        className={`ed2-save-state ${dirty ? 'is-dirty' : 'is-clean'}`}
        title="Saves only the space that's open. Other spaces keep their changes until you open and save them."
      >
        <span className="ed2-save-dot" aria-hidden />
        {dirty ? 'Unsaved changes' : 'All changes saved'}
      </span>
      <button className="ed2-savebtn" onClick={save} disabled={status === 'saving' || !dirty}>
        {status === 'saving' ? 'Saving…' : 'Save space'}
      </button>
      {(lastSaved || status === 'error') && (
        <p className={`ed2-save-toast ${status === 'error' ? 'is-err' : ''}`} role="status">
          {status === 'error'
            ? `Not saved: ${message}`
            : `Saved at ${lastSaved!.at.toLocaleTimeString()}. ${lastSaved!.summary}.`}
        </p>
      )}
    </div>
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

/* ------------------------ model placement ------------------------ */

const MOVE_STEPS = [0.01, 0.1, 1] as const;
const TURN_STEPS = [1, 15, 90] as const;

/** Move / rotate / scale the model (§7.2): gizmo tool, exact numbers, and
 *  ‹ › steppers that repeat while held. Numbers are the saved transform. */
function PlacementSection({ state }: { state: ViewerState }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeTransform(bump), []);
  const [moveStep, setMoveStep] = useState<number>(0.1);
  const [turnStep, setTurnStep] = useState<number>(15);
  const [note, setNote] = useState('');
  const id = state.activeId;
  const t = transformFor(id);

  const setAxis = (key: 'position' | 'rotation', i: number, value: number) => {
    const next = [...t[key]] as [number, number, number];
    next[i] = value;
    setTransform(id, { [key]: next });
  };

  return (
    <Section title="Model placement">
      <Segmented
        value={gizmo.mode}
        options={[['off', 'Off'], ['translate', 'Move'], ['rotate', 'Rotate'], ['scale', 'Scale']] as const}
        onChange={(m) => setGizmoMode(m)}
      />
      <p className="ed2-muted ed2-fine">
        Drag the handles in the view. <b>G</b> move, <b>R</b> rotate, <b>T</b> scale, <b>Esc</b> off. Hold <b>Ctrl</b> to snap.
      </p>

      <div className="ed2-xform-head">
        <span>Position</span>
        <StepSize value={moveStep} options={MOVE_STEPS} unit="m" onChange={setMoveStep} />
      </div>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <Stepper key={axis} axis={axis} value={t.position[i]} step={moveStep} digits={3} unit="m"
          onChange={(v) => setAxis('position', i, v)} />
      ))}

      <div className="ed2-xform-head">
        <span>Rotation</span>
        <StepSize value={turnStep} options={TURN_STEPS} unit="°" onChange={setTurnStep} />
      </div>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <Stepper key={axis} axis={axis} value={t.rotation[i]} step={turnStep} digits={1} unit="°"
          onChange={(v) => setAxis('rotation', i, v)} />
      ))}

      <div className="ed2-xform-head"><span>Scale</span></div>
      <Stepper axis="S" value={t.scale} step={0.01} digits={3} unit="×"
        onChange={(v) => setTransform(id, { scale: v })} />

      <div className="ed2-row">
        <button onClick={() => setNote(state.editor.dropToFloor())}>Floor to 0 m</button>
        <button onClick={() => { state.editor.resetTransform(); setNote('Placement reset.'); }}>Reset</button>
      </div>
      {note && <p className="ed2-muted ed2-fine">{note}</p>}
      <p className="ed2-muted ed2-fine">
        Place the model first. Moving it later doesn&apos;t move tracks, hotspots or the start view you already set.
      </p>
    </Section>
  );
}

function StepSize({ value, options, unit, onChange }: {
  value: number; options: readonly number[]; unit: string; onChange: (v: number) => void;
}) {
  return (
    <span className="ed2-stepsize" role="group" aria-label="Step size">
      {options.map((o) => (
        <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{o}{unit}</button>
      ))}
    </span>
  );
}

/** A number field with ‹ › buttons. Press and hold a button to keep stepping. */
function Stepper({ axis, value, step, digits, unit, onChange }: {
  axis: 'X' | 'Y' | 'Z' | 'S'; value: number; step: number; digits: number; unit: string;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);

  const nudge = (dir: 1 | -1) => {
    const next = Number((valueRef.current + dir * step).toFixed(6));
    valueRef.current = next;
    onChange(next);
  };
  const hold = (dir: 1 | -1) => {
    nudge(dir);
    const repeat = (delay: number) => {
      timer.current = setTimeout(() => { nudge(dir); repeat(Math.max(40, delay * 0.85)); }, delay);
    };
    repeat(350);
  };
  const btn = (dir: 1 | -1, label: string) => (
    <button
      className="ed2-step-btn"
      aria-label={`${dir < 0 ? 'Decrease' : 'Increase'} ${axis} by ${step}${unit}`}
      onPointerDown={(e) => { e.preventDefault(); hold(dir); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nudge(dir); } }}
    >{label}</button>
  );

  return (
    <div className={`ed2-step ed2-step-${axis.toLowerCase()}`}>
      <span className="ed2-step-axis">{axis}</span>
      {btn(-1, '‹')}
      <input
        className="ed2-step-num"
        inputMode="decimal"
        value={draft ?? value.toFixed(digits)}
        onFocus={(e) => { setDraft(value.toFixed(digits)); e.target.select(); }}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            nudge(e.key === 'ArrowUp' ? 1 : -1);
            setDraft(null);
          }
        }}
      />
      {btn(1, '›')}
      <span className="ed2-step-unit">{unit}</span>
    </div>
  );
}

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
