import Image from 'next/image';
import Link from 'next/link';
import { Fragment } from 'react';
import { API_BASE_URL, photoSize, whatsappHref, type PublicSite, type SiteBooking, type SiteMenu } from '../../lib/api';
import { fontFamily } from '../../lib/brandFonts';
import { inkOn } from '../../lib/brandColor';
import { AskAbout, BookThisHall, BookThisRoom, SiteEnquire, SiteGallery, SiteMap, SiteReveal, SiteTour, ViewIn3D } from './SiteParts';
import { SiteNav } from './SiteNav';
import { SmoothScroll } from '../marketing/layout/SmoothScroll';
import { ChapterRail } from '../marketing/layout/ChapterRail';
import { TableBooking } from '../booking/TableBooking';
import { RoomBooking } from '../booking/RoomBooking';
import { EventBooking } from '../booking/EventBooking';
import '../tour/viewer.css';
import './website.css';


const asset = (p: string) => `${API_BASE_URL}/api/assets/${p}`;
/** A site photo for next/image: its own size when the name carries it, else a 3:2 guess. */
const pic = (p: string) => {
  const [width, height] = photoSize(p) ?? [1600, 1067];
  return { src: asset(p), width, height };
};
const paragraphs = (t: string) => t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const two = (n: number) => String(n).padStart(2, '0');

/** A chapter's head (2026-10-06): its number and label in the margin, its
 *  title large beside them, on a hairline, after lightweight.info and
 *  linear.app; every look and brand wears it. */
function Head({ n, kicker, title, lead, id }: { n: number; kicker: string; title: string; lead?: string; id?: string }) {
  return (
    <header className="ws-head">
      <p className="ws-head-k"><span className="ws-head-n">{two(n)}</span>{kicker}</p>
      <div className="ws-head-t">
        <h2 id={id}>{title}</h2>
        {lead && <p className="ws-head-lead">{lead}</p>}
      </div>
    </header>
  );
}

/** A place's menu: names and prices with a leader between, in two columns when long. */
function MenuList({ menu }: { menu: SiteMenu }) {
  return (
    <ul className={`ws-menu-list${menu.items.length > 5 ? ' is-long' : ''}`}>
      {menu.items.map((m, i) => (
        <li key={i}>
          <div className="ws-menu-row"><b>{m.name}</b><span aria-hidden /><em>{m.price}</em></div>
          {(m.desc || m.tag) && <p>{m.desc}{m.tag && <span className="ws-tag">{m.tag}</span>}</p>}
        </li>
      ))}
    </ul>
  );
}

