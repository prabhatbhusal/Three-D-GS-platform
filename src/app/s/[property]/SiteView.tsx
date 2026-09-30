import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';
import { API_BASE_URL, photoSize, whatsappHref, type PublicSite, type SiteBooking, type SiteMenu } from '../../../lib/api';
import type { BrandFont } from '../../../@types/config.types';
import { inkOn } from '../../../lib/brandColor';
import { AskAbout, BookThisHall, BookThisRoom, SiteEnquire, SiteGallery, SiteReveal, SiteTour, ViewIn3D } from './SiteParts';
import { TableBooking } from '../../../components/TableBooking';
import { RoomBooking } from '../../../components/RoomBooking';
import { EventBooking } from '../../../components/EventBooking';
import '../../../components/viewer.css';
import './website.css';

const FACES: Record<BrandFont, string> = {
  serif: "'Georgia', 'Times New Roman', serif",
  sans: "system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  classic: "'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif"
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const asset = (p: string) => `${API_BASE_URL}/api/assets/${p}`;
/** A site photo for next/image: its own size when the name carries it, else a 3:2 guess. */
const pic = (p: string) => {
  const [width, height] = photoSize(p) ?? [1600, 1067];
  return { src: asset(p), width, height };
};
const paragraphs = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/** A section's small label, its title and the look's ornament under it. */
function Head({ kicker, title, id }: { kicker?: string; title: string; id?: string }) {
  return (
    <header className="ws-head">
      {kicker && <p className="ws-kicker">{kicker}</p>}
      <h2 id={id}>{title}</h2>
      <span className="ws-orn" aria-hidden>◆</span>
    </header>
  );
}

/** A place's menu: the main one (#menu) or another dining place's (#menu-<id>). */
function MenuSection({ id, kicker, menu }: { id: string; kicker: string; menu: SiteMenu }) {
  return (
    <section id={id} className="ws-menu ws-reveal">
      <Head kicker={kicker} title={menu.title || 'Menu'} />
      {menu.note && <p className="ws-dim">{menu.note}</p>}
      <ul className={menu.items.length > 6 ? 'is-long' : undefined}>
        {menu.items.map((m, i) => (
          <li key={i}>
            <div className="ws-menu-row"><b>{m.name}</b><span aria-hidden /><em>{m.price}</em></div>
            {(m.desc || m.tag) && <p>{m.desc}{m.tag && <span className="ws-tag">{m.tag}</span>}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A place's table booking: the main one (#reserve) or another dining place's (#reserve-<id>). */
function ReserveSection({ id, kicker, project, booking, tourSpace, preview }: {
  id: string; kicker: string; project: string; booking: SiteBooking; tourSpace: string | null; preview: boolean;
}) {
  return (
    <section id={id} className="ws-book">
      <Head kicker={kicker} title="Book a table" />
      <p className="ws-dim">Choose the day, how many of you, and the time, then pick your table on our floor plan.</p>
      <TableBooking project={project} booking={booking} tourSpace={tourSpace} preview={preview} />
    </section>
  );
}

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" /></svg>
);

/**
 * The page itself, from the site data the API shapes (routes/sites.js
 * renderSite): the public page renders the published site, the studio's
 * Preview the saved draft. In preview nothing reaches anyone: the enquiry
 * button and booking requests wait for Publish.
 *
 * Its look (`site.style`: heritage, modern, night) and the brand's accent and
 * font make each client's site its own; photos are the client's originals,
 * resized per screen by next/image.
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
    info.whatsapp && { label: 'WhatsApp', text: `+${info.whatsapp}`, href: whatsappHref(info.whatsapp, 'Hi! I found you on your website.') },
    info.email && { label: 'Email', text: info.email, href: `mailto:${info.email}` },
    info.address && { label: 'Address', text: info.address, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}` },
    info.website && { label: 'Website', text: info.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), href: info.website },
    info.instagram && { label: 'Instagram', text: 'Instagram', href: info.instagram },
    info.facebook && { label: 'Facebook', text: 'Facebook', href: info.facebook }
  ].filter(Boolean) as { label: string; text: string; href: string }[];
  const social = reach.filter((r) => r.label === 'Instagram' || r.label === 'Facebook');
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
  // More places to eat and drink, each with a menu or a table booking to show
  const dining = (site.dining ?? []).filter((o) => o.menu.items.length || o.booking);
  // A chapter whose 3D space is also a room the hotel lets online offers it for booking.
  const bookable = (space: string) => (space ? site.stays?.rooms.find((r) => r.space === space) : undefined);
  const hallIn = (space: string) => (space ? site.events?.halls.find((h) => h.space === space) : undefined);
  const { offers, reviews, faq } = site;
  const nav = [
    tour && ['#tour', '3D tour'],
    site.rooms.length && ['#spaces', 'Spaces'],
    offers.length && ['#offers', 'Offers'],
    site.gallery.length && ['#gallery', 'Gallery'],
    plan && ['#plan', 'Floor plan'],
    menu && ['#menu', menu.title || 'Menu'],
    site.stays && ['#stay', 'Book a room'],
    site.events && ['#events', 'Events'],
    site.booking && ['#reserve', 'Book a table'],
    ...dining.map((o) => [o.booking ? `#reserve-${o.id}` : `#menu-${o.id}`, o.name]),
    ['#contact', 'Contact']
  ].filter(Boolean) as [string, string][];
  const cta = site.stays ? ['#stay', 'Book a room'] : site.events ? ['#events', 'Plan an event'] : site.booking ? ['#reserve', 'Book a table'] : ['#contact', 'Enquire'];
  const hero = site.hero.image ? pic(site.hero.image) : null;
  // What search engines read: the place, and the FAQ as questions and answers.
  // The reviews stay out: Google ignores a business's own reviews of itself.
  const photos = [site.hero.image, ...site.gallery].filter(Boolean).slice(0, 3).map(asset);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': data.kind ?? 'LocalBusiness', name, description: site.hero.lede || info.about || undefined,
        telephone: info.phone || undefined, email: info.email || undefined, address: info.address || undefined,
        image: photos.length ? photos : undefined, logo: logo ?? undefined,
        sameAs: [info.website, info.instagram, info.facebook].filter(Boolean)
      },
      ...(faq.length ? [{
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
      }] : [])
    ]
  };

  return (
    <div className="ws" data-style={site.style ?? 'heritage'} style={style}>
      {!preview && (
        // \u003c: nothing a client typed can close the script tag
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      )}
      {preview && !review && (
        <p className="ws-preview" role="status">
          <b>Preview</b> of your saved draft. Visitors see it after you publish.
          {/* plain <a>: the studio wants a full page load */}
          <a href={`/studio/${encodeURIComponent(project.id)}/site`}>Back to the editor</a>
        </p>
      )}
      <header className="ws-top">
        <a className="ws-brand" href="#top">
          {logo && <Image src={logo} alt="" width={200} height={72} sizes="140px" className="ws-logo" />}
          <span>{name}</span>
        </a>
        <nav aria-label="Sections">
          {nav.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
        <a className="ws-btn ws-top-cta" href={cta[0]}>{cta[1]}</a>
      </header>

      <section id="top" className={`ws-hero${hero ? ' has-photo' : ''}`}>
        {hero && <Image {...hero} alt="" sizes="100vw" preload className="ws-hero-img" />}
        <div className="ws-hero-in">
          {eyebrow && <p className="ws-eyebrow">{eyebrow}</p>}
          <h1>{site.hero.title || name}</h1>
          {site.hero.lede && <p className="ws-lede">{site.hero.lede}</p>}
          <div className="ws-hero-ctas">
            <a className="ws-btn" href={cta[0]}>{cta[1]}</a>
            {tour && <a className="ws-btn ws-btn-ghost" href="#tour">Walk through in 3D</a>}
          </div>
        </div>
      </section>

      {tour && tourSrc && (
        <section id="tour" className="ws-stage" aria-label="Live 3D tour">
          <p className="ws-kicker">Live 3D tour · {tour.title}</p>
          <SiteTour src={tourSrc} title={tour.title} />
          <p className="ws-caption">
            Drag to look around.{' '}
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
          <div>
            <p className="ws-kicker">Our story</p>
            <h2>{story.title}</h2>
            <span className="ws-orn" aria-hidden>◆</span>
          </div>
          <div>{paragraphs(story.body).map((p, i) => <p key={i}>{p}</p>)}</div>
        </section>
      )}

      {site.rooms.length > 0 && (
        <section id="spaces" className="ws-rooms">
          <Head kicker={`Inside ${name}`} title="The spaces" />
          {site.rooms.map((r, i) => (
            <article key={i} className="ws-room ws-reveal">
              {r.image
                ? <div className="ws-room-img"><Image {...pic(r.image)} alt={r.title} sizes="(max-width: 760px) 100vw, 58vw" /></div>
                : <div className="ws-room-img ws-room-ph" aria-hidden />}
              <div className="ws-room-txt">
                <p className="ws-num">{ROMAN[i] ?? i + 1}</p>
                <h3>{r.title}</h3>
                {paragraphs(r.body).map((p, j) => <p key={j}>{p}</p>)}
                {r.features && (
                  <ul className="ws-features">
                    {r.features.split(/\s*[·,]\s*/).filter(Boolean).map((f) => <li key={f}>{f}</li>)}
                  </ul>
                )}
                {tour && r.space && <ViewIn3D space={r.space} view={r.view} />}
                {bookable(r.space) && <BookThisRoom room={bookable(r.space)!.id} />}
                {hallIn(r.space) && <BookThisHall hall={hallIn(r.space)!.id} />}
              </div>
            </article>
          ))}
        </section>
      )}

      {offers.length > 0 && (
        <section id="offers" className="ws-offers">
          <Head kicker="Special offers" title="Offers and packages" />
          <div className="ws-offer-grid">
            {offers.map((o, i) => (
              <article key={i} className="ws-offer ws-reveal">
                {o.image && <div className="ws-offer-img"><Image {...pic(o.image)} alt="" sizes="(max-width: 760px) 100vw, 420px" /></div>}
                <div className="ws-offer-txt">
                  <h3>{o.title}</h3>
                  {o.body && <p>{o.body}</p>}
                  {o.price && <p className="ws-offer-price">{o.price}</p>}
                  <AskAbout offer={o.title} preview={preview} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {site.gallery.length > 0 && (
        <section id="gallery" className="ws-gallery-wrap ws-reveal">
          <Head kicker="Photos" title="Gallery" />
          <SiteGallery photos={site.gallery.map(pic)} name={name} />
        </section>
      )}

      {reviews.items.length > 0 && (
        <section id="reviews" className="ws-reviews ws-reveal">
          <Head kicker="Guests say" title="In their words" />
          <div className="ws-quotes">
            {reviews.items.map((r, i) => (
              <figure key={i}>
                <blockquote>{r.quote}</blockquote>
                {(r.name || r.from) && <figcaption>{r.name && <b>{r.name}</b>}{r.from && <span>{r.from}</span>}</figcaption>}
              </figure>
            ))}
          </div>
          {reviews.link && (
            <p className="ws-caption"><a href={reviews.link} target="_blank" rel="noopener noreferrer">Read more reviews ↗</a></p>
          )}
        </section>
      )}

      {plan && (
        <section id="plan" className="ws-plan ws-reveal">
          <Head kicker={tour?.title} title="Floor plan" />
          {/* eslint-disable-next-line @next/next/no-img-element -- the space's plan: drawn from its scan (SVG) or uploaded */}
          <img src={asset(plan)} alt={`Floor plan of ${tour?.title ?? name}`} loading="lazy" />
        </section>
      )}

      {menu && <MenuSection id="menu" kicker={site.booking?.name || 'Taste'} menu={menu} />}

      {site.stays && (
        <section id="stay" className="ws-book">
          <Head kicker="Stay with us" title="Book a room" />
          <p className="ws-dim">Choose your dates and how many of you, then pick your room.</p>
          <RoomBooking project={project.id} stays={site.stays} tour={!!tour} preview={preview} />
        </section>
      )}

      {site.events && (
        <section id="events" className="ws-book">
          <Head kicker="Celebrate with us" title="Weddings and events" />
          <p className="ws-dim">Pick a hall, the day and how many guests. We&apos;ll come back to you about everything else.</p>
          <EventBooking project={project.id} events={site.events} tour={!!tour} preview={preview} />
        </section>
      )}

      {site.booking && (
        <ReserveSection id="reserve" kicker={site.booking.name || 'Dine with us'} project={project.id} booking={site.booking}
          tourSpace={tour?.space ?? null} preview={preview} />
      )}

      {dining.map((o) => (
        <Fragment key={o.id}>
          {o.menu.items.length > 0 && <MenuSection id={`menu-${o.id}`} kicker={o.name} menu={o.menu} />}
          {o.booking && (
            <ReserveSection id={`reserve-${o.id}`} kicker={o.name} project={project.id} booking={o.booking}
              tourSpace={tour?.space ?? null} preview={preview} />
          )}
        </Fragment>
      ))}

      {faq.length > 0 && (
        <section id="faq" className="ws-faq ws-reveal">
          <Head kicker="Good to know" title="Questions guests ask" />
          <div className="ws-faq-list">
            {faq.map((f, i) => (
              <details key={i}>
                <summary>{f.q}</summary>
                {paragraphs(f.a).map((x, j) => <p key={j}>{x}</p>)}
              </details>
            ))}
          </div>
        </section>
      )}

      <section id="contact" className={`ws-contact ws-reveal${info.address ? ' has-map' : ''}`}>
        <div className="ws-contact-txt">
          <p className="ws-kicker">Get in touch</p>
          <h2>{site.contact.title || `Visit ${name}`}</h2>
          <span className="ws-orn" aria-hidden>◆</span>
          {site.contact.body && <p className="ws-dim">{site.contact.body}</p>}
          <SiteEnquire project={project.id} name={name} preview={preview} whatsapp={info.whatsapp} />
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
        </div>
        {info.address && (
          <iframe className="ws-map" title={`Map: ${info.address}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.google.com/maps?q=${encodeURIComponent(info.address)}&z=15&output=embed`} />
        )}
      </section>

      <footer className="ws-foot">
        <div className="ws-foot-brand">
          <b>{name}</b>
          {info.tagline && <span>{info.tagline}</span>}
          {info.address && <span>{info.address}</span>}
        </div>
        {social.length > 0 && (
          <nav aria-label="Social">
            {social.map((s) => <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer">{s.text}</a>)}
          </nav>
        )}
        <div className="ws-foot-small">
          <span>© {new Date().getFullYear()} {name}</span>
          <span>3D tour by <Link href="/">RCAAS.tech</Link></span>
        </div>
      </footer>

      {info.whatsapp && !preview && (
        <a className="ws-wa" href={whatsappHref(info.whatsapp, 'Hi! I found you on your website.')}
          target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">
          <WhatsAppIcon />
        </a>
      )}
      <SiteReveal />
    </div>
  );
}
