import { SITE_URL } from '../../lib/shareMeta';

/** Every crawler, search engines and AI assistants alike, may read the public
 *  pages. Private pages carry a noindex tag instead of a Disallow here, since
 *  a crawler barred from a page can't see that tag.
 *  A plain route, not app/robots.ts: Next's metadata-route loader writes the
 *  file's path into a JS string, and the apostrophe in this checkout's path
 *  ("Prabhat's projects") breaks it. */
export const dynamic = 'force-static';

// Named on purpose (2026-10-06): AI search and answer engines are welcome to read, quote and cite
// the public pages, and a site that names them says so. Every group allows the same thing.
const AI = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'DuckDuckBot'];

export function GET() {
  const groups = ['*', ...AI].map((ua) => `User-agent: ${ua}\nAllow: /`).join('\n\n');
  return new Response(`${groups}\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
