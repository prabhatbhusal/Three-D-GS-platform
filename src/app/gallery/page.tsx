import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { SiteNav } from '../../components/SiteNav';
import { API_BASE_URL, type GalleryItem } from '../../lib/api';
import '../../components/site.css';

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Published interactive 3D tours of hotels, halls and spaces.'
};

// GitHub Pages (next.config.ts, NEXT_OUTPUT_EXPORT) ships no Node host, so
// there is never a live API to poll — the same "unreachable" state this page
// already renders for a stopped API, just captured once at build time instead
// of per request. `cache: 'no-store'` and `connection()` both force per-request
// dynamic rendering, which `output: 'export'` cannot do at all (static export
// requires every route to finish at build time) — so neither is safe to use
// unconditionally.
const isStaticExport = !!process.env.NEXT_OUTPUT_EXPORT;

async function published(): Promise<GalleryItem[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/gallery`, { cache: isStaticExport ? 'force-cache' : 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const dateFmt = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

/** Every published space. Rendered per request so a publish shows up at once
 *  — except in the static export build, which has no "per request" to render
 *  on and prerenders this once instead (see isStaticExport above). */
export default async function GalleryPage() {
  if (!isStaticExport) await connection();
  const items = await published();

  return (
    <main className="site">
      <SiteNav />

      <section className="band gallery-head">
        <h1 className="band-title">Step inside a <em>published</em> space</h1>
        <p className="gallery-sub">Live Gaussian splat tours, published from the studio. Open one to walk it.</p>
      </section>

      <section className="band gallery-band">
        {items === null && (
          <p className="gallery-empty">The gallery can&apos;t reach the tour server right now. Try again in a moment.</p>
        )}
        {items?.length === 0 && (
          <p className="gallery-empty">
            Nothing is published yet. Open a space in the <Link href="/studio">studio</Link> and choose Publish.
          </p>
        )}
        {!!items?.length && (
          <ul className="gallery-grid">
            {items.map((g) => (
              <li key={g.id}>
                <Link href={`/tour?space=${encodeURIComponent(g.id)}`} className="gallery-card">
                  <span className="gallery-thumb">
                    {g.thumb
                      // Data-URL thumbnails from the studio; next/image can't optimise those.
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={g.thumb} alt="" />
                      : <span className="gallery-ph" aria-hidden>{g.title.trim()[0]}</span>}
                    <span className="gallery-open">Open tour</span>
                  </span>
                  <span className="gallery-meta">
                    <span className="gallery-title">{g.title}</span>
                    {g.tagline && <span className="gallery-tag">{g.tagline}</span>}
                    <span className="gallery-facts">
                      <span>{g.trackCount} {g.trackCount === 1 ? 'guided view' : 'guided views'}</span>
                      <span>Published {dateFmt.format(new Date(g.publishedAt))}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="site-foot">
        <span>threedview.services</span>
        <span className="site-foot-dim">A GeoNova and I.STEM Lab product</span>
        <span className="site-foot-links">
          <Link href="/">Home</Link>
          <Link href="/login">Sign in</Link>
        </span>
      </footer>
    </main>
  );
}
