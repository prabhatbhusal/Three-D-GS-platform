'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createProperty, deleteProperty, getProperties, getProperty, getScenes, moveSceneToProperty, renameProperty,
  addPropertyMember, removePropertyMember, getSession, getActivity, getProjectLeads, setProjectLeadEmails, projectLeadsCsvUrl, type ProjectLeads, setProjectTheme, uploadProjectLogo, removeProjectLogo, API_BASE_URL, LAST_PROJECT_KEY, type SessionUser, type ActivityEntry
} from '../../lib/api';
import { useStudioSession } from '../../lib/useStudioSession';
import { ThemeToggle } from '../../components/ThemeToggle';
import { NewProjectDialog } from '../../components/NewProjectDialog';
import { TeamDialog } from '../../components/TeamDialog';
import type { ApiScene, Property } from '../../@types/scene.types';
import type { BrandFont, ProjectTheme } from '../../@types/config.types';
import '../../components/editor.css';

/** Owner/admin can rename, delete or share it; a project without an owner
 *  (made before ownership existed) is everyone's to manage, same as always. */
const canManage = (p: Property, me: SessionUser | null) =>
  !me || me.role === 'admin' || p.ownerId === null || p.ownerId === me.id;

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
  const [me, setMe] = useState<SessionUser | null>(null);
  const [team, setTeam] = useState(false);

  useEffect(() => {
    try { setLast(localStorage.getItem(LAST_PROJECT_KEY)); } catch { /* private mode */ }
  }, []);

  useEffect(() => { getSession().then((s) => setMe(s?.user ?? null)).catch(() => {}); }, []);

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
          <span className="pl-brand">
            <a href="/" className="ed2-home" aria-label="Home" title="Home">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M3 11 12 4l9 7" /><path d="M5 10v10h5v-6h4v6h5V10" /><rect className="ed2-home-door" x="10.6" y="14.6" width="2.8" height="5" rx="0.6" /></svg>
            </a>
            Studio
          </span>
          <span className="pl-top-actions">
            {me?.role === 'admin' && <button className="pl-btn" onClick={() => setTeam(true)}>Team</button>}
            <ThemeToggle className="ed2-theme" />
          </span>
        </header>
        {team && <TeamDialog onClose={() => setTeam(false)} />}

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
                <ProjectCard key={p.id} project={p} current={p.id === last} me={me} onChanged={load} />
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

/** One project: open it, or rename / delete / share it from the ⋯ menu — the
 *  menu only offers actions its owner or an admin can actually do. */
function ProjectCard({ project, current, me, onChanged }: { project: Property; current: boolean; me: SessionUser | null; onChanged: () => void }) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [branding, setBranding] = useState(false);
  const [leads, setLeads] = useState(false);
  const [draft, setDraft] = useState(project.title);
  const [error, setError] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const count = project.spaceCount ?? 0;
  const mine = canManage(project, me);

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
            <button role="menuitem" onClick={() => { setMenu(false); setLeads(true); }}>Enquiries…</button>
            <button role="menuitem" onClick={() => { setMenu(false); setShowLog(true); }}>Activity</button>
            {mine && <button role="menuitem" onClick={() => { setMenu(false); setError(''); setDraft(project.title); setRenaming(true); }}>Rename</button>}
            {mine && <button role="menuitem" onClick={() => { setMenu(false); setSharing(true); }}>Share…</button>}
            {mine && <button role="menuitem" onClick={() => { setMenu(false); setBranding(true); }}>Branding…</button>}
            {mine && <button role="menuitem" className="is-danger" onClick={remove}>Delete project</button>}
          </div>
        )}
      </div>
      {sharing && <ShareDialog project={project} onClose={() => setSharing(false)} />}
      {showLog && <ActivityDialog project={project} onClose={() => setShowLog(false)} />}
      {leads && <EnquiriesDialog project={project} canEdit={mine} onClose={() => setLeads(false)} />}
      {branding && <BrandingDialog project={project} onClose={() => { setBranding(false); onChanged(); }} />}
    </div>
  );
}

/** Add or remove teammates from a project's members (§21: this and the Team
 *  dialog are the whole of "different admins" — ownership at the project
 *  level, not per-space). Opened from a card's ⋯ menu; owner/admin only,
 *  enforced again server-side regardless of who can open this dialog. */
