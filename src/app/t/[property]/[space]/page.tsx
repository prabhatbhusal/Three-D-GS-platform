import { redirect } from 'next/navigation';

/** /t/<project>/<space>: the space's tour. The tour itself still lives at
 *  /tour (it checks the space is published and belongs to a project before
 *  any 3D loads); this is the readable address the hub page links to.
 *  Anything else on the link (?lang=, ?embed=1) goes along with it. */
export default async function SpacePage({ params, searchParams }: {
  params: Promise<{ property: string; space: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { space } = await params;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) {
    if (k !== 'space' && typeof v === 'string') q.set(k, v);
  }
  q.set('space', space);
  redirect(`/tour?${q}`);
}
