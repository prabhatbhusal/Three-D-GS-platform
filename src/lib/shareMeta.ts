import type { Metadata } from 'next';

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