function ShareDialog({ project, onClose }: { project: Property; onClose: () => void }) {
  const [detail, setDetail] = useState<Property | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => { getProperty(project.id).then(setDetail).catch(() => {}); }, [project.id]);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim();
    if (!clean) return;
    setBusy(true);
    setError('');
    try {
      await addPropertyMember(project.id, clean);
      setEmail('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add them. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (userId: string) => {
    removePropertyMember(project.id, userId).then(load).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not remove them. Try again.');
    });
  };

  return (
    <div className="np-scrim" onClick={onClose}>
      <div className="pl-dialog" role="dialog" aria-modal="true" aria-label={`Share ${project.title}`} onClick={(e) => e.stopPropagation()}>
        <header className="np-head">
          <h2>Share “{project.title}”</h2>
          <button className="np-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="pl-dialog-body">
          <p className="pl-sub">
            {detail?.ownerName ? <>Owned by <b>{detail.ownerName}</b>.</> : 'No owner set — every teammate can already manage it.'}
            {' '}Add someone below to give them access without making them the owner.
          </p>
          {!!detail?.memberDetails?.length && (
            <ul className="pl-share-list">
              {detail.memberDetails.map((u) => (
                <li key={u.id}>
                  <span>{u.name} <span className="pl-sub">{u.email}</span></span>
                  <button type="button" onClick={() => remove(u.id)} aria-label={`Remove ${u.name}`}>✕</button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={add} className="pl-share-form">
            <input
              type="email" required placeholder="teammate@geonova.com.np" value={email}
              onChange={(e) => setEmail(e.target.value)} disabled={busy}
            />
            <button className="pl-btn pl-btn-main" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
          </form>
          {error && <p className="ed2-warn ed2-fine">{error}</p>}
        </div>
      </div>
    </div>
  );
}

const FONT_FACES: Record<BrandFont, [string, string]> = {
  serif: ['Serif', "Georgia, 'Times New Roman', serif"],
  sans: ['Modern sans', "system-ui, 'Segoe UI', Roboto, sans-serif"],
  classic: ['Classic', "'Palatino Linotype', 'Book Antiqua', Palatino, serif"]
};

/** The project's name, colour, font and logo on its tours. Saves as you go:
 *  published tours pick it up at once (it isn't part of a publish). */
function BrandingDialog({ project, onClose }: { project: Property; onClose: () => void }) {
  const [theme, setTheme] = useState<ProjectTheme>(project.theme ?? {});
  const [brand, setBrand] = useState(project.theme?.brand ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const accent = theme.accent ?? '#b08d57';
  const font = theme.font ?? 'serif';
  const logoUrl = theme.logo ? `${API_BASE_URL}/api/assets/${theme.logo}` : null;

  const run = async (fn: () => Promise<Property | null>) => {
    setBusy(true);
    setError('');
    try {
      const p = await fn();
      if (p) setTheme(p.theme ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="np-scrim" onClick={onClose}>
      <div className="pl-dialog pl-dialog-wide" role="dialog" aria-modal="true" aria-label={`Branding for ${project.title}`} onClick={(e) => e.stopPropagation()}>
        <header className="np-head">
          <h2>Branding</h2>
          <button className="np-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="pl-dialog-body">
          <p className="pl-sub">How “{project.title}” looks on its tours. Changes go live on every published tour at once.</p>

          <div className="pl-brand-preview" style={{ '--acc': accent, '--face': FONT_FACES[font][1] } as React.CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl && <img src={logoUrl} alt="" />}
            <span className="pl-brand-name">{brand || project.title}</span>
            <span className="pl-brand-place">Reception</span>
            <span className="pl-brand-pill">Start virtual tour</span>
          </div>

          <label className="pl-field">
            <span>Name shown on the tour</span>
            <span className="pl-share-form">
              <input value={brand} maxLength={80} placeholder={project.title} onChange={(e) => setBrand(e.target.value)} />
              <button className="pl-btn pl-btn-main" disabled={busy || brand === (theme.brand ?? '')} onClick={() => run(() => setProjectTheme(project.id, { brand }))}>Save</button>
            </span>
          </label>

          <div className="pl-brand-row">
            <label className="pl-field">
              <span>Accent colour</span>
              <span className="pl-share-form">
                <input type="color" value={accent} disabled={busy} onChange={(e) => run(() => setProjectTheme(project.id, { accent: e.target.value }))} />
                {theme.accent && <button className="pl-btn" disabled={busy} onClick={() => run(() => setProjectTheme(project.id, { accent: null }))}>Default</button>}
              </span>
            </label>
            <label className="pl-field">
              <span>Heading font</span>
              <select className="pl-select" value={font} disabled={busy} onChange={(e) => run(() => setProjectTheme(project.id, { font: e.target.value as BrandFont }))}>
                {(Object.keys(FONT_FACES) as BrandFont[]).map((f) => <option key={f} value={f}>{FONT_FACES[f][0]}</option>)}
              </select>
            </label>
          </div>

          <div className="pl-field">
            <span>Logo</span>
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(() => uploadProjectLogo(project.id, f)); }} />
            <span className="pl-share-form">
              <button className="pl-btn" disabled={busy} onClick={() => fileRef.current?.click()}>{logoUrl ? 'Replace logo…' : 'Upload logo…'}</button>
              {logoUrl && <button className="pl-btn pl-btn-danger" disabled={busy} onClick={() => run(() => removeProjectLogo(project.id))}>Remove</button>}
            </span>
            <span className="pl-sub">A PNG with a transparent background works best on the dark tour. 2 MB at most.</span>
          </div>
          {error && <p className="ed2-warn ed2-fine">{error}</p>}
        </div>
      </div>
    </div>
  );
}

/** A project's enquiries: the list, a CSV for Excel, and (owner/admin) who
 *  new ones are emailed to (server/src/mailer.js). */
function EnquiriesDialog({ project, canEdit, onClose }: { project: Property; canEdit: boolean; onClose: () => void }) {
  const [data, setData] = useState<ProjectLeads | null>(null);
  const [emails, setEmails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    getProjectLeads(project.id)
      .then((d) => { setData(d); setEmails(d?.emails.join(', ') ?? ''); })
      .catch((e: Error) => setError(e.message));
  }, [project.id]);
  const saveEmails = async () => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const r = await setProjectLeadEmails(project.id, emails.split(/[\s,;]+/).filter(Boolean));
      setEmails(r?.emails.join(', ') ?? '');
      setData((d) => (d && r ? { ...d, emails: r.emails } : d));
      setNote('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="np-scrim" onClick={onClose}>
      <div className="pl-dialog pl-dialog-wide" role="dialog" aria-modal="true" aria-label={`Enquiries for ${project.title}`} onClick={(e) => e.stopPropagation()}>
        <header className="np-head">
          <h2>Enquiries</h2>
          <button className="np-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="pl-dialog-body">
          {error && <p className="ed2-warn ed2-fine">{error}</p>}
          {!data && !error && <p className="pl-sub">Loading…</p>}
          {data && (
            <>
              <div className="pl-leads-head">
                <p className="pl-sub">
                  {data.leads.length ? `${data.leads.length} from “${project.title}”, newest first.` : `No enquiries from “${project.title}” yet.`}
                </p>
                {!!data.leads.length && (
                  // a plain download: the browser sends the studio's cookie with it
                  <a className="pl-btn pl-btn-main" href={projectLeadsCsvUrl(project.id)} download>Download for Excel</a>
                )}
              </div>
              {!!data.leads.length && (
                <ol className="pl-leads">
                  {data.leads.map((l) => (
                    <li key={l.id}>
                      <div className="pl-lead-top">
                        <b>{l.name}</b>
                        <a href={`tel:${l.phone}`}>{l.phone}</a>
                        {l.email && <a href={`mailto:${l.email}`}>{l.email}</a>}
                        <time className="pl-log-when" dateTime={l.createdAt}>{when(l.createdAt)}</time>
                      </div>
                      <div className="pl-sub">
                        {[l.sceneName, l.requirement, l.dates, l.hotspotLabel && `was looking at ${l.hotspotLabel}`].filter(Boolean).join(' · ')}
                      </div>
                      {l.message && <p className="pl-lead-msg">{l.message}</p>}
                      {l.delivery && !l.delivery.sent && <p className="ed2-warn ed2-fine">Not emailed: {l.delivery.reason}</p>}
                    </li>
                  ))}
                </ol>
              )}

              <div className="pl-field">
                <span>Email new enquiries to</span>
                {!data.emailOn && (
                  <span className="pl-sub">Email is off on this server: add RESEND_API_KEY to server/.env (free at resend.com). Enquiries are still saved here either way.</span>
                )}
                <span className="pl-share-form">
                  <input value={emails} disabled={!canEdit || busy} placeholder="sales@hotel.com, frontdesk@hotel.com" onChange={(e) => setEmails(e.target.value)} />
                  {canEdit && <button className="pl-btn pl-btn-main" disabled={busy || emails === data.emails.join(', ')} onClick={saveEmails}>Save</button>}
                </span>
                {!canEdit && <span className="pl-sub">Only the project’s owner or an admin can change this.</span>}
                {note && <span className="pl-sub">{note}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Who did what in this project, newest first (server/src/activity.js). */
function ActivityDialog({ project, onClose }: { project: Property; onClose: () => void }) {
  const [log, setLog] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getActivity(project.id).then((l) => setLog(l ?? [])).catch((e: Error) => setError(e.message));
  }, [project.id]);
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="np-scrim" onClick={onClose}>
      <div className="pl-dialog pl-dialog-wide" role="dialog" aria-modal="true" aria-label={`Activity in ${project.title}`} onClick={(e) => e.stopPropagation()}>
        <header className="np-head">
          <h2>Activity</h2>
          <button className="np-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="pl-dialog-body">
          <p className="pl-sub">Everything done in “{project.title}” since this log began, newest first.</p>
          {error && <p className="ed2-warn ed2-fine">{error}</p>}
          {!log && !error && <p className="pl-sub">Loading…</p>}
          {log && !log.length && <p className="pl-sub">Nothing recorded yet. Saves, publishes, shares and floor plans show up here.</p>}
          {!!log?.length && (
            <ol className="pl-log">
              {log.map((e, i) => (
                <li key={i}>
                  <span className="pl-log-what"><b>{e.who.name}</b> {e.action} <b>{e.target}</b>{e.detail && <span className="pl-sub"> · {e.detail}</span>}</span>
                  <time className="pl-log-when" dateTime={e.at}>{when(e.at)}</time>
                </li>
              ))}
            </ol>
          )}
        </div>
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
