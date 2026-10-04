'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/** What rises in as it scrolls into view, on every marketing page. Hidden
 *  before the first paint by landing.css (html.gs), so nothing flashes. */
const CARDS = '.lp-win, .lp-spec, .lp-four li, .lp-sectors li, .lp-svc, .lp-entry, .lp-path li, .lp-vs p, '
  + '.lp-kit, .lp-tabs, .lp-bleed-body, .lp-contact, .gallery-grid > li';

/** Count a spec up to its value: "200,000", "±1.2 cm", "37.7M", "360°". */
function countUp(el: HTMLElement, scroller: Element) {
  const text = el.textContent ?? '';
  const m = /^(\D*?)([\d.,]+)(.*)$/.exec(text);
  const target = m ? parseFloat(m[2].replace(/,/g, '')) : 0;
  if (!m || !target) return () => {};
  const [, pre, num, post] = m;
  const dec = (num.split('.')[1] ?? '').length;
  const show = (v: number) => {
    el.textContent = pre + (num.includes(',') ? Math.round(v).toLocaleString('en') : v.toFixed(dec)) + post;
  };
  const o = { v: 0 };
  show(0);
  gsap.to(o, {
    v: target, duration: 1.6, ease: 'power2.out', onUpdate: () => show(o.v),
    scrollTrigger: { trigger: el, scroller, start: 'top 90%', once: true }
  });
  return () => { el.textContent = text; };
}

/**
 * The marketing site's motion (GSAP): the hero builds itself, section titles
 * rise word by word, cards rise in as they scroll into view, spec numbers
 * count up, and the full-bleed photo drifts. With reduced motion on it is
 * fades only. Mounted by SitePage, so each page runs its own and cleans up
 * on the way out.
 */
export function SiteGsap() {
  const anchor = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    const page = anchor.current?.closest<HTMLElement>('.lp-page');
    const scroller = page?.closest('.site');
    if (!page || !scroller) return;
    const q = gsap.utils.selector(page);
    const gated = q('.lp-hero > :not(.lp-hero-media), .lp-page-head > *');
    const cards = q(CARDS);
    const heads = q('.lp-band > .lp-head');

    gsap.matchMedia().add({ full: '(prefers-reduced-motion: no-preference)', calm: '(prefers-reduced-motion: reduce)' }, (ctx) => {
      const full = !!ctx.conditions?.full;
      // A page may have none of these: GSAP warns "target not found" on an empty list.
      if (gated.length + heads.length) gsap.set([...gated, ...heads], { autoAlpha: 1 });
      if (cards.length) {
        gsap.set(cards, { autoAlpha: 0, y: full ? 48 : 0 });
        ScrollTrigger.batch(cards, {
          scroller, start: 'top 90%', once: true,
          onEnter: (els) => gsap.to(els, { autoAlpha: 1, y: 0, duration: full ? 0.8 : 0.5, stagger: 0.08, ease: 'power3.out', overwrite: true })
        });
      }

      if (!full) {
        if (gated.length) gsap.from(gated, { autoAlpha: 0, duration: 0.6, stagger: 0.06 });
        heads.forEach((h) => gsap.from(h, { autoAlpha: 0, duration: 0.6, scrollTrigger: { trigger: h, scroller, start: 'top 88%', once: true } }));
        return;
      }

      // The hero: RCAAS letter by letter, then the rest.
      const hero = q('.lp-hero')[0];
      if (hero) {
        const $ = gsap.utils.selector(hero);
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        const word = $('.lp-hero-word')[0];
        if (word) {
          const split = SplitText.create(word, { type: 'chars', mask: 'chars' });
          tl.from(split.chars, { yPercent: 110, duration: 0.9, stagger: 0.06, ease: 'power4.out' }, 0.3);
        }
        tl.from($('.lp-hero-title'), { autoAlpha: 0, y: 24, duration: 0.7 }, '-=0.5')
          .from($('.lp-lede'), { autoAlpha: 0, y: 24, duration: 0.7 }, '-=0.5')
          .from($('.lp-cta > *'), { autoAlpha: 0, y: 16, scale: 0.94, duration: 0.6, stagger: 0.1 }, '-=0.45');
      }
      // Other pages' headers.
      const pageHead = q('.lp-page-head > *');
      if (pageHead.length) gsap.from(pageHead, { autoAlpha: 0, y: 36, duration: 0.8, stagger: 0.08, ease: 'power3.out' });

      // Section titles, word by word; their line under them follows.
      heads.forEach((h) => {
        const title = h.querySelector('h2');
        const rest = [...h.children].filter((c) => c !== title);
        const tl = gsap.timeline({ scrollTrigger: { trigger: h, scroller, start: 'top 88%', once: true } });
        if (title) tl.from(SplitText.create(title, { type: 'words', mask: 'words' }).words, { yPercent: 100, duration: 0.8, stagger: 0.05, ease: 'power3.out' });
        if (rest.length) tl.from(rest, { autoAlpha: 0, y: 20, duration: 0.6 }, '-=0.5');
      });

      // Step numbers pop as their card arrives; specs count up.
      q('.lp-four-n').forEach((n) => gsap.from(n, {
        scale: 0, rotate: -90, duration: 0.7, ease: 'back.out(2)',
        scrollTrigger: { trigger: n, scroller, start: 'top 90%', once: true }
      }));
      const undo = q('.lp-spec strong').map((el) => countUp(el, scroller));

      // The full-bleed photo drifts slower than the page.
      q('.lp-bleed').forEach((b) => {
        const media = b.querySelector('.lp-bleed-media');
        if (media) gsap.fromTo(media, { yPercent: -8, scale: 1.16 }, {
          yPercent: 8, scale: 1.16, ease: 'none',
          scrollTrigger: { trigger: b, scroller, start: 'top bottom', end: 'bottom top', scrub: true }
        });
      });

      return () => undo.forEach((f) => f());
    });
  });

  return <span ref={anchor} hidden />;
}
