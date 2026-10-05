import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { SitePage } from '../../../features/marketing/layout/SitePage';
import { PageHead } from '../../../components/ui/PageHead';
import { Section } from '../../../components/ui/Section';
import { Icon } from '../../../components/ui/Icon';
import { API_BASE_URL, withoutNightVersions, type GalleryItem } from '../../../lib/api';
import { withBase } from '../../../lib/basePath';

export const metadata: Metadata = {
  alternates: { canonical: '/gallery' },
  title: 'Live tours',
  description: 'Published interactive 3D tours of hotels, halls and spaces. Open one and walk it.'
};

type ClientSite = { id: string; title: string; line: string };

/** Clients' own websites (/s/<project>) that are published: GET /api/sites. */
async function clientSites(): Promise<ClientSite[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/sites`, { cache: 'no-store' });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

async function published(): Promise<GalleryItem[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/gallery`, { cache: 'no-store' });
    return res.ok ? withoutNightVersions(await res.json()) : null;
  } catch {
    return null;
  }
}

const dateFmt = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' });

/** Live tours (the URL stays /gallery): every published space, then the
 *  clients' own websites with the tour inside (when any are published), each
 *  pictured by its tour's thumbnail. Rendered per request so a publish shows
 *  up at once. Styles: inner.css .ip-tours. */
export default async function GalleryPage() {
  await connection();
  const [items, sites] = await Promise.all([published(), clientSites()]);

  return (
    <SitePage>
      <PageHead center label="live tours" facts={items?.length ? [`${items.length} spaces open now`, 'No app, no plugin'] : undefined}
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
            Nothing is published yet. Open a space in the <a href={withBase('/studio')}>studio</a> and choose Publish.
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

      {sites.length > 0 && (
        <Section id="tours-sites" title="Their own websites" lede="Some places get a whole website from us: the tour inside it, and booking and enquiries beside it.">
          <ul className="ip-tours">
            {sites.map((s) => {
              const pic = items?.find((g) => g.propertyId === s.id && g.thumb)?.thumb;
              return (
                <li key={s.id} data-reveal>
                  <Link href={`/s/${encodeURIComponent(s.id)}`} className="ip-tour" data-cursor="link">
                    <span className="ip-tour-pic">
                      {pic
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={`${API_BASE_URL}${pic}`} alt="" loading="lazy" />
                        : <span className="ip-tour-ph" aria-hidden>{s.title.trim()[0]}</span>}
                      <span className="ip-tour-go"><Icon name="outward" />Open the website</span>
                    </span>
                    <span className="ip-tour-t">{s.title}</span>
                    {s.line && s.line !== s.title && <span className="ip-tour-tag">{s.line}</span>}
                    <span className="ip-tour-meta">rcaas.tech/s/{s.id}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </SitePage>
  );
}
