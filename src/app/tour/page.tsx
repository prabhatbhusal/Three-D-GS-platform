import type { Metadata } from 'next';
import { API_BASE_URL, type GalleryItem } from '../../lib/api';
import { apiUrl, shareMeta } from '../../lib/shareMeta';
import TourClient from './TourClient';

/**
 * The tour runs in the browser (TourClient). This server half only names the
 * space for link previews: `/tour?space=<id>` pasted into WhatsApp shows the
 * space, the hotel and a picture. Published spaces only, like the tour.
 */
export async function generateMetadata({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const space = (await searchParams).space;
  if (typeof space !== 'string') return {};
  try {
    const list: GalleryItem[] = await (await fetch(`${API_BASE_URL}/api/gallery`, { cache: 'no-store' })).json();
    const g = list.find((x) => x.id === space);
    if (!g) return {};
    const t = g.propertyId
      ? await fetch(`${API_BASE_URL}/api/properties/${encodeURIComponent(g.propertyId)}/theme`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      : null;
    const brand: string = t?.theme?.brand || t?.title || '';
    return shareMeta(
      brand ? `${g.title} · ${brand}` : g.title,
      g.tagline || `Walk ${g.title} in 3D and send an enquiry from inside the room.`,
      apiUrl(g.thumb)
    );
  } catch {
    return {}; // no API, no preview: the tour itself still loads
  }
}

export default function TourPage() {
  return <TourClient />;
}
