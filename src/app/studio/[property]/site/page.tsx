'use client';

import { use, useEffect, useRef, useState } from 'react';
import {
  API_BASE_URL, getProperty, getSiteDraft, publishSite, saveSiteDraft, uploadSiteImage,
  type SiteBooking, type SiteDoc, type SiteSpace, type SiteTable
} from '../../../../lib/api';
import { useStudioSession } from '../../../../lib/useStudioSession';
import '../../../../components/editor.css';
import './site-editor.css';

const asset = (p: string) => `${API_BASE_URL}/api/assets/${p}`;
const move = <T,>(list: T[], i: number, by: number) => {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

/**
 * The website editor (/studio/<project>/site): the words and photos of the
 * project's public site, /s/<project>. It only reads the studio's work — the
 * spaces and their published viewpoints — and never changes it. Save keeps a
 * draft; Publish puts it live.
 */
export default function SiteEditorPage({ params }: { params: Promise<{ property: string }> }) {
  const { property: id } = use(params);
  const ok = useStudioSession(`/studio/${id}/site`);
  const [title, setTitle] = useState('');
  const [doc, setDoc] = useState<SiteDoc | null>(null);
  const [spaces, setSpaces] = useState<SiteSpace[]>([]);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'' | 'saving' | 'publishing'>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ok) return;
    Promise.all([getProperty(id), getSiteDraft(id)])
      .then(([p, d]) => {
        if (!p || !d) throw new Error('That project doesn’t exist, or you can’t see it.');
        setTitle(p.theme?.brand || p.title);
        setDoc(d.draft);
        setSpaces(d.spaces);
        setPublishedAt(d.publishedAt);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load the website.'));
  }, [ok, id]);

  // Leaving with unsaved words asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!ok) return <div className="ed2-boot">Opening the studio…</div>;
  if (error && !doc) return <div className="ed2-boot">{error}</div>;
  if (!doc) return <div className="ed2-boot">Loading the website…</div>;

  const change = (patch: Partial<SiteDoc>) => { setDoc({ ...doc, ...patch }); setDirty(true); setNote(''); };
  const save = async () => {
    setBusy('saving'); setError('');
    try {
      const r = await saveSiteDraft(id, doc);
      if (r) setDoc(r.draft);
      setDirty(false);
      setNote('Saved. Publish to put it live.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  // Preview shows the saved draft: save first, into a tab opened on the click (so it isn't blocked as a pop-up).
  const preview = async () => {
    const tab = window.open('about:blank', '_blank');
    if (dirty) await save();
    const url = `/studio/${encodeURIComponent(id)}/site/preview`;
    if (tab) tab.location.href = url; else location.href = url;
  };
  const publish = async () => {
    setBusy('publishing'); setError('');
    try {
      const r = await saveSiteDraft(id, doc);
      if (r) setDoc(r.draft);
      setDirty(false);
      const p = await publishSite(id);
      if (p) setPublishedAt(p.publishedAt);
      setNote('Published.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const published = spaces.filter((s) => s.published);

  return (
    <div className="ed2 se">
      <header className="se-bar">
        {/* plain <a>: the studio holds a page-singleton renderer and wants a full load */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/studio" className="se-back">← Projects</a>
        <div className="se-title">
          <b>Website</b><span>{title}</span>
        </div>
        <span className="se-state" role="status">
          {error ? <span className="se-err">{error}</span>
            : dirty ? 'Unsaved changes'
              : note || (publishedAt ? `Live since ${new Date(publishedAt).toLocaleString()}` : 'Not published yet')}
        </span>
        <button onClick={save} disabled={!!busy || !dirty}>{busy === 'saving' ? 'Saving…' : 'Save'}</button>
        <button className="se-main" onClick={publish} disabled={!!busy}>{busy === 'publishing' ? 'Publishing…' : 'Publish'}</button>
        <button onClick={preview} disabled={!!busy}>Preview ↗</button>
        {publishedAt && <a className="se-open" href={`/s/${encodeURIComponent(id)}`} target="_blank" rel="noopener">Open site ↗</a>}
        <a className="se-open" href={`/studio/${encodeURIComponent(id)}/reservations`}>Reservations</a>
      </header>

      <main className="se-body">
        {!published.length && (
          <p className="se-warn">None of this project’s spaces is published yet. The website shows the live tour of a published space, so publish one in the studio first.</p>
        )}

        <Card title="Opening" hint="The first thing visitors read, above the live tour.">
          <Text label="Small line above the title" value={doc.hero.eyebrow} max={80} placeholder="e.g. Boutique hotel · Patan Durbar Square"
            onChange={(v) => change({ hero: { ...doc.hero, eyebrow: v } })} />
          <Text label="Title" value={doc.hero.title} max={120} placeholder={title}
            onChange={(v) => change({ hero: { ...doc.hero, title: v } })} />
          <Text label="Introduction" value={doc.hero.lede} max={400} long
            onChange={(v) => change({ hero: { ...doc.hero, lede: v } })} />
          <label className="se-field">
            <span>The live tour shows</span>
            <select value={doc.hero.space} onChange={(e) => change({ hero: { ...doc.hero, space: e.target.value } })}>
              <option value="">The newest published space</option>
              {published.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
        </Card>

        <Card title="Key facts" hint="Up to six short figures, e.g. “24 rooms”, “1,200 m² garden”.">
          {doc.facts.map((f, i) => (
            <div key={i} className="se-row">
              <input aria-label="Figure" placeholder="24" value={f.n} maxLength={20}
                onChange={(e) => change({ facts: doc.facts.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)) })} />
              <input aria-label="What it counts" placeholder="Rooms" value={f.k} maxLength={60}
                onChange={(e) => change({ facts: doc.facts.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)) })} />
              <Tools onUp={() => change({ facts: move(doc.facts, i, -1) })} onDown={() => change({ facts: move(doc.facts, i, 1) })}
                onRemove={() => change({ facts: doc.facts.filter((_, j) => j !== i) })} />
            </div>
          ))}
          {doc.facts.length < 6 && <button className="se-add" onClick={() => change({ facts: [...doc.facts, { n: '', k: '' }] })}>＋ Add a fact</button>}
        </Card>

        <Card title="Story" hint="A few paragraphs about the place. Leave a blank line between paragraphs.">
          <Text label="Heading" value={doc.story.title} max={120} onChange={(v) => change({ story: { ...doc.story, title: v } })} />
          <Text label="Text" value={doc.story.body} max={2000} long rows={7} onChange={(v) => change({ story: { ...doc.story, body: v } })} />
        </Card>

        <Card title="Spaces" hint="Each one is a chapter on the page. “View in 3D” flies the live tour to the viewpoint you pick.">
          {doc.rooms.map((r, i) => {
            const set = (patch: Partial<typeof r>) => change({ rooms: doc.rooms.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            const views = published.find((s) => s.id === r.space)?.views ?? [];
            return (
              <div key={i} className="se-item">
                <div className="se-item-head">
                  <b>{i + 1}. {r.title || 'Untitled'}</b>
                  <Tools onUp={() => change({ rooms: move(doc.rooms, i, -1) })} onDown={() => change({ rooms: move(doc.rooms, i, 1) })}
                    onRemove={() => change({ rooms: doc.rooms.filter((_, j) => j !== i) })} />
                </div>
                <div className="se-split">
                  <Photo project={id} value={r.image} onChange={(image) => set({ image })} onError={setError} />
                  <div>
                    <Text label="Name" value={r.title} max={80} placeholder="e.g. The Courtyard Suite" onChange={(title) => set({ title })} />
                    <Text label="Description" value={r.body} max={600} long onChange={(body) => set({ body })} />
                    <Text label="Features, separated by commas" value={r.features} max={200} placeholder="King bed, Garden view, 42 m²"
                      onChange={(features) => set({ features })} />
                    <div className="se-row">
                      <label className="se-field">
                        <span>Space in 3D</span>
                        <select value={r.space} onChange={(e) => set({ space: e.target.value, view: '' })}>
                          <option value="">No “View in 3D”</option>
                          {published.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                        </select>
                      </label>
                      <label className="se-field">
                        <span>Viewpoint</span>
                        <select value={r.view} disabled={!r.space} onChange={(e) => set({ view: e.target.value })}>
                          <option value="">Where the space starts</option>
                          {views.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {doc.rooms.length < 12 && (
            <button className="se-add" onClick={() => change({ rooms: [...doc.rooms, { title: '', body: '', features: '', image: '', space: '', view: '' }] })}>
              ＋ Add a space
            </button>
          )}
        </Card>

        <Card title="Floor plan" hint="The plan of the tour’s space: the one you uploaded in the studio, else the one drawn from the scan.">
          <label className="se-check">
            <input type="checkbox" checked={doc.plan} onChange={(e) => change({ plan: e.target.checked })} /> Show the floor plan
          </label>
        </Card>

        <Card title="Photos" hint="A gallery near the end of the page. PNG, JPEG or WebP, up to 8 MB each.">
          <div className="se-gallery">
            {doc.gallery.map((g, i) => (
              <figure key={g}>
                {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded photo */}
                <img src={asset(g)} alt="" />
                <button aria-label="Remove photo" onClick={() => change({ gallery: doc.gallery.filter((_, j) => j !== i) })}>✕</button>
              </figure>
            ))}
            {doc.gallery.length < 24 && (
              <Photo project={id} value="" label="＋ Add photos" multiple
                onChange={(p) => { setDirty(true); setDoc((d) => d && { ...d, gallery: [...d.gallery, p].slice(0, 24) }); }}
                onError={setError} />
            )}
          </div>
        </Card>

        <Card title="Menu or prices" hint="For a restaurant, its dishes; for a hotel, its rooms and rates. Leave empty to hide.">
          <div className="se-row">
            <Text label="Heading" value={doc.menu.title} max={80} placeholder="Menu" onChange={(v) => change({ menu: { ...doc.menu, title: v } })} />
            <Text label="Note" value={doc.menu.note} max={300} placeholder="Prices include VAT." onChange={(v) => change({ menu: { ...doc.menu, note: v } })} />
          </div>
          {doc.menu.items.map((m, i) => {
            const set = (patch: Partial<typeof m>) => change({ menu: { ...doc.menu, items: doc.menu.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) } });
            return (
              <div key={i} className="se-row se-menu">
                <input aria-label="Dish or item" placeholder="Newari khaja set" value={m.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
                <input aria-label="Description" placeholder="Beaten rice, choila, bara…" value={m.desc} maxLength={200} onChange={(e) => set({ desc: e.target.value })} />
                <input aria-label="Price" placeholder="Rs 650" value={m.price} maxLength={30} onChange={(e) => set({ price: e.target.value })} />
                <input aria-label="Label" placeholder="Vegetarian" value={m.tag} maxLength={30} onChange={(e) => set({ tag: e.target.value })} />
                <Tools onUp={() => change({ menu: { ...doc.menu, items: move(doc.menu.items, i, -1) } })}
                  onDown={() => change({ menu: { ...doc.menu, items: move(doc.menu.items, i, 1) } })}
                  onRemove={() => change({ menu: { ...doc.menu, items: doc.menu.items.filter((_, j) => j !== i) } })} />
              </div>
            );
          })}
          {doc.menu.items.length < 40 && (
            <button className="se-add" onClick={() => change({ menu: { ...doc.menu, items: [...doc.menu.items, { name: '', desc: '', price: '', tag: '' }] } })}>
              ＋ Add an item
            </button>
          )}
        </Card>

        <Card title="Table booking" hint="Guests choose a day, a time and a table on your floor plan, and send a request; you confirm it in Reservations. Publish to put changes live.">
          <label className="se-check">
            <input type="checkbox" checked={doc.booking.on} onChange={(e) => change({ booking: { ...doc.booking, on: e.target.checked } })} />
            Take table bookings on the website
          </label>
          <PlanEditor project={id} booking={doc.booking} onError={setError}
            views={published.find((s) => s.id === (doc.hero.space || published[0]?.id))?.views ?? []}
            onChange={(booking) => change({ booking })} />
          <Hours booking={doc.booking} onChange={(booking) => change({ booking })} />
          <Text label="A note under the booking form" value={doc.booking.note} max={300} placeholder="Tables are held for 15 minutes. For groups over 8, call us."
            onChange={(note) => change({ booking: { ...doc.booking, note } })} />
          {doc.booking.on && (!doc.booking.plan || !doc.booking.tables.length) && (
            <p className="se-warn">Booking stays hidden on the website until there is a floor plan with at least one table.</p>
          )}
        </Card>

        <Card title="Enquiries" hint="The closing section. Its button opens the enquiry form; enquiries arrive with this project’s others.">
          <Text label="Heading" value={doc.contact.title} max={120} placeholder={`Visit ${title}`} onChange={(v) => change({ contact: { ...doc.contact, title: v } })} />
          <Text label="Text" value={doc.contact.body} max={400} long onChange={(v) => change({ contact: { ...doc.contact, body: v } })} />
        </Card>
      </main>
    </div>
  );
}

/**
 * The floor plan the restaurant gave, with its tables. Click the plan to add
 * a table there; drag one to move it; select one to set its seats, shape,
 * area and the 3D view from it. Positions are fractions of the plan, so they
 * hold at any size.
 */
function PlanEditor({ project, booking, views, onChange, onError }: {
  project: string; booking: SiteBooking; views: { id: string; label: string }[];
  onChange: (b: SiteBooking) => void; onError: (m: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState('');
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const at = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const f = (v: number) => Math.min(1, Math.max(0, Math.round(v * 10000) / 10000));
    return { x: f((e.clientX - r.left) / r.width), y: f((e.clientY - r.top) / r.height) };
  };
  const setTables = (tables: SiteTable[]) => onChange({ ...booking, tables });
  const edit = (tid: string, patch: Partial<SiteTable>) => setTables(booking.tables.map((t) => (t.id === tid ? { ...t, ...patch } : t)));
  const current = booking.tables.find((t) => t.id === sel);

  if (!booking.plan) {
    return (
      <div className="se-field">
        <span>The restaurant’s floor plan (PNG, JPEG or WebP)</span>
        <Photo project={project} value="" label="Upload the floor plan…" onChange={(plan) => onChange({ ...booking, plan })} onError={onError} />
      </div>
    );
  }
  return (
    <div className="se-field">
      <span>Click the plan to add a table; drag a table to move it. {booking.tables.length} table{booking.tables.length === 1 ? '' : 's'}.</span>
      <div className="se-plan" ref={box}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target as HTMLElement).matches('img')) return;
          if (booking.tables.length >= 60) return onError('A plan holds 60 tables at most.');
          const n = booking.tables.length + 1;
          const t: SiteTable = { id: `t${Date.now().toString(36)}`, label: `T${n}`, seats: 4, shape: 'round', area: '', view: '', ...at(e) };
          setTables([...booking.tables, t]);
          setSel(t.id);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          drag.current.moved = true;
          edit(drag.current.id, at(e));
        }}
        onPointerUp={() => { drag.current = null; }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the uploaded plan */}
        <img src={asset(booking.plan)} alt="" draggable={false} />
        {booking.tables.map((t) => (
          <button key={t.id} type="button" className={`se-table shape-${t.shape}${t.id === sel ? ' is-on' : ''}`}
            style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }} title={`${t.label}, seats ${t.seats}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              try { e.currentTarget.parentElement?.setPointerCapture(e.pointerId); } catch { /* no pointer to follow: still selects */ }
              drag.current = { id: t.id, moved: false };
              setSel(t.id);
            }}>
            {t.label || '·'}<small>{t.seats}</small>
          </button>
        ))}
      </div>
      {current ? (
        <div className="se-row se-table-fields">
          <label className="se-field"><span>Name</span>
            <input value={current.label} maxLength={24} onChange={(e) => edit(current.id, { label: e.target.value })} /></label>
          <label className="se-field"><span>Seats</span>
            <input type="number" min={1} max={30} value={current.seats} onChange={(e) => edit(current.id, { seats: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} /></label>
          <label className="se-field"><span>Shape</span>
            <select value={current.shape} onChange={(e) => edit(current.id, { shape: e.target.value as SiteTable['shape'] })}>
              <option value="round">Round</option><option value="square">Square</option><option value="long">Long</option>
            </select></label>
          <label className="se-field"><span>Area</span>
            <input value={current.area} maxLength={40} placeholder="Window, Terrace…" onChange={(e) => edit(current.id, { area: e.target.value })} /></label>
          <label className="se-field"><span>View from it in 3D</span>
            <select value={current.view} onChange={(e) => edit(current.id, { view: e.target.value })}>
              <option value="">None</option>
              {views.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select></label>
          <button className="se-remove" onClick={() => { setTables(booking.tables.filter((t) => t.id !== current.id)); setSel(''); }}>Delete table</button>
        </div>
      ) : <p className="se-hint">Select a table to set its seats, shape and area.</p>}
      <div className="se-row">
        <Photo project={project} value="" label="Replace the floor plan…" onChange={(plan) => onChange({ ...booking, plan })} onError={onError} />
      </div>
    </div>
  );
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** When tables can be booked: seatings, slots, how long a table is held, how far ahead. */
function Hours({ booking, onChange }: { booking: SiteBooking; onChange: (b: SiteBooking) => void }) {
  const set = (patch: Partial<SiteBooking>) => onChange({ ...booking, ...patch });
  return (
    <>
      <div className="se-row">
        <label className="se-field"><span>First seating</span><input type="time" value={booking.first} onChange={(e) => set({ first: e.target.value })} /></label>
        <label className="se-field"><span>Last seating</span><input type="time" value={booking.last} onChange={(e) => set({ last: e.target.value })} /></label>
        <label className="se-field"><span>Times every</span>
          <select value={booking.slot} onChange={(e) => set({ slot: Number(e.target.value) })}>
            {[15, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select></label>
        <label className="se-field"><span>A table is held for</span>
          <select value={booking.stay} onChange={(e) => set({ stay: Number(e.target.value) })}>
            {[60, 90, 120, 150, 180].map((m) => <option key={m} value={m}>{m / 60} h</option>)}
          </select></label>
      </div>
      <div className="se-row">
        <label className="se-field"><span>Book up to (days ahead)</span>
          <input type="number" min={1} max={90} value={booking.days} onChange={(e) => set({ days: Number(e.target.value) || 1 })} /></label>
        <label className="se-field"><span>Largest party online</span>
          <input type="number" min={1} max={30} value={booking.maxParty} onChange={(e) => set({ maxParty: Number(e.target.value) || 1 })} /></label>
        <label className="se-field"><span>Time zone</span>
          <input value={booking.timezone} onChange={(e) => set({ timezone: e.target.value })} /></label>
      </div>
      <div className="se-field">
        <span>Closed on</span>
        <div className="se-days">
          {DAYS.map((d, i) => {
            const on = booking.closed.includes(i);
            return (
              <button key={d} type="button" className={on ? 'is-on' : ''} aria-pressed={on}
                onClick={() => set({ closed: on ? booking.closed.filter((x) => x !== i) : [...booking.closed, i].sort() })}>{d}</button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Card({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="se-card">
      <h2>{title}</h2>
      <p className="se-hint">{hint}</p>
      {children}
    </section>
  );
}

function Text({ label, value, onChange, max, long, rows = 3, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; max: number; long?: boolean; rows?: number; placeholder?: string;
}) {
  return (
    <label className="se-field">
      <span>{label}</span>
      {long
        ? <textarea rows={rows} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

function Tools({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <span className="se-tools">
      <button aria-label="Move up" onClick={onUp}>↑</button>
      <button aria-label="Move down" onClick={onDown}>↓</button>
      <button aria-label="Remove" onClick={onRemove}>✕</button>
    </span>
  );
}

/** A photo: shows it, uploads a new one (several at once with `multiple`). */
function Photo({ project, value, onChange, onError, label = 'Upload a photo…', multiple = false }: {
  project: string; value: string; onChange: (path: string) => void; onError: (m: string) => void; label?: string; multiple?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setSending(true);
    try {
      for (const f of Array.from(files)) {
        const r = await uploadSiteImage(project, f);
        if (r) onChange(r.path);
      }
    } catch (e) { onError((e as Error).message); } finally { setSending(false); }
  };
  return (
    <div className="se-photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded photo */}
      {value && <img src={asset(value)} alt="" />}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden multiple={multiple}
        onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      <button onClick={() => input.current?.click()} disabled={sending}>{sending ? 'Uploading…' : value ? 'Replace photo…' : label}</button>
      {value && <button onClick={() => onChange('')}>Remove</button>}
    </div>
  );
}