/** A place to eat: its menu and its table booking, as one chapter (#menu, #reserve; another place's #menu-<id>, #reserve-<id>). */
function DineSection({ n, idSuffix, name, menu, booking, project, tourSpace, preview }: {
  n: number; idSuffix: string; name: string; menu: SiteMenu | null; booking: SiteBooking | null; project: string; tourSpace: string | null; preview: boolean;
}) {
  return (
    <section id={`menu${idSuffix}`} className="ws-chap ws-dine" data-chapter={name}>
      <Head n={n} kicker="Eat and drink" title={name} lead={menu?.note || undefined} />
      {menu && <div className="ws-reveal"><MenuList menu={menu} /></div>}
      {booking && (
        <div id={`reserve${idSuffix}`} className="ws-dine-book">
          <h3 className="ws-sub">Book a table</h3>
          <p className="ws-dim">Choose the day, how many of you and the time, then pick your table on the floor plan.</p>
          <TableBooking project={project} booking={booking} tourSpace={tourSpace} preview={preview} />
        </div>
      )}
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
 * (2026-10-06) Laid out as numbered chapters: the photo opening with the
 * facts along its foot, the live tour in a window, then the story, the
 * spaces, the plan, stay, eat, events, offers, photos, reviews, questions
 * and contact, each only when it has something in it. A rail down the left
 * (ChapterRail) and the nav's menu card (SiteNav) list the same chapters.
 * Its look (`site.style`: heritage, modern, night) and the brand's accent,
 * font and logo make each client's site its own. Styles: website.css.
 */
export function SiteView({ data, preview = false, review = false }: {
  data: PublicSite; preview?: boolean;
  /** The client's review link (/s/<project>/review): a draft, without the studio's banner. */
  review?: boolean;
}) {
  const { project, site, tour, plan } = data;
  const { info, name, reach, logo, style, asks, cta, navReach } = siteBasics(data);
  const spaces = data.spaces ?? [];
  const home = `/s/${encodeURIComponent(project.id)}`;
  // The brand's own words fill in what the site leaves empty.
  const eyebrow = site.hero.eyebrow || info.tagline || '';
  const story = site.story.title || site.story.body ? site.story : info.about ? { title: `About ${name}`, body: info.about } : null;
  const tourSrc = tour ? `/tour?space=${encodeURIComponent(tour.space)}&embed=1&mono=1&key=${encodeURIComponent(tour.key)}` : null;
  const menu = site.menu.items.length ? site.menu : null;
  // More places to eat and drink, each with a menu or a table booking to show
  const dining = (site.dining ?? []).filter((o) => o.menu.items.length || o.booking);
  // A chapter whose 3D space is also a room the hotel lets online offers it for booking.
  const bookable = (space: string) => (space ? site.stays?.rooms.find((r) => r.space === space) : undefined);
  const hallIn = (space: string) => (space ? site.events?.halls.find((h) => h.space === space) : undefined);
  const { offers, reviews, faq } = site;
  const hero = site.hero.image ? pic(site.hero.image) : null;
  const dineName = site.booking?.name || menu?.title || 'Eat and drink';
  // Highlights: what the place sells, each a picture and a jump to its chapter
  const photoOf = (...c: (string | undefined)[]) => c.find(Boolean) || '';
  const highlights = ([
    (site.stays || site.rooms.length) && ['#' + (site.stays ? 'stay' : 'spaces'), 'Rooms', photoOf(site.stays?.rooms.find((r) => r.image)?.image, site.rooms[0]?.image, site.gallery[0])],
    site.events && ['#events', 'Events', photoOf(site.events.halls.find((h) => h.image)?.image, site.rooms[1]?.image, site.gallery[1])],
    (menu || site.booking || dining.length) && ['#menu', 'Dining', photoOf(site.gallery[2], site.rooms[2]?.image, site.gallery[0])]
  ].filter(Boolean) as [string, string, string][]).filter(([, , img]) => img); // a highlight is its picture: none, no card

  // The chapters, in page order: numbered here, listed by the rail and the phone's menu.
  const chapters = ([
    tour && ['tour', '3D tour'],
    story && ['story', 'Our story'],
    site.rooms.length && ['spaces', 'The spaces'],
    plan && ['plan', 'Floor plan'],
    site.stays && ['stay', 'Stay'],
    (menu || site.booking) && ['menu', dineName],
    ...dining.map((o) => [`menu-${o.id}`, o.name]),
    site.events && ['events', 'Events'],
    offers.length && ['offers', 'Offers'],
    reviews.items.length && ['reviews', 'Guests say'],
    faq.length && ['faq', 'Good to know'],
    site.gallery.length && ['gallery', 'Photos'],
    ['contact', 'Contact']
  ].filter(Boolean) as [string, string][]);
  const num = (id: string) => chapters.findIndex(([c]) => c === id) + 1;
  // The top bar: the spaces, the photos, contact (and Book now beside them)
  const top = ([
    tour && ['#tour', 'Spaces'],
    site.gallery.length && ['#gallery', 'Gallery'],
    ['#contact', 'Contact']
  ].filter(Boolean) as [string, string][]);

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
      {/* before the first paint: cover the page for the opening curtain (SiteReveal), first visit only */}
      <script dangerouslySetInnerHTML={{ __html: "try{if(!sessionStorage.getItem('ws-intro')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.dataset.wsIntro='1'}catch(e){}" }} />
      {!preview && (
        // <: nothing a client typed can close the script tag
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      )}
      {preview && !review && (
        <p className="ws-preview" role="status">
          <b>Preview</b> of your saved draft. Visitors see it after you publish.
          {/* plain <a>: the studio wants a full page load */}
          <a href={`/studio/${encodeURIComponent(project.id)}/site`}>Back to the editor</a>
        </p>
      )}
      <SiteNav name={name} logo={logo} top={top} chapters={chapters} cta={cta} reach={navReach} />

      <section id="top" className={`ws-hero${hero ? ' has-photo' : ''}`}>
        {hero && <Image {...hero} alt="" sizes="100vw" preload className="ws-hero-img" />}
        {/* a scanner's registration targets at the corners: the place was measured */}
        {['tl', 'tr', 'bl', 'br'].map((c) => <span key={c} className={`ws-cross ws-cross-${c}`} aria-hidden />)}
        <div className="ws-hero-in">
          {eyebrow && <p className="ws-eyebrow">{eyebrow}</p>}
          <h1>{site.hero.title || name}</h1>
          {site.hero.lede && <p className="ws-lede">{site.hero.lede}</p>}
          <div className="ws-hero-ctas">
            {tour && <a className="ws-btn" href="#tour">Start 3D tour</a>}
            <a className={`ws-btn${tour ? ' ws-btn-ghost' : ''}`} href={cta[0]}>{cta[1]}</a>
          </div>
        </div>
        {site.facts.length > 0 && (
          <dl className="ws-facts">
            {site.facts.map((f, i) => <div key={i}><dd>{f.n}</dd><dt>{f.k}</dt></div>)}
          </dl>
        )}
      </section>

      {tour && tourSrc && (
        <section id="tour" className="ws-window" aria-label="Live 3D tour" data-chapter="3D tour">
          <div className="ws-window-bar">
            <span className="ws-live">Live 3D</span>
            <b>{tour.title}</b>
            {/* a plain <a>: the tour wants a full page load */}
            <a href={`/t/${encodeURIComponent(project.id)}/${encodeURIComponent(tour.space)}`}>Open full screen ↗</a>
          </div>
          <div className={`ws-window-grid${spaces.length > 1 ? ' has-list' : ''}`}>
            <SiteTour src={tourSrc} title={tour.title} />
            {spaces.length > 1 && (
              <nav className="ws-space-list" aria-label="Spaces">
                <ol>
                  {spaces.slice(0, 6).map((sp) => (
                    <li key={sp.id}><a href={`${home}/${encodeURIComponent(sp.id)}`}><span aria-hidden>›</span>{sp.title}</a></li>
                  ))}
                </ol>
                {site.rooms.length > 0 && <a className="ws-space-all" href="#spaces">View all →</a>}
              </nav>
            )}
          </div>
          <p className="ws-window-hint">Drag to look around. Keys 1 to 4 change how you move.</p>
        </section>
      )}

      {highlights.length > 0 && (
        <section className="ws-highlights ws-reveal" aria-label="Highlights">
          {highlights.map(([href, label, img]) => (
            <a key={label} href={href} className="ws-hl">
              {img ? <Image {...pic(img)} alt="" sizes="(max-width: 760px) 100vw, 33vw" /> : <span className="ws-hl-ph" aria-hidden />}
              <b>{label}</b>
            </a>
          ))}
        </section>
      )}

      {story && (
        <section id="story" className="ws-chap ws-story ws-reveal" data-chapter="Our story">
          <Head n={num('story')} kicker="Our story" title={story.title || `About ${name}`} />
          <div className="ws-story-body">{paragraphs(story.body).map((p, i) => <p key={i}>{p}</p>)}</div>
        </section>
      )}

      {site.rooms.length > 0 && (
        <section id="spaces" className="ws-chap ws-rooms ws-hscroll" data-chapter="The spaces">
          <Head n={num('spaces')} kicker={`Inside ${name}`} title="The spaces" />
          {/* scrolled sideways by the page (SiteReveal): a pinned track of cards turning in 3D */}
          <div className="ws-htrack">
          {site.rooms.map((r, i) => (
            <article key={i} className={`ws-room${r.image ? '' : ' is-plain'}`}>
              {r.image && <div className="ws-room-img"><Image {...pic(r.image)} alt={r.title} sizes="(max-width: 760px) 100vw, 58vw" /></div>}
              <div className="ws-room-txt">
                <p className="ws-num">{two(i + 1)}</p>
                <h3>{r.title}</h3>
                {paragraphs(r.body).map((p, j) => <p key={j}>{p}</p>)}
                {r.features && (
                  <ul className="ws-features">
                    {r.features.split(/\s*[·,]\s*/).filter(Boolean).map((f) => <li key={f}>{f}</li>)}
                  </ul>
                )}
                <div className="ws-links">
                  {tour && r.space && <ViewIn3D space={r.space} view={r.view} />}
                  {bookable(r.space) && <BookThisRoom room={bookable(r.space)!.id} />}
                  {hallIn(r.space) && <BookThisHall hall={hallIn(r.space)!.id} />}
                </div>
              </div>
            </article>
          ))}
          </div>
        </section>
      )}

      {plan && (
        <section id="plan" className="ws-chap ws-plan ws-reveal" data-chapter="Floor plan">
          <Head n={num('plan')} kicker={tour?.title ?? name} title="Floor plan" />
          <figure className="ws-plan-sheet">
            {/* eslint-disable-next-line @next/next/no-img-element -- the space's plan: drawn from its scan (SVG) or uploaded */}
            <img src={asset(plan)} alt={`Floor plan of ${tour?.title ?? name}`} loading="lazy" className={plan.endsWith('.svg') ? 'is-drawn' : undefined} />
          </figure>
        </section>
      )}

      {site.stays && (
        <section id="stay" className="ws-chap ws-book" data-chapter="Stay">
          <Head n={num('stay')} kicker="Stay with us" title="Book a room" lead={site.stays.note || 'Choose your dates and how many of you, then pick your room.'} />
          <RoomBooking project={project.id} stays={site.stays} tour={!!tour} preview={preview} />
        </section>
      )}

      {(menu || site.booking) && (
        <DineSection n={num('menu')} idSuffix="" name={dineName} menu={menu} booking={site.booking} project={project.id}
          tourSpace={tour?.space ?? null} preview={preview} />
      )}
      {dining.map((o) => (
        <Fragment key={o.id}>
          <DineSection n={num(`menu-${o.id}`)} idSuffix={`-${o.id}`} name={o.name} menu={o.menu.items.length ? o.menu : null}
            booking={o.booking} project={project.id} tourSpace={tour?.space ?? null} preview={preview} />
        </Fragment>
      ))}

      {site.events && (
        <section id="events" className="ws-chap ws-book" data-chapter="Events">
          <Head n={num('events')} kicker="Celebrate with us" title="Events and gatherings"
            lead={site.events.note || 'Pick a hall, the day and how many guests. We’ll come back to you about everything else.'} />
          <EventBooking project={project.id} events={site.events} tour={!!tour} preview={preview} />
        </section>
      )}

      {offers.length > 0 && (
        <section id="offers" className="ws-chap ws-offers" data-chapter="Offers">
          <Head n={num('offers')} kicker="Special offers" title="Offers and packages" />
          <div className="ws-offer-grid">
            {offers.map((o, i) => (
              <article key={i} className={`ws-offer ws-reveal${o.image ? '' : ' is-plain'}`}>
                {o.image && <div className="ws-offer-img"><Image {...pic(o.image)} alt="" sizes="(max-width: 760px) 100vw, 420px" /></div>}
                <div className="ws-offer-txt">
                  {o.price && <p className="ws-offer-price">{o.price}</p>}
                  <h3>{o.title}</h3>
                  {o.body && <p>{o.body}</p>}
                  {asks && <AskAbout offer={o.title} preview={preview} />}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {reviews.items.length > 0 && (
        <section id="reviews" className="ws-chap ws-reviews ws-reveal" data-chapter="Guests say">
          <Head n={num('reviews')} kicker="Guests say" title="In their words" />
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

      {faq.length > 0 && (
        <section id="faq" className="ws-chap ws-faq ws-reveal" data-chapter="Good to know">
          <Head n={num('faq')} kicker="Good to know" title="Questions guests ask" />
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

      {site.gallery.length > 0 && (
        <section id="gallery" className="ws-chap ws-gallery-wrap ws-reveal" data-chapter="Photos">
          <Head n={num('gallery')} kicker="Photos" title={`Around ${name}`} />
          <SiteGallery photos={site.gallery.map(pic)} name={name} />
        </section>
      )}

      {asks && (
        <section className="ws-strip ws-reveal" aria-label="Enquire">
          <p>{site.stays || site.events ? 'Planning a stay or event?' : `Questions for ${name}?`}</p>
          <a className="ws-btn" href="#contact">Send enquiry</a>
        </section>
      )}

      <section id="contact" className={`ws-contact ws-reveal${info.address ? ' has-map' : ''}`} data-chapter="Contact">
        <div className="ws-contact-txt">
          <p className="ws-head-k"><span className="ws-head-n">{two(num('contact'))}</span>Get in touch</p>
          <h2>{site.contact.title || `Visit ${name}`}</h2>
          {site.contact.body && <p className="ws-contact-lead">{site.contact.body}</p>}
          <SiteEnquire project={project.id} name={name} preview={preview} whatsapp={info.whatsapp} enquiries={asks} />
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
        {info.address && <SiteMap address={info.address} />}
      </section>

      <SiteFooter data={data} />

      {info.whatsapp && !preview && (
        <a className="ws-wa" href={whatsappHref(info.whatsapp, 'Hi! I found you on your website.')}
          target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">
          <WhatsAppIcon />
        </a>
      )}
      <ChapterRail root=".ws" />
      <SiteReveal />
      <SmoothScroll root=".ws" magnetic=".ws-btn, .wsn-ic, .ws-act" />
    </div>
  );
}

/** What every page of a client's site shares: its brand, how to reach it, its look, and the main button. */
export function siteBasics(data: PublicSite) {
  const { project, site } = data;
  const info = project.info ?? {};
  const name = project.theme.brand || project.title;
  const hello = 'Hi! I found you on your website.';
  const reach = [
    info.phone && { label: 'Phone', text: info.phone, href: `tel:${info.phone.replace(/[^\d+]/g, '')}` },
    info.whatsapp && { label: 'WhatsApp', text: `+${info.whatsapp}`, href: whatsappHref(info.whatsapp, hello) },
    info.email && { label: 'Email', text: info.email, href: `mailto:${info.email}` },
    info.address && { label: 'Address', text: info.address, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}` },
    info.website && { label: 'Website', text: info.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), href: info.website },
    info.instagram && { label: 'Instagram', text: 'Instagram', href: info.instagram },
    info.facebook && { label: 'Facebook', text: 'Facebook', href: info.facebook }
  ].filter(Boolean) as { label: string; text: string; href: string }[];
  const social = reach.filter((r) => r.label === 'Instagram' || r.label === 'Facebook');
  const logo = project.theme.logo ? asset(project.theme.logo) : null;
  const accent = project.theme.accent || '#9a7b4f';
  const style = {
    '--ws-accent': accent,
    '--ws-on-accent': inkOn(accent),
    '--ws-serif': fontFamily(project.theme.font)
  } as React.CSSProperties;
  // A project that takes no enquiries (its features) has no form: its contact details instead.
  const asks = project.features?.enquiries !== false;
  // The main button: booking when the place takes it online, else the enquiry
  const books = site.stays ? 'stay' : site.events ? 'events' : site.booking ? 'reserve' : '';
  const cta: [string, string] = books ? [`#${books}`, 'Book now'] : ['#contact', asks ? 'Enquire' : 'Contact'];
  const navReach = {
    call: info.phone ? `tel:${info.phone.replace(/[^\d+]/g, '')}` : undefined,
    whatsapp: info.whatsapp ? whatsappHref(info.whatsapp, hello) : undefined
  };
  return { info, name, reach, social, logo, style, asks, cta, navReach };
}

/** Every page's foot: the map, phone, WhatsApp and social links, the name across the width, who made the tour. */
export function SiteFooter({ data }: { data: PublicSite }) {
  const { info, name, reach } = siteBasics(data);
  const links = reach.filter((r) => ['Address', 'Phone', 'WhatsApp', 'Instagram', 'Facebook'].includes(r.label));
  return (
    <footer className="ws-foot">
      <div className="ws-foot-row">
        <div className="ws-foot-brand">
          {info.tagline && <span>{info.tagline}</span>}
          {info.address && <span>{info.address}</span>}
        </div>
        {links.length > 0 && (
          <nav aria-label="Reach us">
            {links.map((r) => (
              <a key={r.label} href={r.href} {...(/^https?:/.test(r.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {r.label === 'Address' ? 'Map' : r.label}
              </a>
            ))}
          </nav>
        )}
      </div>
      <p className="ws-foot-mark" aria-hidden style={{ '--len': name.length } as React.CSSProperties}>{name}</p>
      <div className="ws-foot-small">
        <span>© {new Date().getFullYear()} {name}</span>
        <span>Powered by <Link href="/">RCAAS.tech</Link></span>
      </div>
    </footer>
  );
}
