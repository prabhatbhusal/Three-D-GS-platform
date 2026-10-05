'use client';
/**
 * The home page's motion (2026-10-05), one system for the whole page, all on
 * GSAP with the page's own scroll container (.site):
 *   - the hero headline's letters rise into place once the globe has begun
 *     to settle, then the lede and the buttons;
 *   - each section heading rises line by line from behind a mask as it
 *     enters, its line of context after it;
 *   - cards rise in a cascade as their row enters;
 *   - the measured figures count up (the final value is in aria-label);
 * The hero waits for the loading screen (afterIntro). The scroll gauge and
 * the footer's wordmark are every page's (SiteGsap).
 * Reduced motion: nothing moves.
 * Mounted at the end of the home page (page.tsx). Styles: home.css.
 */
import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import { afterIntro } from '../layout/Loader';

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/** A figure like "200,000", "±1.2 cm" or "37.7M" counting up from zero, its words kept. */
function countUp(el: HTMLElement, scroller: Element | undefined) {
  const raw = el.textContent ?? '';
  const m = raw.match(/[\d.,]+/);
  const target = m ? parseFloat(m[0].replace(/,/g, '')) : 0;
  if (!m || !target) return;
  const decimals = (m[0].split('.')[1] ?? '').length;
  const grouped = m[0].includes(',');
  const show = (v: number) => {
    const n = grouped
      ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : v.toFixed(decimals);
    el.textContent = raw.replace(m[0], n);
  };
  const o = { v: 0 };
  show(0);
  gsap.to(o, {
    v: target, duration: 1.8, ease: 'power3.out', onUpdate: () => show(o.v), onComplete: () => { el.textContent = raw; },
    scrollTrigger: { trigger: el, scroller, start: 'top 88%', once: true }
  });
}

export function HomeMotion() {
  const anchor = useRef<HTMLSpanElement | null>(null);

  useGSAP(() => {
    const root = anchor.current?.closest<HTMLElement>('.hp');
    const scroller = root?.closest('.site') ?? undefined;
    if (!root) return;
    const mm = gsap.matchMedia();
    let undoIntro = () => {};

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const enter = (trigger: Element, start = 'top 82%') => ({ trigger, scroller, start, once: true });

      // the hero: letters, then the lede and buttons
      const title = root.querySelector('.hp-hero-title');
      if (title) {
        const split = SplitText.create(title.querySelectorAll('span'), { type: 'chars', mask: 'chars' });
        const rest = root.querySelectorAll('.hp-hero-lede, .hp-hero-cta > *');
        gsap.set(split.chars, { yPercent: 110 });
        gsap.set(rest, { autoAlpha: 0, y: 18 });
        undoIntro = afterIntro(() => {
          gsap.timeline({ delay: 0.35 })
            .to(split.chars, { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.022 })
            .to(rest, { autoAlpha: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.08 }, '-=0.8');
        });
      }

      // section headings, line by line, then their line of context
      root.querySelectorAll<HTMLElement>('.hp-block-head, .hp-method-head, .hp-ask').forEach((head) => {
        const h = head.querySelector('h2');
        if (!h) return;
        const split = SplitText.create(h, { type: 'lines', mask: 'lines' });
        gsap.timeline({ scrollTrigger: enter(head) })
          .from(split.lines, { yPercent: 105, duration: 1, ease: 'expo.out', stagger: 0.09 })
          .from(head.querySelectorAll(':scope > p, :scope > form'), { autoAlpha: 0, y: 14, duration: 0.7, ease: 'power3.out', stagger: 0.08 }, '-=0.6');
      });

      // cards, in a cascade per row
      root.querySelectorAll<HTMLElement>('.hp-cards').forEach((grid) => {
        gsap.from(grid.children, { autoAlpha: 0, y: 36, duration: 0.8, ease: 'power3.out', stagger: 0.08, scrollTrigger: enter(grid, 'top 86%') });
      });

      // the figures count, the hairline grid draws in
      const figs = root.querySelector('.hp-figures');
      if (figs) gsap.from(figs.children, { autoAlpha: 0, duration: 0.6, stagger: 0.06, scrollTrigger: enter(figs, 'top 86%') });
      root.querySelectorAll<HTMLElement>('.hp-figures dd').forEach((dd) => countUp(dd, scroller));
    });
    return () => { undoIntro(); mm.revert(); };
  });

  return <span ref={anchor} hidden />;
}
