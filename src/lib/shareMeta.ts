import type { Metadata } from 'next';
import { API_BASE_URL } from './api';

/** Link-preview tags, so a link pasted into WhatsApp or Facebook shows a
 *  title, a line and a picture. `image` must be an absolute URL, which the
 *  API's pictures are (API_BASE_URL is). */
export function shareMeta(title: string, description: string, image: string | null): Metadata {
  const images = image ? [image] : undefined;
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, images, type: 'website' },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, images }
  };
}

/** An API path (a gallery picture, GalleryItem.thumb) as a full URL. */
export const apiUrl = (path: string | null | undefined) => (path ? `${API_BASE_URL}${path}` : null);
