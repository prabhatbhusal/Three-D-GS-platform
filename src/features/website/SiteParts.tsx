'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
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
 * How a client's website moves (2026-10-07, replaced the fade-up on every
 * section). One orchestrated opening, then motion only where it says
 * something, all on GSAP (ScrollTrigger, SplitText) with .ws as the scroller:
 *   - opening, once per visit: a curtain in the ink colour with the name,
 *     which lifts; the headline's lines rise out of masks, then the words
 *     under it, the buttons and the figures; the photo settles from 1.12;
 *   - headings rise line by line out of masks as they arrive;
 *   - photos open from the bottom (clip-path) while the picture inside
 *     settles from a slight zoom;
 *   - the live tour's window grows to full size as it scrolls in, and the
 *     opening photo drifts slower than the page (parallax).
 * With reduced motion nothing moves: everything is simply there.
 * Styles: website.css .wsm-.
 */
export function SiteReveal() {
  const [curtain, setCurtain] = useState<string | null>(null);
  useGSAP(() => {
    const ws = document.querySelector<HTMLElement>('.ws');
    if (!ws || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.registerPlugin(ScrollTrigger, SplitText);
    ScrollTrigger.defaults({ scroller: ws });
    ws.classList.add('wsm-on');

    // the opening plays once per visit (this tab), on the hub only
    let first = false;
    try { first = !!ws.querySelector('.ws-hero') && !sessionStorage.getItem('ws-intro'); sessionStorage.setItem('ws-intro', '1'); } catch { /* storage off: no curtain */ }
    const name = ws.querySelector('.wsn-word')?.textContent ?? '';
    if (first && name) setCurtain(name);
    else delete document.documentElement.dataset.wsIntro;

    const lines = (el: Element) => SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'wsm-line', autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, { yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: 0.09,
        scrollTrigger: el.closest('.ws-hero') ? undefined : { trigger: el, start: 'top 88%', once: true },
        delay: el.closest('.ws-hero') ? (first ? 1.35 : 0.15) : 0 }) });

    document.fonts.ready.then(() => {
      // the opening
      const hero = ws.querySelector('.ws-hero');
      if (hero) {
        const h1 = hero.querySelector('h1');
        if (h1) lines(h1);
        const after = hero.querySelectorAll('.ws-eyebrow, .ws-lede, .ws-hero-ctas, .ws-facts > div');
        gsap.from(after, { opacity: 0, y: 24, duration: 0.9, ease: 'power3.out', stagger: 0.07, delay: first ? 1.6 : 0.35 });
        const img = hero.querySelector('.ws-hero-img');
        if (img) {
          gsap.fromTo(img, { scale: 1.12 }, { scale: 1, duration: 2.2, ease: 'expo.out', delay: first ? 0.9 : 0 });
          gsap.to(img, { yPercent: 12, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
        }
      }

      // headings, line by line
      ws.querySelectorAll('.ws-head h2, .ws-space-txt h1, .ws-strip p, .ws-others h2, .ws-contact h2, .ws-room-txt h3').forEach(lines);

      // photos open from the bottom
      ws.querySelectorAll('.ws-room-img, .ws-offer-img, .ws-hl, .ws-other, .ws-space-photos img, .ws-gallery button').forEach((el) => {
        const pic = el.matches('img') ? null : el.querySelector('img');
        const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
        tl.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.inOut' });
        if (pic) tl.fromTo(pic, { scale: 1.25 }, { scale: 1, duration: 1.6, ease: 'expo.out' }, 0.1);
      });

      // the live tour's window grows into place
      ws.querySelectorAll('.ws-window').forEach((el) => {
        gsap.fromTo(el, { scale: 0.88, borderRadius: 40 }, { scale: 1, borderRadius: 22, ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 35%', scrub: 0.6 } });
      });
      ScrollTrigger.refresh();
    });
    return () => { ws.classList.remove('wsm-on'); ScrollTrigger.defaults({ scroller: window }); };
  });

  return curtain ? <Curtain name={curtain} onDone={() => setCurtain(null)} /> : null;
}

/** The opening's curtain: the name rises letter by letter, then the ink lifts off the page. */
function Curtain({ name, onDone }: { name: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const el = ref.current!;
    delete document.documentElement.dataset.wsIntro; // the curtain itself covers the page now
    const chars = el.querySelectorAll('.wsm-ch');
    gsap.timeline({ onComplete: onDone })
      .from(chars, { yPercent: 120, duration: 0.8, ease: 'expo.out', stagger: 0.025 })
      .to(chars, { yPercent: -120, duration: 0.55, ease: 'expo.in', stagger: 0.012 }, '+=0.25')
      .to(el, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.9, ease: 'expo.inOut' }, '-=0.2');
  }, { scope: ref });
  return (
    <div ref={ref} className="wsm-curtain" aria-hidden>
      <p>{[...name].map((c, i) => <span key={i} className="wsm-ch">{c === ' ' ? ' ' : c}</span>)}</p>
    </div>
  );
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
