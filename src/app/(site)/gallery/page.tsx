import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { SitePage } from '../../../components/SitePage';
import { API_BASE_URL, withoutNightVersions, type GalleryItem } from '../../../lib/api';

export const metadata: Metadata = {
  alternates: { canonical: '/gallery' },
  title: 'Gallery',
  description: 'Published interactive 3D tours of hotels, halls and spaces.'
};

async function published(): Promise<GalleryItem[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/gallery`, { cache: 'no-store' });
    return res.ok ? withoutNightVersions(await res.json()) : null;
  } catch {
    return null;
  }
}

const dateFmt = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

/** Every published space. Rendered per request so a publish shows up at once. */
export default async function GalleryPage() {
  await connection();
  const items = await published();

  return (
    <SitePage>
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
            {/* plain <a>: the studio needs a full page load (§12) */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            Nothing is published yet. Open a space in the <a href="/studio">studio</a> and choose Publish.
          </p>
        )}
        {!!items?.length && (
          <ul className="gallery-grid">
            {items.map((g) => (
              <li key={g.id}>
                <Link href={`/tour?space=${encodeURIComponent(g.id)}`} className="gallery-card">
                  <span className="gallery-thumb">
                    {g.thumb
                      // Pictures from the API, not this site: next/image isn't set up for them.
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`${API_BASE_URL}${g.thumb}`} alt="" loading="lazy" />
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
    </SitePage>
  );
}
