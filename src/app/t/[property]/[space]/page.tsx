import { redirect } from 'next/navigation';

/** /t/<project>/<space>: the space's tour. The tour itself still lives at
 *  /tour (it checks the space is published and belongs to a project before
 *  any 3D loads); this is the readable address the hub page links to. */
export default async function SpacePage({ params }: { params: Promise<{ property: string; space: string }> }) {
  const { space } = await params;
  redirect(`/tour?space=${encodeURIComponent(space)}`);
}
