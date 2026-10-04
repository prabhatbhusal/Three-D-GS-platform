import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { API_BASE_URL, apiUrl, type PublicSite } from '../../../lib/api';
import { SiteView } from './SiteView';
import { shareMeta } from '../../../lib/shareMeta';

/**
 * A project's website (/s/<project>): the editorial page the studio writes
 * at /studio/<project>/site, around the project's live tour. The tour is the
 * published one, embedded unchanged; "View in 3D" on a room sends it there.
 * Server-rendered, so every word is in the HTML and indexable. Rendered per
 * request, so a publish shows at once.
 */

async function load(id: string): Promise<PublicSite | null> {
  try {
    const r = await fetch(`${API_BASE_URL}/api/sites/${encodeURIComponent(id)}`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ property: string }> }): Promise<Metadata> {
  const { property } = await params;
  const s = await load(property);
  if (!s) return { title: 'Not found' };
  const name = s.project.theme.brand || s.project.title;
  // The site's first photo, a room's, the logo, else its tour's picture if it has one.
  const photo = s.site.gallery?.[0] ?? s.site.rooms?.find((r) => r.image)?.image ?? (s.project.theme.logo || null);
  return {
    ...shareMeta(
    s.site.hero.title || name,
    s.site.hero.lede || `${name}, in 3D.`,
    photo ? `${API_BASE_URL}/api/assets/${photo}` : apiUrl(s.tour?.thumb)
    ),
    alternates: { canonical: `/s/${encodeURIComponent(property)}` }
  };
}

export default async function WebsitePage({ params }: { params: Promise<{ property: string }> }) {
  await connection();
  const { property } = await params;
  const data = await load(property);
  if (!data) notFound();
  return <SiteView data={data} />;
}
