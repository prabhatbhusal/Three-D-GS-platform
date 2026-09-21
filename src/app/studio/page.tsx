'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createProperty, deleteProperty, getProperties, getScenes, moveSceneToProperty, renameProperty, LAST_PROJECT_KEY
} from '../../lib/api';
import { useStudioSession } from '../../lib/useStudioSession';
import { ThemeToggle } from '../../components/ThemeToggle';
import { NewProjectDialog } from '../../components/NewProjectDialog';
import type { ApiScene, Property } from '../../@types/scene.types';
import '../../components/editor.css';

/**
 * The studio's front door: one card per client project (a "property" in the
 * code and schema, §0.2). Each project keeps its own spaces, so Basera's
 * rooms and Nepathya College's classrooms never share a list. Spaces made
 * before projects existed, or whose project was deleted, wait in "Not in a
 * project yet" until someone files them.
 *
 * Links here are plain <a>, not <Link>: the editor behind each card holds a
 * page-singleton renderer (LCCRender), and only a full page load gives every
 * project a clean one.
 */
export default function StudioPage() {
  const ok = useStudioSession('/studio');
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [scenes, setScenes] = useState<ApiScene[]>([]);
  const [error, setError] = useState('');
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    try { setLast(localStorage.getItem(LAST_PROJECT_KEY)); } catch { /* private mode */ }
  }, []);

  const load = useCallback(() => {
    setError('');
    Promise.all([getProperties(), getScenes()])
      .then(([p, s]) => { setProperties(p ?? []); setScenes(s ?? []); })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : '';
        // A 404 here means the API process predates projects: it's running
        // old code, not missing data. Say so instead of a bare status line.
        setError(/^404\b/.test(msg)
          ? 'The studio server is running an older version without projects. Restart it: cd server && npm run dev (it reloads itself after that).'
          : msg || 'The studio server isn’t answering.');
      });
  }, []);
  useEffect(() => { if (ok) load(); }, [ok, load]);

  if (!ok) return <div className="ed2-boot">Checking your session…</div>;

  const known = new Set((properties ?? []).map((p) => p.id));
  const loose = scenes.filter((s) => !s.propertyId || !known.has(s.propertyId));
  // Last opened first, so the project you're working on is the first card.
  const ordered = [...(properties ?? [])].sort((a, b) => Number(b.id === last) - Number(a.id === last));

  return (
    <div className="ed2">
      <main className="pl">
        <header className="pl-top">
          <span className="pl-brand"><span className="ed2-dot" />Studio</span>
          <ThemeToggle className="ed2-theme" />
        </header>

        <section className="pl-body">
          <div className="pl-head">
            <div>
              <h1>Projects</h1>
              <p className="pl-sub">One per client: a hotel, a college, a campus. Each keeps its own spaces.</p>
            </div>
            {properties && <NewProjectButton />}
          </div>

          {error && (
            <div className="pl-empty">
              <p>{error}</p>
              <button className="pl-btn" onClick={load}>Try again</button>
            </div>
          )}
          {!properties && !error && <p className="pl-sub">Loading projects…</p>}

          {properties && properties.length === 0 && !loose.length && (
            <div className="pl-empty">
              <p>No projects yet. Add your first client with <b>New project</b>.</p>
            </div>
          )}

          {properties && properties.length > 0 && (
            <div className="pl-grid">
              {ordered.map((p) => (
                <ProjectCard key={p.id} project={p} current={p.id === last} onChanged={load} />
              ))}
            </div>
          )}

          {/* Always shown when there are unfiled spaces — with no projects at
           *  all, this is the only way back to them. */}
          {properties && loose.length > 0 && (
            <div className="pl-loose">
              <div className="pl-loose-head">
                <div>
                  <h2>Not in a project yet</h2>
                  <p className="pl-sub">
                    {loose.length === 1 ? '1 space' : `${loose.length} spaces`} made before projects, or left when a project was deleted.
                    Group them into a project to open them, or move each one into its client.
                  </p>
                </div>
                <GroupLoose spaces={loose} onDone={load} />
              </div>
              {loose.map((s) => (
                <LooseSpace key={s.id} scene={s} properties={properties} onMoved={load} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/** One project: open it, or rename / delete it from the ⋯ menu. */
function ProjectCard({ project, current, onChanged }: { project: Property; current: boolean; onChanged: () => void }) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(project.title);
  const [error, setError] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const count = project.spaceCount ?? 0;

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const saveName = async () => {
    const next = draft.trim();
    if (!next || next === project.title) { setRenaming(false); setDraft(project.title); return; }
    try {
      await renameProperty(project.id, next);
      setRenaming(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename it. Try again.');
    }
  };

  const remove = async () => {
    setMenu(false);
    const spaces = count === 1 ? 'Its 1 space moves' : `Its ${count} spaces move`;
    if (!window.confirm(`Delete the project "${project.title}"?\n\n${count ? `${spaces} to "Not in a project yet". ` : ''}No space is deleted and published tours keep working.`)) return;
    try {
      await deleteProperty(project.id);
      try { if (localStorage.getItem(LAST_PROJECT_KEY) === project.id) localStorage.removeItem(LAST_PROJECT_KEY); } catch { /* private mode */ }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete it. Try again.');
    }
  };

  return (
    <div className={`pl-card ${current ? 'is-current' : ''}`}>
      <span className="pl-card-tile" aria-hidden>{project.title.trim()[0]}</span>
      <span className="pl-card-txt">
        {renaming ? (
          <input
            className="pl-rename" value={draft} autoFocus maxLength={80} aria-label="Project name"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              else if (e.key === 'Escape') { setDraft(project.title); setRenaming(false); }
            }}
          />
        ) : (
          // The whole card opens the project; the menu button sits above this link.
          <a className="pl-card-title pl-card-link" href={`/studio/${project.id}`}>{project.title}</a>
        )}
        <span className="pl-card-meta">
          {count === 1 ? '1 space' : `${count} spaces`}
          {current && <span className="pl-tag">Last opened</span>}
        </span>
        {error && <span className="ed2-warn ed2-fine">{error}</span>}
      </span>

      <div className="pl-menu" ref={menuRef}>
        <button className="pl-menu-btn" aria-label={`More actions for ${project.title}`} aria-expanded={menu} onClick={() => setMenu((v) => !v)}>⋯</button>
        {menu && (
          <div className="pl-menu-list" role="menu">
            <button role="menuitem" onClick={() => { setMenu(false); setError(''); setDraft(project.title); setRenaming(true); }}>Rename</button>
            <button role="menuitem" className="is-danger" onClick={remove}>Delete project</button>
          </div>
        )}
      </div>
    </div>
  );
}

function NewProjectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="pl-btn pl-btn-main" onClick={() => setOpen(true)}>＋ New project</button>
      {open && <NewProjectDialog onClose={() => setOpen(false)} />}
    </>
  );
}

/** Put every unfiled space into one new project (named "Demo project" unless
 *  changed), then open it. The way back to the pre-projects studio. */
function GroupLoose({ spaces, onDone }: { spaces: ApiScene[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const group = async () => {
    const name = window.prompt(`Name the project for these ${spaces.length} spaces:`, 'Demo project');
    if (!name?.trim()) return;
    setBusy(true);
    setError('');
    try {
      const p = await createProperty(name);
      if (!p) throw new Error('The server did not confirm the project. Try again.');
      for (const s of spaces) await moveSceneToProperty(s.id, p.id);
      location.assign(`/studio/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not group them. Try again.');
      setBusy(false);
      onDone();
    }
  };
  return (
    <div className="pl-group">
      <button className="pl-btn pl-btn-main" disabled={busy} onClick={group}>{busy ? 'Grouping…' : 'Group into a project'}</button>
      {error && <p className="ed2-warn ed2-fine">{error}</p>}
    </div>
  );
}

function LooseSpace({ scene, properties, onMoved }: { scene: ApiScene; properties: Property[]; onMoved: () => void }) {
  const [error, setError] = useState('');
  return (
    <div className="pl-row">
      <span className="pl-row-name">{scene.title ?? scene.id}</span>
      <select
        className="pl-select" value="" aria-label={`Move ${scene.title ?? scene.id} to a project`}
        onChange={(e) => {
          const to = e.target.value;
          if (!to) return;
          setError('');
          moveSceneToProperty(scene.id, to)
            .then(onMoved)
            .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not move it. Try again.'));
        }}
      >
        <option value="">Move to…</option>
        {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select>
      {error && <p className="ed2-warn ed2-fine">{error}</p>}
    </div>
  );
}
