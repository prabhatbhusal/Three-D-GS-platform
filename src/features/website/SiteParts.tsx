'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { EnquiryPanel } from '../enquiry/EnquiryPanel';
import { submitLead } from '../../lib/api';

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
/** The Google map beside the contact section, loaded only when the visitor
 *  asks: until then Google sets no cookies on them (the /cookies page says so). */
export function SiteMap({ address }: { address: string }) {
  const [on, setOn] = useState(false);
  if (on) {
    return (
      <iframe className="ws-map" title={`Map: ${address}`} referrerPolicy="no-referrer-when-downgrade"
        src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`} />
    );
  }
  return (
    <button type="button" className="ws-map ws-map-off" onClick={() => setOn(true)}>
      <b>Show map</b>
      <span>{address}</span>
      <small>Loads Google Maps</small>
    </button>
  );
}

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
export function SiteEnquire({ project, name, preview = false, whatsapp, enquiries = true }: { project: string; name: string; preview?: boolean; whatsapp?: string; enquiries?: boolean }) {
  const [open, setOpen] = useState(false);
  const [offer, setOffer] = useState('');
  useEffect(() => {
    const ask = (e: Event) => { setOffer((e as CustomEvent<string>).detail); setOpen(true); };
    window.addEventListener('rcaas:ask', ask);
    return () => window.removeEventListener('rcaas:ask', ask);
  }, []);
  // A project that takes no enquiries (its features): no form. The page already offers its WhatsApp
  // (the floating button, the contact list) and its other contact details.
  if (!enquiries) return null;
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

/**
 * The space page's enquiry, open on the page (2026-10-07, the owner's plan):
 * name, phone or email, what it's about (this space chosen), the date and how
 * many guests, Send. The same lead as every other form (POST /api/leads):
 * the hidden "website" field and the fill time keep bots out.
 */
export function SpaceEnquiry({ project, space, title, preview = false }: { project: string; space: string; title: string; preview?: boolean }) {
  const REQ = [`This space: ${title}`, 'Room booking', 'Meeting or event space', 'General enquiry'];
  const [v, setV] = useState({ name: '', reach: '', requirement: REQ[0], date: '', guests: '', website: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [renderedAt] = useState(() => Date.now());
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim() || !v.reach.trim()) return setError('Add your name and a phone number or email so we can reach you.');
    setStatus('sending');
    setError('');
    const email = v.reach.includes('@') ? v.reach.trim() : '';
    try {
      await submitLead({
        name: v.name, phone: v.reach.trim(), email, requirement: v.requirement,
        dates: [v.date, v.guests && `${v.guests} guests`].filter(Boolean).join(' · '),
        sceneId: space, sceneName: title, propertyId: project, website: v.website, formRenderedAt: renderedAt
      });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'That didn’t go through. Check your connection and try again.');
    }
  };

  if (status === 'done') return <p className="ws-ask-done" role="status">Thank you. We’ll be in touch within a working day.</p>;
  return (
    <form className="ws-ask-form" onSubmit={send} noValidate>
      <input aria-label="Name" placeholder="Name" maxLength={100} value={v.name} onChange={set('name')} autoComplete="name" />
      <input aria-label="Phone or email" placeholder="Phone or email" maxLength={30} value={v.reach} onChange={set('reach')} autoComplete="tel" />
      <select aria-label="What it’s about" value={v.requirement} onChange={set('requirement')}>
        {REQ.map((r) => <option key={r}>{r}</option>)}
      </select>
      <div className="ws-ask-row">
        <input type="date" aria-label="Date" value={v.date} onChange={set('date')} />
        <input type="number" min={1} max={2000} aria-label="Guests" placeholder="Guests" value={v.guests} onChange={set('guests')} />
      </div>
      {/* a person never sees or fills this; a bot does */}
      <input className="ws-hp" tabIndex={-1} autoComplete="off" aria-hidden name="website" value={v.website} onChange={set('website')} />
      {error && <p className="ws-ask-err" role="alert">{error}</p>}
      <button className="ws-btn" type="submit" disabled={preview || status === 'sending'} title={preview ? 'Works once the website is published' : undefined}>
        {status === 'sending' ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
