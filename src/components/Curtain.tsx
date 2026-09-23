'use client';

/* A stage curtain between the site and a tour. Two dark panels close from
 * the sides, the next thing loads behind them, and they open on it. Mounted
 * once in the root layout, so it stays up while the page under it changes
 * (the home page's "Walk a live tour" → /tour), and driven from anywhere
 * through closeCurtain() / openCurtain(). Purely visual: nothing waits on it
 * to load, and it opens by itself after OPEN_ANYWAY so a visitor is never
 * left looking at a closed curtain. Styles in globals.css. */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Phase = 'idle' | 'closing' | 'closed' | 'opening';

const CLOSE_MS = 650;
const OPEN_MS = 1000;
const OPEN_ANYWAY = 8000;

let setPhase: ((p: Phase) => void) | null = null;
let phase: Phase = 'idle';
let timer = 0;
let safety = 0;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const go = (p: Phase) => { phase = p; setPhase?.(p); };

/** Draw the curtain; resolves once it is shut. */
export function closeCurtain(): Promise<void> {
  if (!setPhase) return Promise.resolve();
  clearTimeout(timer);
  clearTimeout(safety);
  safety = window.setTimeout(openCurtain, OPEN_ANYWAY);
  if (reduced()) { go('closed'); return Promise.resolve(); }
  go('closing');
  return new Promise((done) => { timer = window.setTimeout(() => { go('closed'); done(); }, CLOSE_MS); });
}

/** Open it on whatever is underneath now. Does nothing if it isn't drawn. */
export function openCurtain() {
  if (phase !== 'closing' && phase !== 'closed') return;
  clearTimeout(timer);
  clearTimeout(safety);
  if (reduced()) return go('idle');
  go('opening');
  timer = window.setTimeout(() => go('idle'), OPEN_MS);
}

export function Curtain() {
  const [p, set] = useState<Phase>('idle');
  useEffect(() => {
    setPhase = set;
    return () => { setPhase = null; };
  }, []);
  if (p === 'idle') return null;
  return (
    <div className={`curtain is-${p}`} aria-hidden>
      <div className="curtain-panel curtain-l" />
      <div className="curtain-panel curtain-r" />
      <p className="curtain-say">Opening the tour</p>
    </div>
  );
}

/** A link that draws the curtain, then navigates. A modified click (new
 *  tab, new window) is left to the browser. */
export function CurtainLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Link href={href} className={className} onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      closeCurtain().then(() => router.push(href));
    }}>
      {children}
    </Link>
  );
}
