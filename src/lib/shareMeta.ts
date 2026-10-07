import type { Metadata } from 'next';

/** The public address of this site, for canonical links, the sitemap and
 *  structured data. Set NEXT_PUBLIC_SITE_URL in production (.env.production);
 *  if it's forgotten, a production build falls back to NEXT_PUBLIC_API_URL,
 *  which is the public domain there (nginx serves both), never localhost. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_API_URL)
  || 'http://localhost:3000').replace(/\/$/, '');

/** For pages that must never appear in search results (studio, sign-in, review links). */
export const NOINDEX: Metadata['robots'] = { index: false, follow: false };

/** The picture every marketing page shares when a link to it is pasted (public/og.jpg, 1200×630). */
const OG = { url: '/og.jpg', width: 1200, height: 630, alt: 'RCAAS.tech: a stupa drawn as a point cloud' };

/** A marketing page's title, description, canonical link and link-preview
 *  tags in one go, so every page says the same thing to a search engine, an
 *  answer engine and a chat app. `title` gets "| RCAAS.tech" from the root
 *  layout's template; `absolute` (the home page) is used as it stands. */
export function pageMeta(path: string, title: string, description: string, absolute = false): Metadata {
  const full = absolute ? title : `${title} | RCAAS.tech`;
  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { title: full, description, url: path, siteName: 'RCAAS.tech', type: 'website', locale: 'en_US', images: [OG] },
    twitter: { card: 'summary_large_image', title: full, description, images: [OG.url] }
  };
}

/** Link-preview tags, so a link pasted into WhatsApp or Facebook shows a
 *  title, a line and a picture. `image` must be an absolute URL (api.ts apiUrl
 *  makes one from an API path). */
export function shareMeta(title: string, description: string, image: string | null): Metadata {
  const images = image ? [image] : undefined;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, images, type: 'website' },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, images }
  };
}

