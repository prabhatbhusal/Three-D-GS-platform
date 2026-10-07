import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { API_BASE_URL, apiUrl, type PublicSite } from '../../../../lib/api';
import { SpaceView } from '../../../../features/website/SpaceView';
import { shareMeta } from '../../../../lib/shareMeta';

/** One space of a project's website (/s/<project>/<space>): its live tour, what it is, and how to book or ask. */
async function load(id: string): Promise<PublicSite | null> {
  try {
    const r = await fetch(`${API_BASE_URL}/api/sites/${encodeURIComponent(id)}`, { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

type Params = { params: Promise<{ property: string; space: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { property, space } = await params;
  const s = await load(property);
  const sp = s?.spaces?.find((x) => x.id === space);
  if (!s || !sp) return { title: 'Not found' };
  const name = s.project.theme.brand || s.project.title;
  return {
    ...shareMeta(`${sp.title} | ${name}`, sp.tagline || `${sp.title} at ${name}, in 3D.`, apiUrl(sp.thumb)),
    alternates: { canonical: `/s/${encodeURIComponent(property)}/${encodeURIComponent(space)}` }
  };
}

export default async function SpacePage({ params }: Params) {
  await connection();
  const { property, space } = await params;
  const data = await load(property);
  if (!data?.spaces?.some((x) => x.id === space)) notFound();
  return <SpaceView data={data} space={space} />;
}
