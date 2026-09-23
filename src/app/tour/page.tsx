'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { openCurtain } from '../../components/Curtain';
import { getGallery } from '../../lib/api';
import { hydrateScenes, limitTour } from '../../lib/scenes';
import { loadSceneDoc } from '../../lib/sceneDoc';
import type { ApiScene, SceneDoc } from '../../@types/scene.types';

// Interim visitor route until /t/<property>/<space> exists (CLAUDE.md §12) —
// that needs the property document, which isn't built yet.
const App = dynamic(() => import('../../components/App'), { ssr: false });

type Gate =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'empty' }
  | { kind: 'unpublished'; id: string }
  | { kind: 'offline' };

const toApiScene = (d: SceneDoc & { tagline?: string; outdoor?: boolean }): ApiScene => ({
  id: d.id,
  title: d.title,
  tagline: d.tagline,
  spawn: d.spawn,
  outdoor: d.outdoor,
  unitScale: d.unitScale,
  assetId: d.splat?.variants?.high?.assetId,
  meta: d.splat?.variants?.high?.meta,
  format: d.splat?.format,
  neighbours: d.neighbours
});

/**
 * The public tour: published spaces only (§7.5). `?space=<id>` picks which
 * one opens; without it, the most recently published. Everything the 3D
 * needs is read from the published copies BEFORE it mounts, so the renderer
 * never starts streaming a space a visitor isn't allowed to see.
 */
export default function TourPage() {
  const [gate, setGate] = useState<Gate>({ kind: 'checking' });

  useEffect(() => {
    const want = new URLSearchParams(location.search).get('space');
    (async () => {
      const list = await getGallery();
      if (!list?.length) return setGate({ kind: 'empty' });
      const start = want ? list.find((g) => g.id === want)?.id : list[0].id;
      if (!start) return setGate({ kind: 'unpublished', id: want! });
      const docs = await Promise.all(list.map((g) => loadSceneDoc(g.id, 'published')));
      // A tour shows one client's spaces: the ones published under the same
      // project as the space it opens on (§5.1). Never another hotel's rooms.
      const project = docs.find((d) => d?.id === start)?.propertyId ?? null;
      const same = docs.filter((d): d is SceneDoc => !!d && (d.propertyId ?? null) === project);
      hydrateScenes(same.map(toApiScene));
      limitTour(same.map((d) => d.id), start);
      setGate({ kind: 'ready' });
    })().catch(() => setGate({ kind: 'offline' }));
  }, []);

  // Arrived behind the curtain (the home page's "Walk a live tour"): a
  // message opens it at once; the 3D opens it when its start screen is up.
  useEffect(() => { if (gate.kind !== 'checking' && gate.kind !== 'ready') openCurtain(); }, [gate.kind]);

  if (gate.kind === 'ready') return <App />;
  if (gate.kind === 'checking') return <div className="tour-msg"><p>Opening the tour…</p></div>;

  const copy = {
    empty: ['Nothing to show yet', 'No spaces have been published. Publish one from the studio and it appears here.'],
    unpublished: ['This space isn’t published', 'It may have been taken down, or the link is wrong. Browse the published tours instead.'],
    offline: ['The tour can’t load right now', 'The tour server isn’t answering. Try again in a moment.']
  }[gate.kind];

  return (
    <div className="tour-msg">
      <h1>{copy[0]}</h1>
      <p>{copy[1]}</p>
      <Link href="/gallery">Browse tours</Link>
    </div>
  );
}
