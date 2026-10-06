'use client';

import { use, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  API_BASE_URL, cancelSiteSchedule, getProperty, getReviewFeedback, getSiteDraft, publishSite, resolveReviewComment, saveSiteDraft,
  scheduleSite, shareSiteForReview, stopSiteReview, uploadSiteImage, type ReviewFeedback,
  type DiningPlace, type EventHall, type SiteBooking, type SiteDoc, type SiteEvents, type SiteMenu, type SiteSpace, type SiteStays, type SiteStyle, type SiteTable, type StayRoom
} from '../../../../lib/api';
import { useStudioSession } from '../../../../features/auth/useStudioSession';
import '../../../../features/studio/editor.css';
import './site-editor.css';

const asset = (p: string) => `${API_BASE_URL}/api/assets/${p}`;
/** The website's looks (website.css [data-style]): key, name, what it is, paper, ink. */
const LOOKS: [SiteStyle, string, string, string, string][] = [
  ['heritage', 'Heritage', 'Warm paper, ornaments, framed photos', '#f7f1e7', '#2a1f17'],
  ['modern', 'Modern', 'White, crisp, square corners', '#fbfbf9', '#151515'],
  ['night', 'Night', 'Warm dark, your colour glowing', '#11100e', '#f2ece2']
];
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
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false); // the date-and-time row is open
  const [when, setWhen] = useState('');
  const [reviewing, setReviewing] = useState(false); // the client review row is open
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'' | 'saving' | 'publishing'>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [here, setHere] = useState(''); // the section in view, lit in the index

  // The index lights the section the reader is in: the one crossing the band under the bar.
  const loaded = !!doc;
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.ed2.se');
    const bar = document.querySelector<HTMLElement>('.se-bar');
    if (!loaded || !root || !bar) return;
    const io = new IntersectionObserver((seen) => {
      const top = seen.find((e) => e.isIntersecting);
      if (!top) return;
      setHere(top.target.id);
      // On narrow screens the index is one scrolling row of chips: keep the lit one in it.
      const nav = document.querySelector<HTMLElement>('.se-index');
      const chip = nav?.querySelector<HTMLElement>(`a[href="#${top.target.id}"]`);
      if (nav && chip && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2 });
    }, { root, rootMargin: `-${bar.offsetHeight + 60}px 0px -60% 0px` });
    document.querySelectorAll('.se-card[id]').forEach((el) => io.observe(el));
    // The bar wraps on narrow screens; the index's chip row sits right under it.
    const measure = () => root.style.setProperty('--se-bar', `${bar.offsetHeight}px`);
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    measure(); // now, not on the observer's first call: the jump below lands by it
    // A link to one section (Reservations' "Tables", "Rooms", "Events"): the form wasn't there when the page opened.
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    return () => { io.disconnect(); ro.disconnect(); };
  }, [loaded]);

  useEffect(() => {
    if (!ok) return;
    Promise.all([getProperty(id), getSiteDraft(id)])
      .then(([p, d]) => {
        if (!p || !d) throw new Error('That project doesn’t exist, or you can’t see it.');
        setTitle(p.theme?.brand || p.title);
        setDoc(d.draft);
        setSpaces(d.spaces);
        setPublishedAt(d.publishedAt);
        setScheduledAt(d.scheduledAt);
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
  // Scheduling saves first: what goes live is the draft as it is at this moment.
  const schedule = async () => {
    const at = new Date(when);
    if (!when || !(at.getTime() > Date.now())) return setError('Pick a time in the future.');
    setBusy('publishing'); setError('');
    try {
      const r = await saveSiteDraft(id, doc);
      if (r) setDoc(r.draft);
      setDirty(false);
      const s = await scheduleSite(id, at.toISOString());
      if (s) setScheduledAt(s.scheduledAt);
      setScheduling(false);
      setNote('');
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const unschedule = async () => {
    try { await cancelSiteSchedule(id); setScheduledAt(null); } catch (e) { setError((e as Error).message); }
  };
  const published = spaces.filter((s) => s.published);
  // the viewpoints a table's "view from here" may use: the tour's space's
  const views = published.find((x) => x.id === (doc.hero.space || published[0]?.id))?.views ?? [];
  // The index beside the form: every section (titles as on the cards) and whether it has anything in it yet.
  const sections: [string, boolean][] = [
    ['Look', true],
    ['Opening', !!(doc.hero.title || doc.hero.lede || doc.hero.image)],
    ['Key facts', doc.facts.some((f) => f.n || f.k)],
    ['Story', !!doc.story.body.trim()],
    ['Spaces', doc.rooms.length > 0],
    ['Offers and packages', doc.offers.length > 0],
    ['Floor plan', doc.plan],
    ['Photos', doc.gallery.length > 0],
    ['Guest reviews', doc.reviews.items.length > 0],
    ['Menu or prices', doc.menu.items.length > 0],
    ['Table booking', doc.booking.on],
    ['More dining places', doc.dining.length > 0],
    ['Room booking', doc.stays.on],
    ['Event booking', doc.events.on],
    ['Questions guests ask', doc.faq.length > 0],
    ['Enquiries', !!(doc.contact.title || doc.contact.body)]
  ];

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
        <button onClick={() => { setScheduling(!scheduling); setError(''); }} disabled={!!busy} aria-expanded={scheduling}>Schedule…</button>
        <button onClick={() => setReviewing(!reviewing)} aria-expanded={reviewing}>Client review…</button>
        <button onClick={preview} disabled={!!busy}>Preview ↗</button>
        {publishedAt && <a className="se-open" href={`/s/${encodeURIComponent(id)}`} target="_blank" rel="noopener">Open site ↗</a>}
        <a className="se-open" href={`/studio/${encodeURIComponent(id)}/reservations`}>Reservations</a>
      </header>

      {(scheduling || scheduledAt) && (
        <div className="se-schedule" role="region" aria-label="Scheduled publishing">
          {scheduledAt && !scheduling ? (
            <>
              <span>This draft goes live <b>{new Date(scheduledAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b>. Changes after that wait for the next publish.</span>
              <button onClick={() => setScheduling(true)}>Change time</button>
              <button onClick={unschedule}>Cancel it</button>
            </>
          ) : (
            <>
              <label>Put this draft live at
                <input type="datetime-local" value={when} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  onChange={(e) => setWhen(e.target.value)} />
              </label>
              <button className="se-main" onClick={schedule} disabled={!!busy || !when}>Schedule</button>
              <button onClick={() => setScheduling(false)}>Close</button>
              <span className="se-hint">It saves first. What goes live is the draft as it is now, e.g. a new menu at midnight.</span>
            </>
          )}
        </div>
      )}

      {reviewing && <ReviewPanel id={id} dirty={dirty} onSave={save} onError={setError} />}

      <div className="se-layout">
      <nav className="se-index" aria-label="Sections">
        {sections.map(([t, filled]) => (
          <a key={t} href={`#${secId(t)}`} className={here === secId(t) ? 'is-here' : undefined} aria-current={here === secId(t) ? 'location' : undefined}>
            <i className={filled ? 'is-on' : undefined} aria-hidden />
            {t}<span className="se-sr">{filled ? ', has content' : ', empty'}</span>
          </a>
        ))}
      </nav>
      <main className="se-body">
        {!published.length && (
          <p className="se-warn">None of this project’s spaces is published yet. The website shows the live tour of a published space, so publish one in the studio first.</p>
        )}

        <Card title="Look" hint="How the whole website feels. Every look uses your brand colour and heading font.">
          <div className="se-looks" role="radiogroup" aria-label="Look">
            {LOOKS.map(([k, label, note, bg, ink]) => (
              <button key={k} type="button" role="radio" aria-checked={doc.style === k}
                className={`se-look${doc.style === k ? ' is-on' : ''}`} onClick={() => change({ style: k })}>
                <span className="se-look-swatch" style={{ background: bg, color: ink }} aria-hidden>Aa</span>
                <b>{label}</b>
                <small>{note}</small>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Opening" hint="The first thing visitors read, above the live tour.">
          <div className="se-photo-wide">
            <Photo project={id} value={doc.hero.image} label="Add a photo behind the title…" wide
              onChange={(image) => change({ hero: { ...doc.hero, image } })} onError={setError} />
          </div>
          <p className="se-hint">A wide, bright landscape photo, at least 2400 px across, with no words on it. Without one, the opening is words only.</p>
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

        <Card title="Offers and packages" hint="A honeymoon package, a weekday rate, a wedding bundle. Each gets an “Ask about this offer” button that opens the enquiry form with the offer named.">
          {doc.offers.map((o, i) => {
            const set = (patch: Partial<typeof o>) => change({ offers: doc.offers.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} className="se-item">
                <div className="se-item-head">
                  <b>{i + 1}. {o.title || 'Untitled'}</b>
                  <Tools onUp={() => change({ offers: move(doc.offers, i, -1) })} onDown={() => change({ offers: move(doc.offers, i, 1) })}
                    onRemove={() => change({ offers: doc.offers.filter((_, j) => j !== i) })} />
                </div>
                <div className="se-split">
                  <Photo project={id} value={o.image} onChange={(image) => set({ image })} onError={setError} />
                  <div>
                    <Text label="Name" value={o.title} max={80} placeholder="e.g. Honeymoon package" onChange={(title) => set({ title })} />
                    <Text label="What’s in it" value={o.body} max={400} long placeholder="Two nights in a suite, candle-lit dinner, spa for two." onChange={(body) => set({ body })} />
                    <Text label="Price" value={o.price} max={40} placeholder="From Rs 18,000" onChange={(price) => set({ price })} />
                  </div>
                </div>
              </div>
            );
          })}
          {doc.offers.length < 6 && (
            <button className="se-add" onClick={() => change({ offers: [...doc.offers, { title: '', body: '', price: '', image: '' }] })}>＋ Add an offer</button>
          )}
        </Card>

        <Card title="Floor plan" hint="The plan of the tour’s space: the one you uploaded in the studio, else the one drawn from the scan.">
          <label className="se-check">
            <input type="checkbox" checked={doc.plan} onChange={(e) => change({ plan: e.target.checked })} /> Show the floor plan
          </label>
        </Card>

        <Card title="Photos" hint="A gallery near the end of the page; each opens full size. Upload the originals (PNG, JPEG or WebP, up to 25 MB each), not screenshots: the site makes the right size for each screen.">
          <div className="se-gallery">
            {doc.gallery.map((g, i) => (
              <figure key={g}>
                {/* a resized preview: the upload itself may be a 25 MB original */}
                <Image src={asset(g)} alt="" width={300} height={300} sizes="160px" />
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

        <Card title="Guest reviews" hint="Up to eight things guests said, word for word, with their name. Link to where more are (Google, TripAdvisor) so visitors can check.">
          {doc.reviews.items.map((r, i) => {
            const items = doc.reviews.items;
            const set = (patch: Partial<typeof r>) => change({ reviews: { ...doc.reviews, items: items.map((x, j) => (j === i ? { ...x, ...patch } : x)) } });
            return (
              <div key={i} className="se-item">
                <div className="se-item-head">
                  <b>{r.name || `Review ${i + 1}`}</b>
                  <Tools onUp={() => change({ reviews: { ...doc.reviews, items: move(items, i, -1) } })}
                    onDown={() => change({ reviews: { ...doc.reviews, items: move(items, i, 1) } })}
                    onRemove={() => change({ reviews: { ...doc.reviews, items: items.filter((_, j) => j !== i) } })} />
                </div>
                <Text label="What they said" value={r.quote} max={600} long placeholder="The staff remembered our names by the second morning…" onChange={(quote) => set({ quote })} />
                <div className="se-row">
                  <Text label="Name" value={r.name} max={60} placeholder="Asha K." onChange={(name) => set({ name })} />
                  <Text label="From" value={r.from} max={60} placeholder="Stayed in March · Google" onChange={(from) => set({ from })} />
                </div>
              </div>
            );
          })}
          {doc.reviews.items.length < 8 && (
            <button className="se-add" onClick={() => change({ reviews: { ...doc.reviews, items: [...doc.reviews.items, { quote: '', name: '', from: '' }] } })}>＋ Add a review</button>
          )}
          <Text label="Where to read more (https:// link)" value={doc.reviews.link} max={300} placeholder="https://g.page/r/…"
            onChange={(link) => change({ reviews: { ...doc.reviews, link } })} />
        </Card>

        <Card title="Menu or prices" hint="For a restaurant, its dishes; for a hotel, its rooms and rates. Leave empty to hide.">
          <MenuEditor menu={doc.menu} onChange={(menu) => change({ menu })} />
        </Card>

        <Card title="Table booking" hint="Guests choose a day, a time and a table on your floor plan, and send a request; you confirm it in Reservations. Publish to put changes live.">
          <Text label="This place's name, when you have more than one" value={doc.booking.name ?? ''} max={60} placeholder="The Restaurant"
            onChange={(name) => change({ booking: { ...doc.booking, name } })} />
          <TableSetup project={id} booking={doc.booking} views={views} onError={setError} onChange={(booking) => change({ booking })} />
        </Card>

        <Card title="More dining places" hint="A café beside the restaurant, a rooftop bar: each has its own menu, floor plan, tables and hours, booked apart. Guests see them on the website and choose between them in the tour.">
          {doc.dining.map((o, i) => {
            const set = (patch: Partial<DiningPlace>) => change({ dining: doc.dining.map((x) => (x.id === o.id ? { ...x, ...patch } : x)) });
            return (
              <div key={o.id} className="se-item">
                <div className="se-item-head">
                  <b>{o.name || 'Untitled place'}</b>
                  <Tools onUp={() => change({ dining: move(doc.dining, i, -1) })} onDown={() => change({ dining: move(doc.dining, i, 1) })}
                    onRemove={() => change({ dining: doc.dining.filter((x) => x.id !== o.id) })} />
                </div>
                <Text label="Name" value={o.name} max={60} placeholder="Courtyard Café" onChange={(name) => set({ name })} />
                <MenuEditor menu={o.menu} onChange={(menu) => set({ menu })} />
                <TableSetup project={id} booking={o.booking} views={views} onError={setError} onChange={(booking) => set({ booking })} />
              </div>
            );
          })}
          {doc.dining.length < 5 && (
            <button className="se-add" onClick={() => change({ dining: [...doc.dining, {
              id: `d${Date.now().toString(36)}`, name: `Place ${doc.dining.length + 2}`,
              menu: { title: 'Menu', note: '', items: [] }, booking: { ...doc.booking, on: false, plan: '', tables: [], name: '', note: '' }
            }] })}>＋ Add a dining place</button>
          )}
        </Card>

        <Card title="Room booking" hint="Guests pick their dates and a room, and send a request; you confirm it in Reservations. While it’s on, the tour’s Book now buttons are replaced by Book a room, so requests come here. Publish to put changes live.">
          <label className="se-check">
            <input type="checkbox" checked={doc.stays.on} onChange={(e) => change({ stays: { ...doc.stays, on: e.target.checked } })} />
            Take room bookings on the website
          </label>
          <RoomsEditor project={id} stays={doc.stays} spaces={published} onError={setError} onChange={(stays) => change({ stays })} />
          <SitePlan project={id} stays={doc.stays} onError={setError} onChange={(stays) => change({ stays })} />
          <StayRules stays={doc.stays} onChange={(stays) => change({ stays })} />
          <Text label="A note under the booking form" value={doc.stays.note} max={300} placeholder="Breakfast included. Children under 6 stay free."
            onChange={(note) => change({ stays: { ...doc.stays, note } })} />
          {doc.stays.on && !doc.stays.rooms.length && (
            <p className="se-warn">Room booking stays hidden on the website until there is at least one room.</p>
          )}
        </Card>

        <Card title="Event booking" hint="For weddings, parties and meetings: guests pick a hall, the day (daytime, evening or the whole day), how many and what kind of event, and send a request; you confirm it in Reservations. Publish to put changes live.">
          <label className="se-check">
            <input type="checkbox" checked={doc.events.on} onChange={(e) => change({ events: { ...doc.events, on: e.target.checked } })} />
            Take event bookings on the website and in the tour
          </label>
          <HallsEditor project={id} events={doc.events} spaces={published} onError={setError} onChange={(events) => change({ events })} />
          <Text label="Kinds of event you host, separated by commas" value={doc.events.kinds.join(', ')} max={400}
            placeholder="Wedding, Reception, Birthday, Conference, Meeting, Other"
            onChange={(v) => change({ events: { ...doc.events, kinds: v.split(',').map((k) => k.trim()) } })} />
          <label className="se-field"><span>How far ahead guests may book (days)</span>
            <input type="number" min={7} max={730} value={doc.events.days}
              onChange={(e) => change({ events: { ...doc.events, days: num(e.target.value, 7, 730) } })} /></label>
          <Text label="A note under the booking form" value={doc.events.note} max={300} placeholder="Daytime 10:00–16:00, evening 17:00–23:00. Catering in-house."
            onChange={(note) => change({ events: { ...doc.events, note } })} />
          {doc.events.on && !doc.events.halls.some((h) => h.seated || h.standing) && (
            <p className="se-warn">Event booking stays hidden until at least one hall says how many it holds.</p>
          )}
        </Card>

        <Card title="Questions guests ask" hint="Parking, check-in times, airport pick-up, pets. The answers also reach Google, which can show them under your listing.">
          {doc.faq.map((f, i) => {
            const set = (patch: Partial<typeof f>) => change({ faq: doc.faq.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={i} className="se-item">
                <div className="se-item-head">
                  <b>{i + 1}. {f.q || 'New question'}</b>
                  <Tools onUp={() => change({ faq: move(doc.faq, i, -1) })} onDown={() => change({ faq: move(doc.faq, i, 1) })}
                    onRemove={() => change({ faq: doc.faq.filter((_, j) => j !== i) })} />
                </div>
                <Text label="Question" value={f.q} max={160} placeholder="Is there parking?" onChange={(q) => set({ q })} />
                <Text label="Answer" value={f.a} max={800} long placeholder="Yes, free and on site, for 20 cars." onChange={(a) => set({ a })} />
              </div>
            );
          })}
          {doc.faq.length < 12 && <button className="se-add" onClick={() => change({ faq: [...doc.faq, { q: '', a: '' }] })}>＋ Add a question</button>}
        </Card>

        <Card title="Enquiries" hint="The closing section. Its button opens the enquiry form; enquiries arrive with this project’s others.">
          <Text label="Heading" value={doc.contact.title} max={120} placeholder={`Visit ${title}`} onChange={(v) => change({ contact: { ...doc.contact, title: v } })} />
          <Text label="Text" value={doc.contact.body} max={400} long onChange={(v) => change({ contact: { ...doc.contact, body: v } })} />
        </Card>
      </main>
      </div>
    </div>
  );
}

/** A section card's anchor, from its title: "Key facts" → se-key-facts. */
const secId = (title: string) => `se-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;

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

/**
 * Client review: a private link to the saved draft for the client, who pins
 * comments on it and approves it (s/[property]/review). Their comments land
 * here, to resolve as they're done; the approval shows whether it was this
 * draft or an earlier one.
 */
function ReviewPanel({ id, dirty, onSave, onError }: { id: string; dirty: boolean; onSave: () => Promise<void>; onError: (m: string) => void }) {
  const [fb, setFb] = useState<ReviewFeedback | null>(null);
  const [copied, setCopied] = useState(false);
  const load = () => getReviewFeedback(id).then(setFb).catch((e: Error) => onError(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per project
  const link = fb?.key ? `${location.origin}/s/${encodeURIComponent(id)}/review?key=${fb.key}` : '';
  const share = async () => {
    if (dirty) await onSave();
    try { await shareSiteForReview(id); load(); } catch (e) { onError((e as Error).message); }
  };
  const stop = async () => {
    if (!window.confirm('Stop the review link? Whoever has it can no longer open the draft. Their comments stay here.')) return;
    try { await stopSiteReview(id); load(); } catch (e) { onError((e as Error).message); }
  };
  const resolve = async (cid: string, resolved: boolean) => {
    try { await resolveReviewComment(id, cid, resolved); load(); } catch (e) { onError((e as Error).message); }
  };
  if (!fb) return <div className="se-schedule">Loading the review…</div>;
  const open = fb.comments.filter((c) => !c.resolved);
  return (
    <div className="se-schedule se-review" role="region" aria-label="Client review">
      {fb.key ? (
        <div className="se-review-link">
          <span>Your client’s link to the saved draft (no account needed):</span>
          <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Review link" />
          <button onClick={() => { navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Copied' : 'Copy'}</button>
          <a className="se-open" href={link} target="_blank" rel="noopener">Open ↗</a>
          <button onClick={stop}>Stop the link</button>
        </div>
      ) : (
        <div className="se-review-link">
          <span>Share the saved draft with your client: they pin comments on the page and approve it, before anything goes live.</span>
          <button className="se-main" onClick={share}>Make a review link</button>
        </div>
      )}
      {fb.approval && (
        <p className={fb.approvedThisDraft ? 'se-review-ok' : 'se-hint'}>
          {fb.approvedThisDraft ? '✓ ' : ''}Approved by <b>{fb.approval.name}</b>, {new Date(fb.approval.at).toLocaleString()}
          {fb.approvedThisDraft ? ': this draft.' : '. The draft has changed since; share it again for a new approval.'}
        </p>
      )}
      {fb.comments.length > 0 && (
        <ol className="se-review-list">
          {[...open, ...fb.comments.filter((c) => c.resolved)].map((c) => (
            <li key={c.id} className={c.resolved ? 'is-resolved' : ''}>
              <label>
                <input type="checkbox" checked={c.resolved} onChange={(e) => resolve(c.id, e.target.checked)} aria-label="Resolved" />
                <span><b>{c.name}</b>{c.where && <> on “{c.where}”</>}: {c.text} <small>{new Date(c.at).toLocaleString()}</small></span>
              </label>
            </li>
          ))}
        </ol>
      )}
      {fb.key && !fb.comments.length && <p className="se-hint">No comments yet.</p>}
    </div>
  );
}

const num = (v: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || lo));

/**
 * The rooms the hotel lets online: a room type ("Deluxe Room", 12 of them)
 * or one of a kind ("Pool Villa", 1). How many a room sleeps decides how
 * many rooms a bigger party takes. A room can show its space in 3D.
 */
function RoomsEditor({ project, stays, spaces, onChange, onError }: {
  project: string; stays: SiteStays; spaces: SiteSpace[];
  onChange: (s: SiteStays) => void; onError: (m: string) => void;
}) {
  const setRooms = (rooms: StayRoom[]) => onChange({ ...stays, rooms });
  const edit = (rid: string, patch: Partial<StayRoom>) => setRooms(stays.rooms.map((r) => (r.id === rid ? { ...r, ...patch } : r)));
  const add = () => setRooms([...stays.rooms, {
    id: `r${Date.now().toString(36)}`, label: `Room ${stays.rooms.length + 1}`, units: 1, sleeps: 2, price: '', per: '/ night',
    features: '', image: '', area: '', pin: false, x: 0.5, y: 0.5, space: '', view: ''
  }]);
  return (
    <>
      {stays.rooms.map((r, i) => {
        const views = spaces.find((s) => s.id === r.space)?.views ?? [];
        return (
          <div key={r.id} className="se-item">
            <div className="se-item-head">
              <b>{r.label || 'Untitled room'}</b>
              <Tools onUp={() => setRooms(move(stays.rooms, i, -1))} onDown={() => setRooms(move(stays.rooms, i, 1))}
                onRemove={() => setRooms(stays.rooms.filter((x) => x.id !== r.id))} />
            </div>
            <div className="se-split">
              <Photo project={project} value={r.image} onChange={(image) => edit(r.id, { image })} onError={onError} />
              <div>
                <div className="se-row">
                  <Text label="Name" value={r.label} max={60} placeholder="Deluxe Room, Pool Villa…" onChange={(label) => edit(r.id, { label })} />
                  <label className="se-field"><span>How many</span>
                    <input type="number" min={1} max={200} value={r.units} onChange={(e) => edit(r.id, { units: num(e.target.value, 1, 200) })} /></label>
                  <label className="se-field"><span>Sleeps</span>
                    <input type="number" min={1} max={20} value={r.sleeps} onChange={(e) => edit(r.id, { sleeps: num(e.target.value, 1, 20) })} /></label>
                </div>
                <div className="se-row">
                  <Text label="Price" value={r.price} max={30} placeholder="Rs 9,500" onChange={(price) => edit(r.id, { price })} />
                  <Text label="Per" value={r.per} max={20} placeholder="/ night" onChange={(per) => edit(r.id, { per })} />
                  <Text label="Where" value={r.area} max={40} placeholder="Garden wing" onChange={(area) => edit(r.id, { area })} />
                </div>
                <Text label="Deposit, in words (shown to guests; nothing is charged online)" value={r.deposit ?? ''} max={60}
                  placeholder="Rs 2,000 when we confirm" onChange={(deposit) => edit(r.id, { deposit })} />
                <Text label="Features, separated by commas" value={r.features} max={200} placeholder="King bed, River view, 32 m²"
                  onChange={(features) => edit(r.id, { features })} />
                <div className="se-row">
                  <label className="se-field">
                    <span>Its space in 3D</span>
                    <select value={r.space} onChange={(e) => edit(r.id, { space: e.target.value, view: '' })}>
                      <option value="">None</option>
                      {spaces.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  </label>
                  <label className="se-field">
                    <span>Viewpoint</span>
                    <select value={r.view} disabled={!r.space} onChange={(e) => edit(r.id, { view: e.target.value })}>
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
      {stays.rooms.length < 40 && <button className="se-add" onClick={add}>＋ Add a room</button>}
    </>
  );
}

/** The halls a venue books for events (server/src/events.js), like the rooms: a photo, how many it holds, its 3D space. */
function HallsEditor({ project, events, spaces, onChange, onError }: {
  project: string; events: SiteEvents; spaces: SiteSpace[];
  onChange: (e: SiteEvents) => void; onError: (m: string) => void;
}) {
  const setHalls = (halls: EventHall[]) => onChange({ ...events, halls });
  const edit = (hid: string, patch: Partial<EventHall>) => setHalls(events.halls.map((h) => (h.id === hid ? { ...h, ...patch } : h)));
  const add = () => setHalls([...events.halls, {
    id: `h${Date.now().toString(36)}`, label: `Hall ${events.halls.length + 1}`, seated: 100, standing: 0,
    area: '', features: '', image: '', space: '', view: ''
  }]);
  return (
    <>
      {events.halls.map((h, i) => {
        const views = spaces.find((x) => x.id === h.space)?.views ?? [];
        return (
          <div key={h.id} className="se-item">
            <div className="se-item-head">
              <b>{h.label || 'Untitled hall'}</b>
              <Tools onUp={() => setHalls(move(events.halls, i, -1))} onDown={() => setHalls(move(events.halls, i, 1))}
                onRemove={() => setHalls(events.halls.filter((x) => x.id !== h.id))} />
            </div>
            <div className="se-split">
              <Photo project={project} value={h.image} onChange={(image) => edit(h.id, { image })} onError={onError} />
              <div>
                <div className="se-row">
                  <Text label="Name" value={h.label} max={60} placeholder="Grand Banquet Hall, Garden Lawn…" onChange={(label) => edit(h.id, { label })} />
                  <label className="se-field"><span>Seated</span>
                    <input type="number" min={0} max={5000} value={h.seated} onChange={(e) => edit(h.id, { seated: num(e.target.value, 0, 5000) })} /></label>
                  <label className="se-field"><span>Standing</span>
                    <input type="number" min={0} max={10000} value={h.standing} onChange={(e) => edit(h.id, { standing: num(e.target.value, 0, 10000) })} /></label>
                </div>
                <div className="se-row">
                  <Text label="Size" value={h.area} max={40} placeholder="450 m²" onChange={(area) => edit(h.id, { area })} />
                  <Text label="Price" value={h.price ?? ''} max={40} placeholder="Rs 1,500 per plate" onChange={(price) => edit(h.id, { price })} />
                  <Text label="Deposit" value={h.deposit ?? ''} max={60} placeholder="Rs 20,000 to hold the date" onChange={(deposit) => edit(h.id, { deposit })} />
                </div>
                <Text label="Features, separated by commas" value={h.features} max={200} placeholder="Stage, Dance floor, In-house catering, Parking"
                  onChange={(features) => edit(h.id, { features })} />
                <div className="se-row">
                  <label className="se-field">
                    <span>Its space in 3D</span>
                    <select value={h.space} onChange={(e) => edit(h.id, { space: e.target.value, view: '' })}>
                      <option value="">None</option>
                      {spaces.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                    </select>
                  </label>
                  <label className="se-field">
                    <span>Viewpoint</span>
                    <select value={h.view} disabled={!h.space} onChange={(e) => edit(h.id, { view: e.target.value })}>
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
      {events.halls.length < 20 && <button className="se-add" onClick={add}>＋ Add a hall</button>}
    </>
  );
}

/** An optional site plan (a resort layout, or a floor's plan) with the rooms placed on it, to pick them by sight. */
function SitePlan({ project, stays, onChange, onError }: {
  project: string; stays: SiteStays; onChange: (s: SiteStays) => void; onError: (m: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState('');
  const drag = useRef<string | null>(null);
  const at = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const f = (v: number) => Math.min(1, Math.max(0, Math.round(v * 10000) / 10000));
    return { x: f((e.clientX - r.left) / r.width), y: f((e.clientY - r.top) / r.height) };
  };
  const edit = (rid: string, patch: Partial<StayRoom>) => onChange({ ...stays, rooms: stays.rooms.map((r) => (r.id === rid ? { ...r, ...patch } : r)) });
  const current = stays.rooms.find((r) => r.id === sel);

  if (!stays.plan) {
    return (
      <div className="se-field">
        <span>A site plan, optional: your resort’s layout or a floor plan, so guests can pick a room on it (PNG, JPEG or WebP)</span>
        <Photo project={project} value="" label="Upload a site plan…" onChange={(plan) => onChange({ ...stays, plan })} onError={onError} />
      </div>
    );
  }
  return (
    <div className="se-field">
      <span>Pick a room, then click the plan to put it there; drag a marker to move it. {stays.rooms.filter((r) => r.pin).length} of {stays.rooms.length} on the plan.</span>
      <div className="se-row">
        <label className="se-field">
          <span>Room to place</span>
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">Choose a room…</option>
            {stays.rooms.map((r) => <option key={r.id} value={r.id}>{r.label || 'Untitled room'}{r.pin ? ' · on the plan' : ''}</option>)}
          </select>
        </label>
      </div>
      <div className="se-plan" ref={box}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target as HTMLElement).matches('img')) return;
          if (!current) return onError('Choose the room to place first.');
          edit(current.id, { pin: true, ...at(e) });
        }}
        onPointerMove={(e) => { if (drag.current) edit(drag.current, at(e)); }}
        onPointerUp={() => { drag.current = null; }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the uploaded plan */}
        <img src={asset(stays.plan)} alt="" draggable={false} />
        {stays.rooms.filter((r) => r.pin).map((r) => (
          <button key={r.id} type="button" className={`se-table se-pin${r.id === sel ? ' is-on' : ''}`}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }} title={r.label}
            onPointerDown={(e) => {
              e.stopPropagation();
              try { e.currentTarget.parentElement?.setPointerCapture(e.pointerId); } catch { /* no pointer to follow: still selects */ }
              drag.current = r.id;
              setSel(r.id);
            }}>
            {r.label || '·'}
          </button>
        ))}
      </div>
      <div className="se-row">
        {current?.pin && <button className="se-remove" onClick={() => edit(current.id, { pin: false })}>Take {current.label || 'it'} off the plan</button>}
        <Photo project={project} value="" label="Replace the site plan…" onChange={(plan) => onChange({ ...stays, plan })} onError={onError} />
        <button className="se-remove" onClick={() => onChange({ ...stays, plan: '' })}>Remove the site plan</button>
      </div>
    </div>
  );
}

/** When and how long: check-in and check-out times, the shortest and longest stay, how far ahead. */
function StayRules({ stays, onChange }: { stays: SiteStays; onChange: (s: SiteStays) => void }) {
  const set = (patch: Partial<SiteStays>) => onChange({ ...stays, ...patch });
  return (
    <>
      <div className="se-row">
        <label className="se-field"><span>Check-in from</span><input type="time" value={stays.checkin} onChange={(e) => set({ checkin: e.target.value })} /></label>
        <label className="se-field"><span>Check-out by</span><input type="time" value={stays.checkout} onChange={(e) => set({ checkout: e.target.value })} /></label>
        <label className="se-field"><span>Shortest stay (nights)</span>
          <input type="number" min={1} max={30} value={stays.minNights} onChange={(e) => set({ minNights: num(e.target.value, 1, 30) })} /></label>
        <label className="se-field"><span>Longest stay online (nights)</span>
          <input type="number" min={1} max={60} value={stays.maxNights} onChange={(e) => set({ maxNights: num(e.target.value, 1, 60) })} /></label>
      </div>
      <div className="se-row">
        <label className="se-field"><span>Book up to (days ahead)</span>
          <input type="number" min={1} max={365} value={stays.days} onChange={(e) => set({ days: num(e.target.value, 1, 365) })} /></label>
        <label className="se-field"><span>Largest party online</span>
          <input type="number" min={1} max={40} value={stays.maxGuests} onChange={(e) => set({ maxGuests: num(e.target.value, 1, 40) })} /></label>
        <label className="se-field"><span>Time zone</span>
          <input value={stays.timezone} onChange={(e) => set({ timezone: e.target.value })} /></label>
      </div>
    </>
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

/** A menu's heading, note and items (the main place's, or another dining place's). */
function MenuEditor({ menu, onChange }: { menu: SiteMenu; onChange: (m: SiteMenu) => void }) {
  const items = menu.items;
  return (
    <>
      <div className="se-row">
        <Text label="Heading" value={menu.title} max={80} placeholder="Menu" onChange={(v) => onChange({ ...menu, title: v })} />
        <Text label="Note" value={menu.note} max={300} placeholder="Prices include VAT." onChange={(v) => onChange({ ...menu, note: v })} />
      </div>
      {items.map((m, i) => {
        const set = (patch: Partial<typeof m>) => onChange({ ...menu, items: items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
        return (
          <div key={i} className="se-row se-menu">
            <input aria-label="Dish or item" placeholder="Newari khaja set" value={m.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
            <input aria-label="Description" placeholder="Beaten rice, choila, bara…" value={m.desc} maxLength={200} onChange={(e) => set({ desc: e.target.value })} />
            <input aria-label="Price" placeholder="Rs 650" value={m.price} maxLength={30} onChange={(e) => set({ price: e.target.value })} />
            <input aria-label="Label" placeholder="Vegetarian" value={m.tag} maxLength={30} onChange={(e) => set({ tag: e.target.value })} />
            <Tools onUp={() => onChange({ ...menu, items: move(items, i, -1) })} onDown={() => onChange({ ...menu, items: move(items, i, 1) })}
              onRemove={() => onChange({ ...menu, items: items.filter((_, j) => j !== i) })} />
          </div>
        );
      })}
      {items.length < 40 && (
        <button className="se-add" onClick={() => onChange({ ...menu, items: [...items, { name: '', desc: '', price: '', tag: '' }] })}>＋ Add an item</button>
      )}
    </>
  );
}

/** A place's table booking: on or off, its floor plan and tables, its hours, a note. */
function TableSetup({ project, booking, views, onChange, onError }: {
  project: string; booking: SiteBooking; views: { id: string; label: string }[];
  onChange: (b: SiteBooking) => void; onError: (m: string) => void;
}) {
  return (
    <>
      <label className="se-check">
        <input type="checkbox" checked={booking.on} onChange={(e) => onChange({ ...booking, on: e.target.checked })} />
        Take table bookings on the website
      </label>
      <PlanEditor project={project} booking={booking} onError={onError} views={views} onChange={onChange} />
      <Hours booking={booking} onChange={onChange} />
      <Text label="A note under the booking form" value={booking.note} max={300} placeholder="Tables are held for 15 minutes. For groups over 8, call us."
        onChange={(note) => onChange({ ...booking, note })} />
      {booking.on && (!booking.plan || !booking.tables.length) && (
        <p className="se-warn">Booking stays hidden on the website until there is a floor plan with at least one table.</p>
      )}
    </>
  );
}

function Card({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="se-card" id={secId(title)}>
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
function Photo({ project, value, onChange, onError, label = 'Upload a photo…', multiple = false, wide = false }: {
  project: string; value: string; onChange: (path: string) => void; onError: (m: string) => void; label?: string; multiple?: boolean; wide?: boolean;
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
      {/* a resized preview: the upload itself may be a 25 MB original */}
      {value && <Image src={asset(value)} alt="" width={1200} height={900} sizes={wide ? "(max-width: 900px) 100vw, 840px" : "220px"} />}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden multiple={multiple}
        onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      <button onClick={() => input.current?.click()} disabled={sending}>{sending ? 'Uploading…' : value ? 'Replace photo…' : label}</button>
      {value && <button onClick={() => onChange('')}>Remove</button>}
    </div>
  );
}
