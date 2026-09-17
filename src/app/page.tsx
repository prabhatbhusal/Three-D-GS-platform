import type { Metadata } from 'next';
import Link from 'next/link';
import { SplatField } from '../components/SplatField';
import { SiteNav } from '../components/SiteNav';
import '../components/site.css';

export const metadata: Metadata = {
  title: 'Interactive 3D tours that bring in enquiries',
  description:
    'threedview.services publishes LiDAR-captured Gaussian splat tours that stream to any phone and let visitors enquire without leaving the space.'
};

const STEPS = [
  {
    title: 'Capture',
    body: 'Walk the space with a handheld Lixel Kitty K1. SLAM LiDAR records geometry and colour in a single pass.'
  },
  {
    title: 'Process',
    body: 'Lixel Studio turns the scan into a tiled Gaussian splat with a streaming index, at full fidelity.'
  },
  {
    title: 'Publish',
    body: 'Upload it to the studio, set the start view, add hotspots and a flythrough, then share the tour.'
  }
];

const FEATURES = [
  {
    kind: 'stream',
    title: 'Streams what the camera sees',
    body: 'Tiles arrive over byte-range requests as you move, so a whole-campus scan opens as fast as a single room.',
    wide: true
  },
  {
    kind: 'lead',
    title: 'Enquiries without leaving the room',
    body: 'A persistent enquiry button opens a form over the live scene. The visitor never loses their place.'
  },
  {
    kind: 'fly',
    title: 'Guided flythroughs, rendered live',
    body: 'Cinematic passes play in real time, stay sharp at any resolution, and hand control back the moment someone moves.'
  },
  {
    kind: 'phone',
    title: 'Made for ordinary phones',
    body: 'Runs on WebGL2 in the browser. No app to install, and quality adapts to the device it lands on.'
  },
  {
    kind: 'studio',
    title: 'A studio built for the team',
    body: 'Drop in an export folder or a zip, place hotspots, author camera tracks and rename spaces from one screen.'
  }
];

export default function HomePage() {
  return (
    <main className="site">
      <SiteNav />

      <section className="hero">
        <div className="hero-copy">
          <p className="hero-kicker"><span className="dot" aria-hidden /> Gaussian splat tours by GeoNova</p>
          <h1 className="hero-title">
            Spaces that <em>sell</em> themselves.
          </h1>
          <p className="hero-sub">
            Publish LiDAR captures of hotels, halls and homes as live 3D tours that open on any
            phone and turn visitors into enquiries while they are still looking around.
          </p>
          <div className="hero-cta">
            <Link href="/login?mode=signup" className="site-btn site-btn-primary site-btn-lg">Start creating</Link>
            <Link href="/gallery" className="site-btn site-btn-ghost site-btn-lg">Browse the gallery</Link>
          </div>
        </div>

        <div className="hero-visual">
          <div className="splat-frame">
            <SplatField className="splat-canvas" />
            <span className="splat-chip splat-chip-l">Gaussian splat</span>
            <span className="splat-chip splat-chip-r"><span className="dot" aria-hidden />LiDAR scan</span>
          </div>
        </div>
      </section>

      <section className="proof" aria-label="At a glance">
        <div><strong>No app</strong><span>Opens in the browser</span></div>
        <div><strong>No video</strong><span>Rendered live, sharp at any size</span></div>
        <div><strong>No cap</strong><span>On how big a scan can be</span></div>
      </section>

      <section id="how" className="band">
        <h2 className="band-title">From a walk-through to a <em>web page</em></h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className="band">
        <h2 className="band-title">Everything a tour needs to <em>convert</em></h2>
        <div className="bento">
          {FEATURES.map((f) => (
            <article key={f.kind} className={`tile tile-${f.kind}${f.wide ? ' tile-wide' : ''}`}>
              <span className="tile-ic" aria-hidden />
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="closer">
        <h2>Ready to put a space <em>online</em>?</h2>
        <p>Create a studio account with your team access code and upload your first capture.</p>
        <Link href="/login?mode=signup" className="site-btn site-btn-primary site-btn-lg">Create your account</Link>
      </section>

      <footer className="site-foot">
        <span>threedview.services</span>
        <span className="site-foot-dim">A GeoNova and I.STEM Lab product</span>
        <span className="site-foot-links">
          <Link href="/gallery">Gallery</Link>
          <Link href="/login">Sign in</Link>
        </span>
      </footer>
    </main>
  );
}
