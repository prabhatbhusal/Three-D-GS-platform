import { API_BASE_URL, type GalleryItem } from '../../lib/api';
import { SITE_URL } from '../../lib/shareMeta';

/** The marketing pages, every published client website (/s/), and every
 *  project's tour page (/t/). Single tours redirect to /tour, so they're left
 *  out. Rebuilt hourly, so a new publish shows up without a deploy. A plain
 *  route rather than app/sitemap.ts for the reason in robots.txt/route.ts. */
export const revalidate = 3600;

const PAGES = ['/', '/work', '/services', '/how-it-works', '/gallery', '/about', '/contact', '/terms', '/privacy', '/security', '/cookies'];

async function get<T>(path: string): Promise<T[]> {
  try {
    const r = await fetch(`${API_BASE_URL}${path}`, { next: { revalidate } });
    return r.ok ? await r.json() : [];
  } catch {
    return []; // API down at build time: the marketing pages still go out
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function GET() {
  const [sites, spaces] = await Promise.all([
    get<{ id: string; publishedAt: string | null }>('/api/sites'),
    get<GalleryItem>('/api/gallery')
  ]);
  const hubs = new Map<string, string>();
  for (const s of spaces) {
    if (!s.propertyId) continue;
    const prev = hubs.get(s.propertyId);
    if (!prev || s.publishedAt > prev) hubs.set(s.propertyId, s.publishedAt);
  }
  const urls: { loc: string; lastmod?: string | null; priority: number }[] = [
    ...PAGES.map((p) => ({ loc: `${SITE_URL}${p === '/' ? '' : p}`, priority: p === '/' ? 1 : 0.7 })),
    ...sites.map((s) => ({ loc: `${SITE_URL}/s/${encodeURIComponent(s.id)}`, lastmod: s.publishedAt, priority: 0.8 })),
    ...[...hubs].map(([id, d]) => ({ loc: `${SITE_URL}/t/${encodeURIComponent(id)}`, lastmod: d, priority: 0.6 }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
