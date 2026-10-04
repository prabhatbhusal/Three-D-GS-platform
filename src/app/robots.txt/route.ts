import { SITE_URL } from '../../lib/shareMeta';

/** Every crawler, search engines and AI assistants alike, may read the public
 *  pages. Private pages carry a noindex tag instead of a Disallow here, since
 *  a crawler barred from a page can't see that tag.
 *  A plain route, not app/robots.ts: Next's metadata-route loader writes the
 *  file's path into a JS string, and the apostrophe in this checkout's path
 *  ("Prabhat's projects") breaks it. */
export const dynamic = 'force-static';

export function GET() {
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
