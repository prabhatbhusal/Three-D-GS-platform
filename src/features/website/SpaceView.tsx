import Image from 'next/image';
import { API_BASE_URL, photoSize, type PublicSite } from '../../lib/api';
import { SiteReveal, SiteTour, SpaceEnquiry } from './SiteParts';
import { SiteNav } from './SiteNav';
import { SmoothScroll } from '../marketing/layout/SmoothScroll';
import { SiteFooter, siteBasics } from './SiteView';
import '../tour/viewer.css';
import './website.css';

const asset = (p: string) => `${API_BASE_URL}/api/assets/${p}`;
const pic = (p: string) => {
  const [width, height] = photoSize(p) ?? [1600, 1067];
  return { src: asset(p), width, height };
};

/**
 * One space of a client's site (2026-10-07): /s/<project>/<space>. After the
 * owner's plan: the nav with a way back to every space, the space's live tour
 * full width, what it is (title, capacity and size, amenities, photos) beside
 * the enquiry, the other spaces, a bar fixed to the foot (Book now, WhatsApp,
 * Call), and the hub's footer. What it says comes from the website draft: the
 * chapter, room type and hall that point at this space.
 */
export function SpaceView({ data, space }: { data: PublicSite; space: string }) {
  const { project, site } = data;
  const { name, logo, style, asks, cta, navReach } = siteBasics(data);
  const spaces = data.spaces ?? [];
  const sp = spaces.find((s) => s.id === space)!;
  const home = `/s/${encodeURIComponent(project.id)}`;

  // What the website says about this space
  const room = site.rooms.find((r) => r.space === space);
  const stay = site.stays?.rooms.find((r) => r.space === space);
  const hall = site.events?.halls.find((h) => h.space === space);
  const facts = [
    hall?.seated ? `Seats ${hall.seated}` : '', hall?.standing ? `${hall.standing} standing` : '',
    stay?.sleeps ? `Sleeps ${stay.sleeps}` : '', hall?.area || stay?.area || ''
  ].filter(Boolean);
  const amenities = [...new Set([room?.features, stay?.features, hall?.features]
    .flatMap((f) => (f ? f.split(/\s*[·,]\s*/) : [])).filter(Boolean))];
  const photos = [...new Set([room?.image, stay?.image, hall?.image].filter(Boolean) as string[])];
  const about = room?.body || sp.tagline || '';
  const price = stay?.price ? `${stay.price} ${stay.per}`.trim() : hall?.price || '';

  // Book now: this space's own booking on the hub, else the site's main button
  const book: [string, string] | null = hall && site.events ? [`${home}#events`, 'Book now']
    : stay && site.stays ? [`${home}#stay`, 'Book now']
    : cta[1] === 'Book now' ? [`${home}${cta[0]}`, 'Book now'] : null;
  const chapters: [string, string][] = [['tour', 'Spaces'], ...(site.gallery.length ? [['gallery', 'Gallery'] as [string, string]] : []), ['contact', 'Contact']];
  const others = spaces.filter((s) => s.id !== space);
  const src = `/tour?space=${encodeURIComponent(sp.id)}&embed=1&mono=1&key=${encodeURIComponent(sp.key)}`;

  return (
    <div className="ws ws-space-page" data-style={site.style ?? 'heritage'} style={style}>
      <SiteNav name={name} logo={logo} base={home} chapters={chapters} cta={book ?? [`${home}${cta[0]}`, cta[1]]} reach={navReach} />

      <nav className="ws-crumb" aria-label="Breadcrumb">
        <a href={`${home}#tour`}>← Back to all spaces</a>
        <span aria-hidden>/</span>
        <span aria-current="page">{sp.title}</span>
      </nav>

      <section className="ws-window ws-space-viewer" aria-label={`${sp.title}, live 3D tour`}>
        <SiteTour src={src} title={sp.title} />
        <p className="ws-window-hint">Drag to look around. Open a marker for its details; keys 1 to 4 change how you move.</p>
      </section>

      <section className="ws-space-info ws-reveal">
        <div className="ws-space-txt">
          <h1>{sp.title}</h1>
          {facts.length > 0 && <p className="ws-space-facts">{facts.join(' · ')}</p>}
          {price && <p className="ws-space-price">{price}</p>}
          {about && <p className="ws-space-about">{about}</p>}
          {amenities.length > 0 && <ul className="ws-features">{amenities.map((a) => <li key={a}>{a}</li>)}</ul>}
          {photos.length > 0 && (
            <div className="ws-space-photos">
              {photos.map((p) => <Image key={p} {...pic(p)} alt="" sizes="(max-width: 760px) 100vw, 30vw" />)}
            </div>
          )}
        </div>
        <aside id="enquire" className="ws-space-ask">
          <h2>Enquire</h2>
          <p>Tell us your dates, how many of you and what you need. We answer within a working day.</p>
          {asks
            ? <SpaceEnquiry project={project.id} space={sp.id} title={sp.title} />
            : <p>Call or message us using the buttons below.</p>}
        </aside>
      </section>

      {others.length > 0 && (
        <section className="ws-others ws-reveal" aria-label="Explore other spaces">
          <h2>Explore other spaces</h2>
          <div className="ws-others-grid">
            {others.map((o) => (
              <a key={o.id} href={`${home}/${encodeURIComponent(o.id)}`} className="ws-other">
                {/* eslint-disable-next-line @next/next/no-img-element -- the space's tour picture, a JPEG from the API */}
                {o.thumb ? <img src={`${API_BASE_URL}${o.thumb}`} alt="" loading="lazy" /> : <span className="ws-hl-ph" aria-hidden />}
                <b>{o.title}</b>
              </a>
            ))}
          </div>
        </section>
      )}

      <SiteFooter data={data} />

      {/* the action bar, fixed to the foot */}
      <div className="ws-actbar" role="group" aria-label="Book or reach us">
        {book && <a className="ws-btn" href={book[0]}>Book now</a>}
        {navReach.whatsapp && <a className="ws-act" href={navReach.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        {navReach.call && <a className="ws-act" href={navReach.call}>Call</a>}
        {!book && asks && <a className="ws-btn" href="#enquire">Enquire</a>}
      </div>
      <SiteReveal />
      <SmoothScroll root=".ws" magnetic=".ws-btn, .wsn-ic, .ws-act" />
    </div>
  );
}
