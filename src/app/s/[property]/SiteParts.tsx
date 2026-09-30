'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
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

/** Down to the event booking (#events) with this hall picked (EventBooking listens). */
export function BookThisHall({ hall }: { hall: string }) {
  return (
    <a className="ws-link" href="#events" onClick={() => window.dispatchEvent(new CustomEvent('rcaas:hall', { detail: hall }))}>
      Book this hall <span aria-hidden>→</span>
    </a>
  );
}

/** Opens the page's enquiry form (SiteEnquire) about this offer. */
export function AskAbout({ offer, preview = false }: { offer: string; preview?: boolean }) {
  return (
    <button type="button" className="ws-btn ws-btn-ghost" disabled={preview} title={preview ? 'Works once the website is published' : undefined}
      onClick={() => window.dispatchEvent(new CustomEvent('rcaas:ask', { detail: offer }))}>
      Ask about this offer
    </button>
  );
}

type Photo = { src: string; width: number; height: number };

/**
 * The photos: the client's own, in a masonry, each opening full size in a
 * lightbox. The browser's <dialog> does the hard parts (Esc closes it, focus
 * goes back to the photo); arrows and a click outside the photo do the rest.
 */
export function SiteGallery({ photos, name }: { photos: Photo[]; name: string }) {
  const box = useRef<HTMLDialogElement>(null);
  const [at, setAt] = useState(0);
  const step = (d: number) => setAt((i) => (i + d + photos.length) % photos.length);
  const shown = photos[at];
  return (
    <>
      <div className="ws-gallery">
        {photos.map((p, i) => (
          <button key={p.src} type="button" onClick={() => { setAt(i); box.current?.showModal(); }} aria-label={`Open photo ${i + 1} of ${photos.length}`}>
            <Image {...p} alt="" sizes="(max-width: 760px) 100vw, (max-width: 1240px) 50vw, 420px" />
          </button>
        ))}
      </div>
      <dialog ref={box} className="ws-lightbox" aria-label={`${name}: photos`}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); }}
        onClick={(e) => { if (e.target === e.currentTarget) box.current?.close(); }}>
        {shown && <Image key={shown.src} {...shown} alt={`Photo ${at + 1} of ${photos.length}`} sizes="100vw" />}
        {photos.length > 1 && (
          <>
            <button type="button" className="ws-lb-prev" onClick={() => step(-1)} aria-label="Previous photo">‹</button>
            <button type="button" className="ws-lb-next" onClick={() => step(1)} aria-label="Next photo">›</button>
          </>
        )}
        <button type="button" className="ws-lb-x" onClick={() => box.current?.close()} aria-label="Close">✕</button>
        <p className="ws-lb-count" aria-live="polite">{at + 1} / {photos.length}</p>
      </dialog>
    </>
  );
}

/**
 * The contact section's button and the enquiry sheet (the tour's own form).
 * An offer's "Ask about this offer" (AskAbout) opens it too, and the enquiry
 * then says which offer the guest was looking at.
 */
export function SiteEnquire({ project, name, preview = false, whatsapp }: { project: string; name: string; preview?: boolean; whatsapp?: string }) {
  const [open, setOpen] = useState(false);
  const [offer, setOffer] = useState('');
  useEffect(() => {
    const ask = (e: Event) => { setOffer((e as CustomEvent<string>).detail); setOpen(true); };
    window.addEventListener('rcaas:ask', ask);
    return () => window.removeEventListener('rcaas:ask', ask);
  }, []);
  // In the studio's preview no enquiry is sent: the form waits for Publish.
  if (preview) return <button type="button" className="ws-btn" disabled title="Works once the website is published">Send an enquiry</button>;
  return (
    <>
      <button type="button" className="ws-btn" onClick={() => { setOffer(''); setOpen(true); }}>Send an enquiry</button>
      <EnquiryPanel sceneId="hub" sceneName={offer ? `${name}: ${offer}` : `${name} (website)`} propertyId={project}
        hotspot={offer ? { id: 'offer', label: `the offer “${offer}”` } : null}
        label="Enquire" whatsapp={whatsapp} open={open} onOpenChange={setOpen} />
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
