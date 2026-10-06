'use client';

import { use, useCallback, useEffect, useState } from 'react';
import {
  apiUrl, getActivity, getGallery, getProjectLeads, getProjectReport, getProperty, getPublishState, getReservations, getScenes,
  getSiteDraft, setProjectFeatures, LAST_PROJECT_KEY, type ActivityEntry, type ProjectReport, type PublishState, type Reservation
} from '../../../lib/api';
import { hydrateScenes } from '../../../features/scene/scenes';
import { useStudioSession } from '../../../features/auth/useStudioSession';
import { Uploader } from '../../../features/studio/Uploader';
import { ActivityDialog, EnquiriesDialog } from '../../../features/studio/ProjectDialogs';
import { ThemeToggle } from '../../../components/ui/ThemeToggle';
import type { ApiScene, Property } from '../../../@types/scene.types';
import type { ProjectFeatures } from '../../../@types/config.types';
import '../../../features/studio/editor.css';
import '../../../features/studio/home.css';

/** One space on the home: its saved state and picture. */
interface Space { scene: ApiScene; state: PublishState | null; pic: string | null }
interface Home {
  project: Property;
  spaces: Space[];
  site: { publishedAt: string | null; scheduledAt: string | null } | null;
  waiting: number; // booking requests that need a reply
  enquiries: { month: number; latest: { name: string; at: string } | null } | null;
  report: ProjectReport | null;
  activity: ActivityEntry[] | null;
}

/** What each feature is, in the owner's terms (server/src/store.js FEATURES). */
const FEATURE_TEXT: [keyof ProjectFeatures, string, string][] = [
  ['enquiries', 'Enquiries', 'The enquiry form in its tours and on its website. Enquiries are listed here and emailed to the team.'],
  ['reservations', 'Bookings', 'Book now on table, room and hall hotspots, and table, room and event booking on its website. Requests arrive in Reservations.'],
  ['website', 'Website', 'Its own page, built in the website editor, with the live tour at the top.'],
  ['report', 'Monthly report', 'Visits, time spent and enquiries, to print or send to the client.'],
  ['activity', 'Activity', 'Who changed what in the project, and when.']
];

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : day(iso);
};
/** ["a", "b", "c"] → "a, b and c". */
const inWords = (list: string[]) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
/** A booking request still to answer: asked, and not yet past (a stay until its guests leave). */
const needsReply = (r: Reservation, today: string) =>
  r.kind !== 'wait' && r.status === 'requested' && (r.checkout ?? r.date) >= today;

/**
 * A project's home (/studio/<project>): its spaces with their state and what
 * each still lacks, the website, what waits for a reply, this month's
 * numbers and the latest activity, and the features it uses. Opening a
 * project lands here; the editor is /studio/<project>/edit. Each part loads
 * on its own, so one that fails leaves the rest.
 */
