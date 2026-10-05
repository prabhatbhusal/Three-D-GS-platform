'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import { afterIntro } from './layout/Loader';

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

// One slow, soft curve for everything that arrives: fast out of the gate,
// a long settle. Blur clears as things land, so they focus rather than pop.
const EASE = 'expo.out';

/** Count a figure up to its value, its words kept: "37.7M", "1 h 58 m", "52 GB". */
function countUp(el: HTMLElement, scroller: Element) {
  const text = el.textContent ?? '';
  const m = /^(\D*?)([\d.,]+)(.*)$/.exec(text);
  const target = m ? parseFloat(m[2].replace(/,/g, '')) : 0;
  if (!m || !target) return;
  const [, pre, num, post] = m;
  const dec = (num.split('.')[1] ?? '').length;
  const show = (v: number) => {
    el.textContent = pre + (num.includes(',') ? Math.round(v).toLocaleString('en') : v.toFixed(dec)) + post;
  };
  const o = { v: 0 };
  show(0);
  gsap.to(o, {
    v: target, duration: 2, ease: 'power3.out', onUpdate: () => show(o.v), onComplete: () => { el.textContent = text; },
    scrollTrigger: { trigger: el, scroller, start: 'top 90%', once: true }
  });
}

/**
 * The marketing pages' motion (GSAP), one vocabulary for every page, read
 * from the markup:
 *   .ip-head            the page's opening: the h1's letters rise from behind
 *                       a mask once the loading screen has gone, then the rest;
 *   [data-lines]        a heading rises line by line as it scrolls in;
 *   [data-reveal]       rises, fades and comes into focus, in a cascade per batch;
 *   [data-count]        a figure counts up;
 *   [data-words]        a sentence lights up word by word with the scroll;
 *   [data-strike]       a line is drawn through it;
 *   .ip-steps           the line beside the steps fills with the scroll;
 *   .ip-band            the viewfinder's corners close in;
 *   .ft-mark            the footer's wordmark rises letter by letter;
 * plus the scroll gauge on the right edge. With reduced motion everything is
 * simply shown. Elements start hidden (inner.css, html.gs). Mounted by
 * SitePage, so each page runs its own and cleans up on the way out.
 */
export function SiteGsap() {
  const anchor = useRef<HTMLSpanElement>(null);
  const gauge = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const page = anchor.current?.closest<HTMLElement>('.lp-page');
    const scroller = page?.closest('.site');
    if (!page || !scroller) return;
    const q = gsap.utils.selector(page);
    const hidden = q('.ip-head > *, [data-reveal], [data-lines]');
    let undoIntro = () => {};

    gsap.matchMedia().add({ full: '(prefers-reduced-motion: no-preference)', calm: '(prefers-reduced-motion: reduce)' }, (ctx) => {
      if (!ctx.conditions?.full) {
        if (hidden.length) gsap.set(hidden, { autoAlpha: 1 });
        return;
      }
      const enter = (trigger: Element, start = 'top 86%') => ({ trigger, scroller, start, once: true });

      // the opening, after the loading screen
      const head = q('.ip-head')[0];
      if (head) {
        const $ = gsap.utils.selector(head);
        gsap.set(head.children, { autoAlpha: 0 });
        undoIntro = afterIntro(() => {
          gsap.set(head.children, { autoAlpha: 1 });
          const split = SplitText.create($('.ip-title'), { type: 'words,chars', mask: 'chars' });
          gsap.timeline({ defaults: { ease: EASE } })
            .from($('.ip-path'), { autoAlpha: 0, y: 16, duration: 0.9 })
            .from(split.chars, { yPercent: 115, duration: 1.3, stagger: 0.018 }, 0.1)
            .from($('.ip-lede, .ip-facts li'), { autoAlpha: 0, y: 24, filter: 'blur(8px)', duration: 1.2, stagger: 0.08 }, 0.55);
        });
      }

      // headings, line by line
      q('[data-lines]').forEach((h) => {
        gsap.set(h, { autoAlpha: 1 });
        const split = SplitText.create(h, { type: 'lines', mask: 'lines' });
        gsap.from(split.lines, { yPercent: 110, duration: 1.4, ease: EASE, stagger: 0.12, scrollTrigger: enter(h, 'top 88%') });
      });

      // everything else that arrives, a batch at a time
      const reveal = q('[data-reveal]');
      if (reveal.length) {
        gsap.set(reveal, { autoAlpha: 0, y: 56, filter: 'blur(10px)' });
        ScrollTrigger.batch(reveal, {
          scroller, start: 'top 90%', once: true,
          onEnter: (els) => gsap.to(els, { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 1.4, ease: EASE, stagger: 0.1, overwrite: true })
        });
      }

      q('[data-count]').forEach((el) => countUp(el, scroller));

      // a sentence that lights up with the scroll
      q('[data-words]').forEach((el) => {
        const split = SplitText.create(el, { type: 'words' });
        gsap.fromTo(split.words, { opacity: 0.14 }, {
          opacity: 1, stagger: 0.1, ease: 'none',
          scrollTrigger: { trigger: el, scroller, start: 'top 80%', end: 'bottom 45%', scrub: 0.6 }
        });
      });

      q('[data-strike]').forEach((el) => gsap.fromTo(el, { '--strike': 0 }, {
        '--strike': 1, duration: 0.9, ease: 'power3.inOut', scrollTrigger: enter(el, 'top 80%')
      }));

      q('.ip-steps').forEach((s) => gsap.fromTo(s.querySelector('.ip-steps-fill'), { scaleY: 0 }, {
        scaleY: 1, ease: 'none', scrollTrigger: { trigger: s, scroller, start: 'top 70%', end: 'bottom 60%', scrub: 0.8 }
      }));

      q('.ip-band').forEach((b) => gsap.fromTo(b, { '--vf': 1 }, { '--vf': 0, duration: 1.6, ease: EASE, scrollTrigger: enter(b, 'top 80%') }));

      q('.ft-mark').forEach((w) => {
        const split = SplitText.create(w, { type: 'chars', mask: 'chars' });
        gsap.from(split.chars, { yPercent: 115, duration: 1.2, ease: EASE, stagger: 0.035, scrollTrigger: enter(w, 'top 98%') });
      });

      // the scroll gauge: one number and one bar, written every scrolled frame
      const g = gauge.current;
      if (!g) return;
      const bar = g.querySelector<HTMLElement>('.gauge-fill');
      const num = g.querySelector<HTMLElement>('.gauge-n');
      let raf = 0;
      const update = () => {
        raf = 0;
        const max = scroller.scrollHeight - scroller.clientHeight;
        const p = max > 0 ? scroller.scrollTop / max : 0;
        if (bar) bar.style.transform = `scaleY(${p})`;
        if (num) num.textContent = `${String(Math.round(p * 100)).padStart(3, '0')}%`;
      };
      const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
      update();
      scroller.addEventListener('scroll', onScroll, { passive: true });
      g.dataset.on = '';
      return () => {
        cancelAnimationFrame(raf);
        scroller.removeEventListener('scroll', onScroll);
        delete g.dataset.on;
      };
    });
    return () => undoIntro();
  });

  return (
    <>
      <span ref={anchor} hidden />
      <div className="gauge" ref={gauge} aria-hidden>
        <span className="gauge-track"><span className="gauge-fill" /></span>
        <span className="gauge-n">000%</span>
      </div>
    </>
  );
}
