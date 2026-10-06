'use client';
/** "One studio runs every client" (2026-10-06), after linear.app's product
 *  window: the real studio, in a frame, a screen per tab: the project home,
 *  the 3D editor, the client's website editor, reservations. The screens are
 *  a sample project's (server/scripts/seed-sample-site.mjs), in the studio's
 *  dark and light themes, and the page shows the one that matches its own.
 *  The frame tips up into place as it scrolls in, where the browser can
 *  (scroll-driven animation); a tab changes the screen. Styles: home.css .hp-sw. */
import { useState } from 'react';
import Image from 'next/image';
import { withBase } from '../../../lib/basePath';

const SCREENS = [
  { k: 'home', t: 'Project home', b: 'What needs a reply, which spaces are live and ready, this month’s visits.' },
  { k: 'editor', t: '3D editor', b: 'Hotspots for tables, rooms and halls, camera tracks, the start view.' },
  { k: 'website', t: 'Client website', b: 'Every part of the client’s own site, from one form, with a preview.' },
  { k: 'reservations', t: 'Reservations', b: 'Requests from the website and from inside the 3D tour, answered in one place.' }
] as const;

export function StudioWindow() {
  const [on, setOn] = useState<(typeof SCREENS)[number]['k']>('home');
  return (
    <section className="hp-block hp-sw" aria-labelledby="hp-sw-title" data-chapter="Studio">
      <header className="hp-block-head">
        <h2 id="hp-sw-title">One studio runs every client.</h2>
        <p>The scan and its hotspots, the client’s own website and every booking request, in one place we built for it. These are its real screens, from a sample project.</p>
      </header>
      <div className="hp-sw-tabs" role="tablist" aria-label="Studio screens">
        {SCREENS.map((s) => (
          <button key={s.k} type="button" role="tab" id={`hp-sw-tab-${s.k}`} aria-selected={on === s.k} aria-controls="hp-sw-frame"
            className={on === s.k ? 'is-on' : undefined} onClick={() => setOn(s.k)}>
            <b>{s.t}</b>
            <span>{s.b}</span>
          </button>
        ))}
      </div>
      <div className="hp-sw-stage">
        <div id="hp-sw-frame" className="hp-sw-frame" role="tabpanel" aria-labelledby={`hp-sw-tab-${on}`}>
          {SCREENS.map((s) => (
            <div key={s.k} className={`hp-sw-shot${on === s.k ? ' is-on' : ''}`} aria-hidden={on !== s.k}>
              {(['light', 'dark'] as const).map((t) => (
                <Image key={t} src={withBase(`/media/studio/${s.k}-${t}.webp`)} alt={on === s.k ? `The studio: ${s.t.toLowerCase()}` : ''}
                  width={1600} height={1000} sizes="(max-width: 1320px) 100vw, 1240px" className={`hp-sw-img is-${t}`} loading="lazy" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
