import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { FlyThrough, FrameScrub, ImageTabs, MediaFill } from '../../components/SiteMotion';
import { CurtainLink } from '../../components/Curtain';
import { SitePage } from '../../components/SitePage';
import { frames, media } from '../../lib/media';
import { MODES, SECTORS, SPECS, STEPS, WINS } from '../../lib/siteContent';

export const metadata: Metadata = {
  title: { absolute: 'RCAAS.tech — Reality Capture As A Service' },
  description:
    'RCAAS.tech scans hotels, colleges, heritage sites and infrastructure with handheld LiDAR and publishes them as live 3D tours that open on any phone. By GeoNova Solutions, Kathmandu.'
};

// The pinned scene, one screen of scroll each: a flight through the tour's
// photos (or footage, if sequence/ has any).
const SCAN = [
  { t: 'Walk it once', b: 'A handheld LiDAR scanner records 200,000 points a second as we walk through.' },
  { t: 'Every surface, in colour', b: 'Processing turns the scan into a photographic Gaussian splat, at full fidelity.' },
  { t: 'Open it anywhere', b: 'One link. It streams to an ordinary phone, with no app and no plugin.' },
  { t: 'Ask without leaving', b: 'An enquiry form inside the room, so a visitor who is looking can ask.' }
];

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export default function HomePage() {
  const hero = media('hero');
  const bleed = media('bleed');
  const flight = frames('sequence');
  const tour = frames('tour');
  const scan = SCAN.map((c) => (
    <Fragment key={c.t}>
      <h2>{c.t}</h2>
      <p>{c.b}</p>
    </Fragment>
  ));

  return (
    <SitePage>
      <section className={hero ? 'lp-hero has-media' : 'lp-hero'} data-nav-dark={hero ? '' : undefined}>
        {hero && <div className="lp-hero-media" aria-hidden><MediaFill m={hero} /></div>}
        <p className="lp-eyebrow">By GeoNova Solutions, Kathmandu</p>
        <h1>
          <span className="lp-hero-word">RCAAS</span>
          <span className="lp-hero-title">Reality Capture As A Service</span>
        </h1>
        <p className="lp-lede">
          We walk your space once. Your visitors walk it for years: on any phone, in 3D,
          and they enquire without ever leaving the room.
        </p>
        <div className="lp-cta">
          <Link href="/contact" transitionTypes={['nav-forward']} className="lp-pill lp-pill-solid">Book a capture</Link>
          {/* straight into a tour, behind a curtain (the newest published space) */}
          <CurtainLink href="/tour" className="lp-pill">
            Walk a live tour
            <svg className="lp-pill-ic" viewBox="0 0 24 24" aria-hidden><path d="M8 5.5v13l10.5-6.5z" /></svg>
          </CurtainLink>
        </div>
      </section>

      {flight.length > 1
        ? <FrameScrub frames={flight} label="How a scan becomes a tour" captions={scan} />
        : tour.length > 1 && <FlyThrough images={tour} label="How a scan becomes a tour" captions={scan} />}

      <section className="lp-band">
        <header className="lp-head">
          <h2>Why <em>RCAAS</em>?</h2>
          <p>A photo album shows a room. A tour lets a guest walk into it, and ask about it while they are there.</p>
        </header>
        <div className="lp-wins">
          {WINS.map((w) => (
            <div key={w.from} className="lp-win">
              <h3>{w.from}<Arrow />{w.to}</h3>
              <p>{w.b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-band">
        <header className="lp-head">
          <h2>Proven on real jobs</h2>
          <p>Measured on site in Kathmandu and Lalitpur, not quoted from a brochure.</p>
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

      {tour.length > 0 && (
        <section className="lp-band">
          <header className="lp-head">
            <h2>One capture, <em>four ways</em> in</h2>
            <p>Visitors choose how they move. Every picture here is from a live tour of a college computer lab.</p>
          </header>
          <ImageTabs
            alt="A college computer lab, seen in its live 3D tour"
            items={MODES.map((m, i) => ({ label: m.t, body: m.b, image: tour[i % tour.length] }))}
          />
          <p className="lp-more">
            <Link href="/gallery" transitionTypes={['nav-forward']} className="lp-pill">Open the gallery</Link>
          </p>
        </section>
      )}

      <section className="lp-band">
        <header className="lp-head">
          <h2>Four steps to a live tour</h2>
          <p>Days, not months, from the first walk-through to a link on your website.</p>
        </header>
        <ol className="lp-four">
          {STEPS.map((s, i) => (
            <li key={s.t}>
              <span className="lp-four-n" aria-hidden>{i + 1}</span>
              <h3>{s.t}</h3>
              <p>{s.b}</p>
            </li>
          ))}
        </ol>
        <p className="lp-more">
          <Link href="/how-it-works" transitionTypes={['nav-forward']} className="lp-pill">How it works</Link>
        </p>
      </section>

      {bleed && (
        <section className="lp-bleed" data-nav-dark>
          <div className="lp-bleed-media" aria-hidden><MediaFill m={bleed} lazy /></div>
          <div className="lp-bleed-body">
            <h2>We don&apos;t sell you a 3D model. We sell you <em>enquiries</em>.</h2>
            <p>Every tour carries an enquiry form inside the room, so a visitor who is already looking can ask without leaving.</p>
            <Link href="/contact" transitionTypes={['nav-forward']} className="lp-pill">Book a capture</Link>
          </div>
        </section>
      )}

      <section className="lp-band">
        <header className="lp-head">
          <h2>Who it&apos;s for</h2>
          <p>Anywhere a visitor decides by looking around first.</p>
        </header>
        <ul className="lp-sectors">
          {SECTORS.map((s) => <li key={s.t}><b>{s.t}</b><span>{s.b}</span></li>)}
        </ul>
      </section>
    </SitePage>
  );
}
