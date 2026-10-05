'use client';
/**
 * Two ways the marketing pages move under a mouse (2026-10-05), in our own
 * code (no smooth-scroll library):
 *   - the wheel glides: each notch sets where the page is going and the page
 *     eases there, so a flick of the wheel lands softly instead of jumping.
 *     Trackpads, keyboards, scrollbars and links keep the browser's own
 *     scrolling, and so does anything inside a panel that scrolls by itself
 *     (the dropdown on a short screen, a text field);
 *   - buttons and the contact icons lean towards the pointer as it nears
 *     their middle, and settle back when it leaves.
 * Mouse only, and neither with reduced motion. Mounted once in
 * app/(site)/layout.tsx; .site is the pages' scroll container.
 */
import { useEffect } from 'react';

const MAGNETIC = '.site-btn, .lp-pill, .reach a';

/** Can something between `from` and the page itself still scroll that way? Then it gets the wheel. */
function innerScroller(from: Element | null, page: Element, dy: number) {
  for (let n = from; n && n !== page; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
      if (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
    }
  }
  return false;
}

export function SmoothScroll() {
  useEffect(() => {
    if (!matchMedia('(pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const page = document.querySelector<HTMLElement>('.site');
    if (!page) return;

    let target = page.scrollTop, set = target, raf = 0;
    const step = () => {
      // moved by something else (a link, a new page): stop and let it be
      if (Math.abs(page.scrollTop - set) > 2) { raf = 0; target = page.scrollTop; return; }
      const d = target - page.scrollTop;
      if (Math.abs(d) < 0.5) { raf = 0; return; }
      set = page.scrollTop + d * 0.11;
      page.scrollTo({ top: set, behavior: 'instant' });
      set = page.scrollTop;
      raf = requestAnimationFrame(step);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // a trackpad already glides: small pixel steps pass straight through
      if (e.deltaMode === 0 && Math.abs(e.deltaY) < 50 && !raf) return;
      if (innerScroller(e.target as Element, page, e.deltaY)) return;
      e.preventDefault();
      if (!raf) target = set = page.scrollTop;
      const dy = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaMode === 2 ? e.deltaY * page.clientHeight : e.deltaY;
      target = Math.max(0, Math.min(page.scrollHeight - page.clientHeight, target + dy));
      if (!raf) raf = requestAnimationFrame(step);
    };

    let near: HTMLElement | null = null;
    const letGo = () => { if (near) near.style.translate = ''; near = null; };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = (e.target as Element).closest<HTMLElement>(MAGNETIC);
      if (el !== near) letGo();
      if (!el) return;
      near = el;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * 0.22;
      const y = (e.clientY - (r.top + r.height / 2)) * 0.32;
      el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    };

    page.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', letGo);
    return () => {
      cancelAnimationFrame(raf);
      letGo();
      page.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', letGo);
    };
  }, []);
  return null;
}
