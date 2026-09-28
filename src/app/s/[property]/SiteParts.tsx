'use client';

import { useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { EnquiryPanel } from '../../../components/EnquiryPanel';

gsap.registerPlugin(useGSAP);

const TOUR_ID = 'ws-tour';

/** The published tour, embedded as-is (its own page, its own 3D). */
export function SiteTour({ src, title }: { src: string; title: string }) {
  return (
    <iframe id={TOUR_ID} className="ws-tour" src={src} title={`${title}, live 3D tour`}
      allow="fullscreen; xr-spatial-tracking" allowFullScreen />
  );
}

/** Scrolls up to the tour and sends it to this room's view (Viewer.tsx listens). */
export function ViewIn3D({ space, view }: { space: string; view: string }) {
  return (
    <button type="button" className="ws-link" onClick={() => {
      const frame = document.getElementById(TOUR_ID) as HTMLIFrameElement | null;
      if (!frame) return;
      frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
      frame.contentWindow?.postMessage({ type: 'rcaas:view', space, view }, location.origin);
    }}>
      View in 3D <span aria-hidden>→</span>
    </button>
  );
}

/** Down to the room booking (#stay) with this room picked (RoomBooking listens). */
export function BookThisRoom({ room }: { room: string }) {
  return (
    <a className="ws-link" href="#stay" onClick={() => window.dispatchEvent(new CustomEvent('rcaas:stay', { detail: room }))}>
      Book this room <span aria-hidden>→</span>
    </a>
  );
}

/** The contact section's button and the enquiry sheet (the tour's own form). */
export function SiteEnquire({ project, name, preview = false }: { project: string; name: string; preview?: boolean }) {
  const [open, setOpen] = useState(false);
  // In the studio's preview no enquiry is sent: the form waits for Publish.
  if (preview) return <button type="button" className="ws-btn" disabled title="Works once the website is published">Send an enquiry</button>;
  return (
    <>
      <button type="button" className="ws-btn" onClick={() => setOpen(true)}>Send an enquiry</button>
      <EnquiryPanel sceneId="hub" sceneName={`${name} (website)`} propertyId={project}
        label="Enquire" open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * Sections rise in as they come into view; fades only with reduced motion.
 * The browser's IntersectionObserver says when (it copes with the header's
 * jump links and with photos loading late, where scroll positions measured
 * up front go stale); GSAP does the motion, a few at a time in a stagger.
 * A busy phone reports only now and then, and a fast flick can pass a whole
 * section between reports, so each report reveals everything that is up to
 * the bottom of the screen by now, not just what it names.
 */
export function SiteReveal() {
  useGSAP((_, contextSafe) => {
    const root = document.querySelector('.ws');
    const items = gsap.utils.toArray<HTMLElement>('.ws-reveal');
    if (!root || !items.length || !contextSafe) return;
    const full = matchMedia('(prefers-reduced-motion: no-preference)').matches;
    // opacity, not autoAlpha: a visibility:hidden section never loads its lazy photos
    gsap.set(items, { opacity: 0, y: full ? 40 : 0 });
    const show = contextSafe((els: Element[]) =>
      gsap.to(els, { opacity: 1, y: 0, duration: full ? 0.9 : 0.5, stagger: 0.1, ease: 'power3.out' }));
    const waiting = new Set<Element>(items);
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      const { top, bottom } = root.getBoundingClientRect();
      const due = [...waiting].filter((el) => el.getBoundingClientRect().top < bottom);
      due.forEach((el) => { waiting.delete(el); io.unobserve(el); });
      // Already scrolled past (a jump link): just there. On screen: rises in.
      const past = due.filter((el) => el.getBoundingClientRect().bottom < top);
      if (past.length) gsap.set(past, { opacity: 1, y: 0 });
      const now = due.filter((el) => !past.includes(el));
      if (now.length) show(now);
    }, { root, rootMargin: '0px 0px -8% 0px' });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
  return null;
}
