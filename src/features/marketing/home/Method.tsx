'use client';
/**
 * "From one walk to a live tour": the four steps (siteContent.ts STEPS) on a
 * light page, the only one in the home page. On a wide screen the section
 * pins and scrolling moves the steps sideways, each a poster-size word over
 * its own faint number; the scroll writes one number (--p) and CSS does the
 * rest, as SiteMotion's scenes do. Narrow screens and reduced motion get the
 * steps stacked. Styles: home.css .hp-method.
 */
import { useEffect, useRef } from 'react';
import { Button } from '../../../components/ui/Button';
import { STEPS } from '../siteContent';

export function Method() {
  const ref = useRef<HTMLElement | null>(null);
  const track = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    const el = ref.current!, row = track.current!;
    const scroller = el.closest('.site') ?? window;
    const wide = matchMedia('(min-width: 900px) and (prefers-reduced-motion: no-preference)');
    let raf = 0;
    const measure = () => {
      // how far the row must travel, and a section tall enough to scroll it
      const shift = wide.matches ? Math.max(0, row.scrollWidth - el.clientWidth) : 0;
      el.style.setProperty('--shift', `${shift}px`);
      el.style.height = wide.matches ? `${window.innerHeight + shift}px` : '';
      update();
    };
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      el.style.setProperty('--p', span > 0 ? Math.min(1, Math.max(0, -r.top / span)).toFixed(4) : '0');
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    measure();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    wide.addEventListener('change', measure);
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      wide.removeEventListener('change', measure);
    };
  }, []);

  return (
    <section className="hp-method" ref={ref} aria-labelledby="hp-method-title">
      <div className="hp-method-pin">
        <header className="hp-method-head">
          <h2 id="hp-method-title">From one walk to a live tour.</h2>
          <p>Days, not months, from the first walk-through to a link on your website.</p>
        </header>
        <ol className="hp-method-track" ref={track}>
          {STEPS.map((s, i) => (
            <li key={s.t} className="hp-step">
              <span className="hp-step-n" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.t}.</h3>
              <p>{s.b}</p>
            </li>
          ))}
          <li className="hp-step hp-step-end">
            <Button href="/how-it-works" transitionTypes={['nav-forward']}>See how it works</Button>
          </li>
        </ol>
      </div>
    </section>
  );
}
