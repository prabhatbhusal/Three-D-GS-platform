'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { openCurtain } from '../../components/Curtain';
import { checkEmbed, getGallery, getProjectTheme } from '../../lib/api';
import { applyTheme } from '../../lib/uiConfig';
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
  | { kind: 'offline' }
  | { kind: 'blocked'; reason: string; space: string };

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
    const q = new URLSearchParams(location.search);
    const want = q.get('space');
    (async () => {
      // An embed shows only with its space's key (from the studio's snippet),
      // and only on a website the space allows. Being inside a frame counts
      // as an embed whatever the link says, so dropping embed=1 doesn't skip
      // this. The page it's inside comes from the browser (ancestorOrigins,
      // else the referrer), which the embedding page can't forge.
      const framed = window.self !== window.top;
      if (framed || q.get('embed') === '1') {
        let from = location.origin;
        if (framed) {
          try { from = location.ancestorOrigins?.[0] ?? (document.referrer ? new URL(document.referrer).origin : ''); } catch { from = ''; }
        }
        const r = want ? await checkEmbed(want, q.get('key') ?? '', from) : null;
        if (!r?.ok) return setGate({ kind: 'blocked', reason: r?.reason ?? 'key', space: want ?? '' });
      }
      const list = await getGallery();
      if (!list?.length) return setGate({ kind: 'empty' });
      const start = want ? list.find((g) => g.id === want)?.id : list[0].id;
      if (!start) return setGate({ kind: 'unpublished', id: want! });
      const docs = await Promise.all(list.map((g) => loadSceneDoc(g.id, 'published')));
      // A tour shows one client's spaces: the ones published under the same
      // project as the space it opens on (§5.1). Never another hotel's rooms.
      const project = docs.find((d) => d?.id === start)?.propertyId ?? null;
      const same = docs.filter((d): d is SceneDoc => !!d && (d.propertyId ?? null) === project);
      // the project's own name, colour, font and logo (per-project branding)
      if (project) {
        const t = await getProjectTheme(project).catch(() => null);
        if (t) applyTheme(t.theme, t.title);
      }
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
    offline: ['The tour can’t load right now', 'The tour server isn’t answering. Try again in a moment.'],
    blocked: gate.kind === 'blocked' && gate.reason === 'site'
      ? ['This tour isn’t shown on this website', 'It can only be embedded on the sites its owner chose. You can still open it on RCAAS.tech.']
      : ['This tour can’t be shown here', 'The embed code is out of date or incomplete. Ask the site’s owner to copy a fresh one from the studio.']
  }[gate.kind];

  return (
    <div className="tour-msg">
      <h1>{copy[0]}</h1>
      <p>{copy[1]}</p>
      {gate.kind === 'blocked' && gate.space
        ? <a href={`/tour?space=${encodeURIComponent(gate.space)}`} target="_top">Open the tour on RCAAS.tech</a>
        : <Link href="/gallery">Browse tours</Link>}
    </div>
  );
}
