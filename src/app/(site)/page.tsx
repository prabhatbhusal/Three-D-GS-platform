import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { FrameScrub, MediaFill } from '../../components/SiteMotion';
import { SitePage } from '../../components/SitePage';
import { frames, media } from '../../lib/media';
import { SECTORS, SERVICES, SPECS, WINS, WORK } from '../../lib/siteContent';

export const metadata: Metadata = {
  title: { absolute: 'RCAAS.tech — Reality Capture As A Service' },
  description:
    'RCAAS.tech scans hotels, colleges, heritage sites and infrastructure with handheld LiDAR and publishes them as live 3D tours that open on any phone. By GeoNova Solutions, Kathmandu.'
};

const EXPLORE = [
  { href: '/work', k: `${WORK.length} projects`, t: 'Places we have captured', b: 'A stupa, an overpass, two colleges and the boutique hotel we are scanning now.' },
  { href: '/services', k: `${SERVICES.length} services`, t: 'One walk, every deliverable', b: 'Tours that take enquiries, point clouds, drawings and heritage records.' },
  { href: '/how-it-works', k: '4 steps', t: 'From a walk-through to your website', b: 'Capture, process, author, publish. Days, not months.' },
  { href: '/about', k: 'GeoNova Solutions', t: 'Built by surveyors, for sales', b: 'A Kathmandu geospatial team and authorised XGRIDS partner.' }
];

const WORD = 'RCAAS';

// Captions for the pinned Chilancho fly-through (public/media/sequence/),
// one screen of scroll each. Figures from the case study (siteContent WORK).
const FLIGHT = [
  { n: '01', t: 'Chilancho Stupa', b: 'One of Kirtipur’s oldest Buddhist monuments, walked once with a handheld scanner: 51 minutes on site.' },
  { n: '02', t: '35.8 million points', b: 'Every brick, chaitya and pinnacle at 1 cm accuracy: the record conservators and engineers work from.' },
  { n: '03', t: 'One walk, two worlds', b: 'The same capture is a photographic tour for visitors and a measured point cloud for the archive.' }
];

export default function HomePage() {
  const hero = media('hero');
  const flight = frames('sequence');
  const shots = WORK.flatMap((w) => {
    const m = media(`work/${w.slug}`);
    return m ? [{ w, m }] : [];
  });

  return (
    <SitePage>
      {/* The name rises letter by letter and a scan line passes over it once,
       *  over the hero footage when there is some (public/media/hero.*). */}
      <section className={hero ? 'lp-hero has-media' : 'lp-hero'}>
        {hero
          ? <div className="lp-hero-media" aria-hidden><MediaFill m={hero} /></div>
          : <div className="lp-hero-bg" aria-hidden><span /><span /><span /></div>}
        <p className="lp-eyebrow"><span className="lp-rec" aria-hidden /> By GeoNova Solutions, Kathmandu</p>
        <h1 className="lp-word" aria-label={WORD}>
          {WORD.split('').map((c, i) => (
            <span key={i} style={{ '--i': i } as React.CSSProperties} aria-hidden>{c}</span>
          ))}
        </h1>
        <p className="lp-expand" aria-label="Reality Capture As A Service">
          <b>R</b>eality <b>C</b>apture <b>A</b>s <b>A</b> <b>S</b>ervice
        </p>
        <p className="lp-lede">
          We walk your space once. Your visitors walk it for years: on any phone, in 3D,
          and they enquire without ever leaving the room.
        </p>
        <div className="lp-cta">
          <Link href="/contact" transitionTypes={['nav-forward']} className="lp-pill lp-pill-solid">Book a capture</Link>
          <Link href="/gallery" transitionTypes={['nav-forward']} className="lp-pill">Walk a live tour</Link>
        </div>
      </section>

      {flight.length > 1 && (
        <FrameScrub
          frames={flight}
          label="Chilancho Stupa, captured by GeoNova"
          captions={FLIGHT.map((c) => (
            <Fragment key={c.n}>
              <span className="lp-scrub-n">{c.n}</span>
              <h2>{c.t}</h2>
              <p>{c.b}</p>
            </Fragment>
          ))}
        />
      )}

      <div className="lp-marquee" aria-label="Sectors we capture">
        <div className="lp-marquee-track">
          {[...SECTORS, ...SECTORS].map((s, i) => (
            <span key={i} aria-hidden={i >= SECTORS.length}>{s}</span>
          ))}
        </div>
      </div>

      <section className="lp-wins" aria-label="Why RCAAS">
        {WINS.map((w) => (
          <div key={w.t} className="lp-win"><h3>{w.t}</h3><p>{w.b}</p></div>
        ))}
      </section>

      <section className="lp-band">
        <header className="lp-head lp-head-center">
          <p className="lp-label">From the field</p>
          <h2>Numbers that <em>deliver</em> on the promise</h2>
          <p>Measured on real jobs in Kathmandu and Lalitpur, not quoted from a brochure.</p>
        </header>
        <div className="lp-specs">
          {SPECS.map((s) => (
            <div key={s.k} className="lp-spec">
              <svg className="lp-spec-ic" viewBox="0 0 24 24" aria-hidden><path d={s.ic} /></svg>
              <strong>{s.n}</strong>
              <span>{s.k}</span>
            </div>
          ))}
        </div>
      </section>

      {shots.length >= 3 && (
        <section className="lp-band lp-collage-band">
          <header className="lp-head lp-head-center">
            <p className="lp-label">Field log</p>
            <h2>Places we have <em>walked</em></h2>
          </header>
          <Link href="/work" transitionTypes={['nav-forward']} className="lp-collage" aria-label="See all our work">
            {shots.slice(0, 5).map(({ w, m }, i) => (
              <figure key={w.slug} className={`lp-collage-card lp-collage-${i}`}>
                <MediaFill m={m} lazy />
                <figcaption>{w.place}</figcaption>
              </figure>
            ))}
          </Link>
        </section>
      )}

      <section className="lp-band">
        <header className="lp-head">
          <p className="lp-label">Explore</p>
          <h2>Everything else, <em>one page</em> each</h2>
        </header>
        <nav className="lp-explore" aria-label="More about RCAAS">
          {EXPLORE.map((e) => (
            <Link key={e.href} href={e.href} transitionTypes={['nav-forward']} className="lp-go">
              <span className="lp-go-k">{e.k}</span>
              <h3>{e.t}</h3>
              <p>{e.b}</p>
              <svg className="lp-go-ic" viewBox="0 0 24 24" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          ))}
        </nav>
      </section>
    </SitePage>
  );
}
