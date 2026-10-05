'use client';
/**
 * The loading screen (2026-10-05): a scan line sweeps the dotted ground left
 * to right and the points it passes light up, as a LiDAR pass does, while a
 * counter runs to 100%. When the page has loaded, the screen lifts away
 * (framer-motion) and the page's own entrance starts (afterIntro).
 *
 * Once per browser tab: the first-paint script in app/(site)/layout.tsx sets
 * html[data-intro] to "playing", or to "seen" when this tab has already seen
 * it or the visitor prefers reduced motion, and inner.css then hides it
 * before it paints. Without scripts it fades by itself after 4 s.
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const EVENT = 'rcaas:intro';
const EASE = [0.76, 0, 0.24, 1] as const;

/** Run `cb` once the loading screen has lifted (at once if there is none). Returns an undo. */
export function afterIntro(cb: () => void) {
  if (document.documentElement.dataset.intro !== 'playing') { cb(); return () => {}; }
  window.addEventListener(EVENT, cb, { once: true });
  return () => window.removeEventListener(EVENT, cb);
}

export function Loader() {
  const [phase, setPhase] = useState<'scan' | 'lift' | 'gone'>('scan');
  const root = useRef<HTMLDivElement | null>(null);
  const num = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.intro !== 'playing') { setPhase('gone'); return; }
    let loaded = document.readyState === 'complete';
    const onLoad = () => { loaded = true; };
    window.addEventListener('load', onLoad);
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = now - t0;
      // 1.2 s to 100%, held at 96% while the page is still loading (2.6 s at most)
      let p = 1 - Math.pow(1 - Math.min(1, t / 1200), 3);
      if (!loaded && t < 2600) p = Math.min(p, 0.96);
      root.current?.style.setProperty('--p', p.toFixed(4));
      if (num.current) num.current.textContent = `${String(Math.round(p * 100)).padStart(3, '0')}%`;
      if (p < 1) raf = requestAnimationFrame(frame);
      else setPhase('lift');
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('load', onLoad); };
  }, []);

  const done = () => {
    setPhase('gone');
    const html = document.documentElement;
    html.dataset.intro = 'seen';
    try { sessionStorage.setItem('rcaas-intro', '1'); } catch { /* private mode: it shows again next load */ }
    window.dispatchEvent(new Event(EVENT));
  };

  if (phase === 'gone') return null;
  return (
    <motion.div
      ref={root}
      className="site-loader"
      aria-hidden
      initial={false}
      animate={phase === 'lift' ? { clipPath: 'inset(0% 0% 100% 0%)' } : { clipPath: 'inset(0% 0% 0% 0%)' }}
      transition={{ duration: 0.95, ease: EASE, delay: 0.15 }}
      onAnimationComplete={() => { if (phase === 'lift') done(); }}
    >
      <span className="site-loader-lit" />
      <span className="site-loader-beam" />
      <motion.div
        className="site-loader-mark"
        animate={phase === 'lift' ? { y: -40, opacity: 0 } : { y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        RCAAS<span>.tech</span>
      </motion.div>
      <div className="site-loader-foot">
        <span>Kathmandu 27.72° N, 85.32° E</span>
        <span ref={num}>000%</span>
      </div>
    </motion.div>
  );
}
