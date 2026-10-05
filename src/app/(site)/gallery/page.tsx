import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { SitePage } from '../../../features/marketing/layout/SitePage';
import { PageHead } from '../../../components/ui/PageHead';
import { Icon } from '../../../components/ui/Icon';
import { API_BASE_URL, withoutNightVersions, type GalleryItem } from '../../../lib/api';

export const metadata: Metadata = {
  alternates: { canonical: '/gallery' },
  title: 'Live tours',
  description: 'Published interactive 3D tours of hotels, halls and spaces. Open one and walk it.'
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

/** Live tours (the URL stays /gallery): every published space, rendered per
 *  request so a publish shows up at once. Styles: inner.css .ip-tours. */
export default async function GalleryPage() {
  await connection();
  const items = await published();

  return (
    <SitePage>
      <PageHead label="live tours" facts={items?.length ? [`${items.length} spaces open now`, 'No app, no plugin'] : undefined}
        lede="Every space here is a live Gaussian-splat tour, published from our studio. Pick one and walk in.">
        Rooms you can walk into right now.
      </PageHead>

      <section className="ip-sec" aria-label="Published tours">
        {items === null && (
          <p className="ip-empty">The tours can&apos;t reach the tour server right now. Try again in a moment.</p>
        )}
        {items?.length === 0 && (
          <p className="ip-empty">
            {/* plain <a>: the studio needs a full page load (§12) */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            Nothing is published yet. Open a space in the <a href="/studio">studio</a> and choose Publish.
          </p>
        )}
        {!!items?.length && (
          <ul className="ip-tours">
            {items.map((g) => (
              <li key={g.id} data-reveal>
                <Link href={`/tour?space=${encodeURIComponent(g.id)}`} className="ip-tour" data-cursor="link">
                  <span className="ip-tour-pic">
                    {g.thumb
                      // Pictures from the API, not this site: next/image isn't set up for them.
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`${API_BASE_URL}${g.thumb}`} alt="" loading="lazy" />
                      : <span className="ip-tour-ph" aria-hidden>{g.title.trim()[0]}</span>}
                    <span className="ip-tour-go"><Icon name="walk" />Walk in</span>
                  </span>
                  <span className="ip-tour-t">{g.title}</span>
                  {g.tagline && <span className="ip-tour-tag">{g.tagline}</span>}
                  <span className="ip-tour-meta">
                    {g.trackCount} {g.trackCount === 1 ? 'guided view' : 'guided views'}, published {dateFmt.format(new Date(g.publishedAt))}
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
