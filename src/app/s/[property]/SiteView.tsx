import Link from 'next/link';
import { API_BASE_URL, type PublicSite } from '../../../lib/api';
import type { BrandFont } from '../../../@types/config.types';
import { inkOn } from '../../../lib/brandColor';
import { BookThisRoom, SiteEnquire, SiteReveal, SiteTour, ViewIn3D } from './SiteParts';
import { TableBooking } from '../../../components/TableBooking';
import { RoomBooking } from '../../../components/RoomBooking';
import '../../../components/viewer.css';
import './website.css';

const FACES: Record<BrandFont, string> = {
  serif: "'Georgia', 'Times New Roman', serif",
  sans: "system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  classic: "'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif"
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const asset = (p: string) => `${API_BASE_URL}/api/assets/${p}`;
const paragraphs = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/**
 * The page itself, from the site data the API shapes (routes/sites.js
 * renderSite): the public page renders the published site, the studio's
 * Preview the saved draft. In preview nothing reaches anyone: the enquiry
 * button and booking requests wait for Publish.
 */
export function SiteView({ data, preview = false, review = false }: {
  data: PublicSite; preview?: boolean;
  /** The client's review link (/s/<project>/review): a draft, without the studio's banner. */
  review?: boolean;
}) {
  const { project, site, tour, plan } = data;
  const info = project.info ?? {};
  // The brand's own words fill in what the site leaves empty.
  const eyebrow = site.hero.eyebrow || info.tagline || '';
  const story = site.story.title || site.story.body ? site.story : info.about ? { title: `About ${project.theme.brand || project.title}`, body: info.about } : null;
  const reach = [
    info.phone && { label: 'Phone', text: info.phone, href: `tel:${info.phone.replace(/[^\d+]/g, '')}` },
    info.email && { label: 'Email', text: info.email, href: `mailto:${info.email}` },
    info.address && { label: 'Address', text: info.address, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}` },
    info.website && { label: 'Website', text: info.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), href: info.website },
    info.instagram && { label: 'Instagram', text: 'Instagram', href: info.instagram },
    info.facebook && { label: 'Facebook', text: 'Facebook', href: info.facebook }
  ].filter(Boolean) as { label: string; text: string; href: string }[];
  const name = project.theme.brand || project.title;
  const logo = project.theme.logo ? asset(project.theme.logo) : null;
  const accent = project.theme.accent || '#9a7b4f';
  const style = {
    '--ws-accent': accent,
    '--ws-on-accent': inkOn(accent),
    '--ws-serif': FACES[project.theme.font ?? 'serif']
  } as React.CSSProperties;
  const tourSrc = tour ? `/tour?space=${encodeURIComponent(tour.space)}&embed=1&key=${encodeURIComponent(tour.key)}` : null;
  const menu = site.menu.items.length ? site.menu : null;
  // A chapter whose 3D space is also a room the hotel lets online offers it for booking.
  const bookable = (space: string) => (space ? site.stays?.rooms.find((r) => r.space === space) : undefined);
  const nav = [
    site.rooms.length && ['#spaces', 'Spaces'],
    plan && ['#plan', 'Floor plan'],
    menu && ['#menu', menu.title || 'Menu'],
    site.stays && ['#stay', 'Book a room'],
    site.booking && ['#reserve', 'Book a table'],
    ['#contact', 'Enquire']
  ].filter(Boolean) as [string, string][];

  return (
    <div className="ws" style={style}>
      {preview && !review && (
        <p className="ws-preview" role="status">
          <b>Preview</b> of your saved draft. Visitors see it after you publish.
          {/* plain <a>: the studio wants a full page load */}
          <a href={`/studio/${encodeURIComponent(project.id)}/site`}>Back to the editor</a>
        </p>
      )}
      <header className="ws-top">
        <span className="ws-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- the client's logo from the API */}
          {logo && <img src={logo} alt="" />}
          {name}
        </span>
        <nav aria-label="Sections">
          {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
      </header>

      <section className="ws-hero">
        {eyebrow && <p className="ws-eyebrow">{eyebrow}</p>}
        <h1>{site.hero.title || name}</h1>
        {site.hero.lede && <p className="ws-lede">{site.hero.lede}</p>}
        {site.stays ? <a className="ws-btn ws-hero-cta" href="#stay">Book a room</a>
          : site.booking && <a className="ws-btn ws-hero-cta" href="#reserve">Book a table</a>}
      </section>

      {tour && tourSrc && (
        <section className="ws-stage" aria-label="Live 3D tour">
          <SiteTour src={tourSrc} title={tour.title} />
          <p className="ws-caption">
            Live 3D tour of {tour.title}. Drag to look around.{' '}
            {/* a plain <a>: the tour wants a full page load */}
            <a href={`/t/${encodeURIComponent(project.id)}/${encodeURIComponent(tour.space)}`}>Open full screen ↗</a>
          </p>
        </section>
      )}

      {site.facts.length > 0 && (
        <section className="ws-facts ws-reveal">
          {site.facts.map((f, i) => <div key={i}><strong>{f.n}</strong><span>{f.k}</span></div>)}
        </section>
      )}

      {story && (
        <section className="ws-story ws-reveal">
          <h2>{story.title}</h2>
          <div>{paragraphs(story.body).map((p, i) => <p key={i}>{p}</p>)}</div>
        </section>
      )}

      {site.rooms.length > 0 && (
        <section id="spaces" className="ws-rooms">
          {site.rooms.map((r, i) => (
            <article key={i} className="ws-room ws-reveal">
              {/* eslint-disable-next-line @next/next/no-img-element -- the studio's photo */}
              {r.image ? <img src={asset(r.image)} alt="" loading="lazy" /> : <div className="ws-room-ph" aria-hidden />}
              <div className="ws-room-txt">
                <p className="ws-num">{ROMAN[i] ?? i + 1}</p>
                <h2>{r.title}</h2>
                {paragraphs(r.body).map((p, j) => <p key={j}>{p}</p>)}
                {r.features && (
                  <ul className="ws-features">
                    {r.features.split(/\s*[·,]\s*/).filter(Boolean).map((f) => <li key={f}>{f}</li>)}
                  </ul>
                )}
                {tour && r.space && <ViewIn3D space={r.space} view={r.view} />}
                {bookable(r.space) && <BookThisRoom room={bookable(r.space)!.id} />}
              </div>
            </article>
          ))}
        </section>
      )}

      {plan && (
        <section id="plan" className="ws-plan ws-reveal">
          <h2>Floor plan</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- the space's plan, drawn from its scan or uploaded */}
          <img src={asset(plan)} alt={`Floor plan of ${tour?.title ?? name}`} loading="lazy" />
        </section>
      )}

      {site.gallery.length > 0 && (
        <section className="ws-gallery ws-reveal" aria-label="Photos">
          {/* eslint-disable-next-line @next/next/no-img-element -- the studio's photos */}
          {site.gallery.map((g) => <img key={g} src={asset(g)} alt="" loading="lazy" />)}
        </section>
      )}

      {menu && (
        <section id="menu" className="ws-menu ws-reveal">
          <h2>{menu.title || 'Menu'}</h2>
          {menu.note && <p className="ws-dim">{menu.note}</p>}
          <ul>
            {menu.items.map((m, i) => (
              <li key={i}>
                <div className="ws-menu-row"><b>{m.name}</b><span aria-hidden /><em>{m.price}</em></div>
                {(m.desc || m.tag) && <p>{m.desc}{m.tag && <span className="ws-tag">{m.tag}</span>}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {site.stays && (
        <section id="stay" className="ws-book">
          <h2>Book a room</h2>
          <p className="ws-dim">Choose your dates and how many of you, then pick your room.</p>
          <RoomBooking project={project.id} stays={site.stays} tour={!!tour} preview={preview} />
        </section>
      )}

      {site.booking && (
        <section id="reserve" className="ws-book">
          <h2>Book a table</h2>
          <p className="ws-dim">Choose the day, how many of you, and the time, then pick your table on our floor plan.</p>
          <TableBooking project={project.id} booking={site.booking} tourSpace={tour?.space ?? null} preview={preview} />
        </section>
      )}

      <section id="contact" className="ws-contact ws-reveal">
        <h2>{site.contact.title || `Visit ${name}`}</h2>
        {site.contact.body && <p className="ws-dim">{site.contact.body}</p>}
        <SiteEnquire project={project.id} name={name} preview={preview} />
        {reach.length > 0 && (
          <ul className="ws-reach">
            {reach.map((r) => (
              <li key={r.label}>
                <span>{r.label}</span>
                <a href={r.href} {...(/^https?:/.test(r.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{r.text}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="ws-foot">
        <span>{name}</span>
        <span>3D tour by <Link href="/">RCAAS.tech</Link></span>
      </footer>
      <SiteReveal />
    </div>
  );
}