export default function ProjectHomePage({ params }: { params: Promise<{ property: string }> }) {
  const { property: id } = use(params);
  const ok = useStudioSession(`/studio/${id}`);
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dialog, setDialog] = useState<'' | 'enquiries' | 'activity'>('');
  const [saving, setSaving] = useState('');

  const load = useCallback(async () => {
    try {
      const p = await getProperty(id);
      if (!p) return setMissing(true);
      // The client's staff have no spaces to edit: their page is the reservations.
      if (p.access === 'staff') { location.replace(`/studio/${encodeURIComponent(p.id)}/reservations`); return; }
      try { localStorage.setItem(LAST_PROJECT_KEY, p.id); } catch { /* private mode */ }
      const f = p.features ?? { enquiries: true, reservations: true, website: true, report: true, activity: true };
      const soft = <T,>(x: Promise<T>) => x.catch(() => null);
      const [scenes, gallery, site, res, leads, report, activity] = await Promise.all([
        getScenes(), soft(getGallery()),
        f.website ? soft(getSiteDraft(p.id)) : null,
        f.reservations ? soft(getReservations(p.id)) : null,
        f.enquiries ? soft(getProjectLeads(p.id)) : null,
        f.report ? soft(getProjectReport(p.id, thisMonth())) : null,
        f.activity ? soft(getActivity(p.id)) : null
      ]);
      hydrateScenes(scenes); // the uploader adds to this list
      const all = (scenes ?? []).filter((s) => s.propertyId === p.id);
      // a night version is reached from its day space, as in the editor's list
      const own = all.filter((s) => !all.some((d) => d.night === s.id));
      const states = await Promise.all(own.map((s) => soft(getPublishState(s.id))));
      const month = thisMonth();
      setHome({
        project: p,
        spaces: own.map((scene, i) => ({
          scene, state: states[i], pic: apiUrl(gallery?.find((g) => g.id === scene.id)?.thumb) ?? null
        })),
        site: site ? { publishedAt: site.publishedAt, scheduledAt: site.scheduledAt } : null,
        waiting: res ? res.reservations.filter((r) => needsReply(r, res.today)).length : 0,
        enquiries: leads ? {
          month: leads.leads.filter((l) => l.createdAt.startsWith(month)).length,
          latest: leads.leads[0] ? { name: leads.leads[0].name, at: leads.leads[0].createdAt } : null
        } : null,
        report, activity: activity ? activity.slice(0, 5) : null
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The studio server isn’t answering.');
    }
  }, [id]);
  useEffect(() => { if (ok) load(); }, [ok, load]);
  // A link to one part of the home (the website editor's "What this project uses"): it wasn't there when the page opened.
  const loaded = !!home;
  useEffect(() => { if (loaded && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView(); }, [loaded]);

  if (!ok) return <div className="ed2-boot">Opening the studio…</div>;
  if (missing || (error && !home)) {
    return (
      <div className="ed2"><main className="pl"><section className="pl-body">
        <div className="pl-empty">
          <h1>{missing ? 'That project doesn’t exist' : 'The studio server isn’t answering'}</h1>
          <p>{missing ? 'It may have been deleted, or the link is wrong. Pick one from the list.' : error}</p>
          {!missing && <button className="pl-btn pl-btn-main" onClick={() => { setError(''); load(); }}>Try again</button>}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the studio’s 3D renderer is a page singleton: leave with a full page load */}
          <a className="pl-btn" href="/studio">All projects</a>
        </div>
      </section></main></div>
    );
  }
  if (!home) return <div className="ed2-boot">Loading the project…</div>;

  const { project: p, spaces } = home;
  const f = p.features ?? { enquiries: true, reservations: true, website: true, report: true, activity: true };
  const owner = p.access === 'owner';
  const base = `/studio/${encodeURIComponent(p.id)}`;
  const live = spaces.filter((s) => s.state?.status === 'published').length;
  const unready = spaces.filter((s) => s.state?.ready?.some((c) => !c.done));

  const toggle = async (k: keyof ProjectFeatures) => {
    setSaving(k);
    try {
      const next = await setProjectFeatures(p.id, { [k]: !f[k] });
      if (next) await load(); // the whole home: what shows depends on these
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.');
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="ed2">
      <main className="pl ph">
        <header className="pl-top">
          <nav className="ed2-crumb" aria-label="Breadcrumb">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the studio’s 3D renderer is a page singleton: leave with a full page load */}
            <a href="/studio">Projects</a>
            <span aria-hidden>/</span>
            <span className="ed2-crumb-here">{p.title}</span>
          </nav>
          <span className="pl-top-actions"><ThemeToggle className="ed2-theme" /></span>
        </header>

        <section className="pl-body">
          <div className="pl-head">
            <div>
              <h1>{p.theme?.brand || p.title}</h1>
              <p className="pl-sub">
                {spaces.length === 1 ? '1 space' : `${spaces.length} spaces`}, {live} live
                {!owner && ' · shared with you'}
              </p>
            </div>
            {spaces.length > 0 && <a className="pl-btn pl-btn-main" href={`${base}/edit`}>Open the editor</a>}
          </div>
          {error && <p className="ed2-warn ed2-fine" role="alert">{error}</p>}

          {/* What needs someone: only what's there, each one click from being dealt with. */}
          {(home.waiting > 0 || unready.length > 0) && (
            <ul className="ph-needs" aria-label="Needs you">
              {home.waiting > 0 && (
                <li><a href={`${base}/reservations`}><b>{home.waiting}</b> booking {home.waiting === 1 ? 'request needs' : 'requests need'} a reply</a></li>
              )}
              {unready.map((s) => (
                <li key={s.scene.id}>
                  <a href={`${base}/edit?space=${encodeURIComponent(s.scene.id)}`}>
                    <b>{s.scene.title || s.scene.id}</b> still needs {inWords(s.state!.ready.filter((c) => !c.done).map((c) => c.label.toLowerCase()))}
                  </a>
                </li>
              ))}
            </ul>
          )}

          <h2 className="ph-h">Spaces</h2>
          <div className="ph-spaces">
            {spaces.map((s) => <SpaceCard key={s.scene.id} space={s} base={base} visits={home.report?.spaces.find((x) => x.id === s.scene.id)?.visits} />)}
            <button className="ph-space ph-space-add" onClick={() => setUploading(true)}>
              <span className="ph-add-mark" aria-hidden>＋</span>
              <span>{spaces.length ? 'Upload another space' : 'Upload the first space'}</span>
              <span className="pl-sub">A Lixel Studio export, a 3D model or a 360° video</span>
            </button>
          </div>

          <div className="ph-cols">
            <div className="ph-col">
              {f.website && (
                <section className="ph-block" aria-labelledby="ph-site">
                  <h2 className="ph-h" id="ph-site">Website</h2>
                  <p>
                    {home.site?.scheduledAt ? <>Goes live {day(home.site.scheduledAt)}.</>
                      : home.site?.publishedAt ? <>Live since {day(home.site.publishedAt)}.</>
                        : 'Not published yet.'}
                  </p>
                  <span className="ph-links">
                    <a className="pl-btn" href={`${base}/site`}>Edit the website</a>
                    {home.site?.publishedAt && <a className="pl-btn" href={`/s/${encodeURIComponent(p.id)}`} target="_blank" rel="noopener">Open it ↗</a>}
                  </span>
                </section>
              )}

              {(f.report || f.enquiries || f.reservations) && (
                <section className="ph-block" aria-labelledby="ph-month">
                  <h2 className="ph-h" id="ph-month">This month</h2>
                  <dl className="ph-figs">
                    {home.report && <div><dt>Visits</dt><dd>{home.report.visits}</dd></div>}
                    {home.report && home.report.visits > 0 && <div><dt>Average visit</dt><dd>{minutes(home.report.seconds / home.report.visits)}</dd></div>}
                    {home.enquiries && <div><dt>Enquiries</dt><dd>{home.enquiries.month}</dd></div>}
                    {home.report && f.reservations && (
                      <div><dt>Booking requests</dt><dd>{Object.values(home.report.funnel.requests).reduce((a: number, b) => a + (b ?? 0), 0)}</dd></div>
                    )}
                  </dl>
                  {home.enquiries?.latest && <p className="pl-sub">Latest enquiry: {home.enquiries.latest.name}, {ago(home.enquiries.latest.at)}.</p>}
                  <span className="ph-links">
                    {f.enquiries && <button className="pl-btn" onClick={() => setDialog('enquiries')}>Enquiries</button>}
                    {f.reservations && <a className="pl-btn" href={`${base}/reservations`}>Reservations</a>}
                    {f.report && <a className="pl-btn" href={`${base}/report`} target="_blank" rel="noopener">Full report ↗</a>}
                  </span>
                </section>
              )}
            </div>

            <div className="ph-col">
              {f.activity && (
                <section className="ph-block" aria-labelledby="ph-log">
                  <h2 className="ph-h" id="ph-log">Recent activity</h2>
                  {home.activity?.length ? (
                    <ol className="ph-log">
                      {home.activity.map((a, i) => (
                        <li key={i}><b>{a.who.name}</b> {a.action}{a.target && a.target !== p.title ? <> “{a.target}”</> : null}<time dateTime={a.at}>{ago(a.at)}</time></li>
                      ))}
                    </ol>
                  ) : <p className="pl-sub">Nothing yet.</p>}
                  <span className="ph-links"><button className="pl-btn" onClick={() => setDialog('activity')}>All activity</button></span>
                </section>
              )}

              <section className="ph-block" aria-labelledby="ph-features">
                <h2 className="ph-h" id="ph-features">What this project uses</h2>
                <p className="pl-sub">Switch off what this client doesn’t need: it leaves the studio, and its tours and website stop offering it.{!owner && ' Only the owner can change these.'}</p>
                <ul className="ph-features">
                  {FEATURE_TEXT.map(([k, name, what]) => (
                    <li key={k}>
                      <span><b>{name}</b><span className="pl-sub">{what}</span></span>
                      <button role="switch" aria-checked={f[k]} aria-label={name} className="ph-switch"
                        disabled={!owner || !!saving} onClick={() => toggle(k)}>
                        <span aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </section>
      </main>

      {uploading && (
        <Uploader propertyId={p.id} onClose={() => setUploading(false)}
          onCreated={(sceneId) => location.assign(`${base}/edit?space=${encodeURIComponent(sceneId)}`)} />
      )}
      {dialog === 'enquiries' && <EnquiriesDialog project={p} canEdit={owner} onClose={() => setDialog('')} />}
      {dialog === 'activity' && <ActivityDialog project={p} onClose={() => setDialog('')} />}
    </div>
  );
}

/** A space: its picture (once published), whether it's live, how ready it is, its visits this month. */
function SpaceCard({ space: { scene, state, pic }, base, visits }: { space: Space; base: string; visits?: number }) {
  const ready = state?.ready ?? [];
  const done = ready.filter((c) => c.done).length;
  const edit = `${base}/edit?space=${encodeURIComponent(scene.id)}`;
  return (
    <article className="ph-space">
      <a className="ph-pic" href={edit} aria-label={`Edit ${scene.title || scene.id}`}>
        {/* a published space's picture, from the API (next/image isn't set up for it) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {pic ? <img src={pic} alt="" loading="lazy" /> : <span className="ph-pic-none" aria-hidden />}
        <span className={`ph-state ${state?.status === 'published' ? 'is-live' : ''}`}>
          {state?.status === 'published' ? `Live · v${state.publishedVersion}` : 'Draft'}
        </span>
      </a>
      <div className="ph-space-txt">
        <a className="ph-space-name" href={edit}>{scene.title || scene.id}</a>
        {ready.length > 0 && (
          <span className="ph-ready" title={ready.map((c) => `${c.done ? '✓' : '○'} ${c.label}`).join('\n')}>
            <span className="ph-ticks" aria-hidden>{ready.map((c) => <i key={c.key} className={c.done ? 'is-on' : undefined} />)}</span>
            {done === ready.length ? 'Ready' : `${done} of ${ready.length} ready`}
          </span>
        )}
        {visits !== undefined && <span className="pl-sub">{visits} {visits === 1 ? 'visit' : 'visits'} this month</span>}
        <span className="ph-links">
          <a href={edit}>Edit</a>
          {state?.status === 'published' && <a href={`/tour?space=${encodeURIComponent(scene.id)}`} target="_blank" rel="noopener">Open the tour ↗</a>}
        </span>
      </div>
    </article>
  );
}
