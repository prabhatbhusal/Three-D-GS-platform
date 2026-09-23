'use client';

/* The marketing pages' scroll-driven footage, in the manner of XGRIDS' product
 * pages: a pinned canvas that scrubs an image sequence as you scroll, and a
 * sticky media panel that changes with the step you're reading. Footage comes
 * from src/lib/media.ts; a page only renders these when it has some. Styles
 * are in landing.css. */

import { useEffect, useRef, useState } from 'react';
import type { Media } from '../lib/media';

/** One photo or looping clip filling its box. The still is the video's poster
 *  and what reduced motion shows instead (landing.css hides the video). */
export function MediaFill({ m, lazy = false }: { m: Media; lazy?: boolean }) {
  return (
    <>
      {m.image && (
        // Plain <img>: static footage from /public, no optimiser in the static export.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="lp-fill" src={m.image} alt="" loading={lazy ? 'lazy' : 'eager'} decoding="async" />
      )}
      {m.video && (
        <video className="lp-fill lp-fill-video" src={m.video} poster={m.image}
          autoPlay muted loop playsInline preload={lazy ? 'none' : 'metadata'} aria-hidden />
      )}
    </>
  );
}

/** How far through a pinned section the scroll is, 0 at pin, 1 at release. */
function pinProgress(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const span = r.height - window.innerHeight;
  return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
}

/**
 * A pinned, full-screen canvas that plays an image sequence against the
 * scroll (one screen of scroll per caption). The first frame loads at once;
 * the rest stream in behind it in order, and until a frame arrives the
 * nearest earlier one stands in.
 */
export function FrameScrub({ frames, captions, label }: { frames: string[]; captions: React.ReactNode[]; label: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = ref.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const scroller = el.closest('.site') ?? window;
    const imgs: HTMLImageElement[] = [];
    let want = 0;
    let raf = 0;
    let alive = true;

    const draw = () => {
      raf = 0;
      let i = want;
      while (i > 0 && !imgs[i]?.naturalWidth) i--;
      const im = imgs[i];
      if (!im?.naturalWidth) return;
      // cover-fit, like background-size: cover
      const s = Math.max(canvas.width / im.naturalWidth, canvas.height / im.naturalHeight);
      const w = im.naturalWidth * s;
      const h = im.naturalHeight * s;
      ctx.drawImage(im, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      schedule();
    };
    const onScroll = () => {
      const p = pinProgress(el);
      want = Math.round(p * (frames.length - 1));
      setStep(Math.min(captions.length - 1, Math.floor(p * captions.length)));
      schedule();
    };

    // frame 0 now, then the rest four at a time, in order
    const load = (i: number) => new Promise<void>((done) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = im.onerror = () => { if (i <= want) schedule(); done(); };
      im.src = frames[i];
      imgs[i] = im;
    });
    (async () => {
      await load(0);
      for (let i = 1; alive && i < frames.length; i += 4) {
        await Promise.all([i, i + 1, i + 2, i + 3].filter((k) => k < frames.length).map(load));
      }
    })();

    fit();
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', fit);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', fit);
    };
  }, [frames, captions.length]);

  return (
    <section ref={ref} className="lp-scrub" style={{ height: `${(captions.length + 1) * 100}vh` }} aria-label={label}>
      <div className="lp-scrub-pin">
        <canvas ref={canvasRef} className="lp-scrub-canvas" aria-hidden />
        <div className="lp-scrub-shade" aria-hidden />
        {captions.map((c, i) => (
          <div key={i} className={`lp-scrub-cap${i === step ? ' is-on' : ''}`} aria-hidden={i !== step}>{c}</div>
        ))}
        <div className="lp-scrub-rail" aria-hidden>
          {captions.map((_, i) => <span key={i} className={i === step ? 'is-on' : undefined} />)}
        </div>
      </div>
    </section>
  );
}

/**
 * Steps on one side, their footage pinned on the other. The step nearest the
 * middle of the screen is current; its footage fades in and plays, the rest
 * pause. The tabs above jump to a step. Every step's text is ordinary HTML.
 */
export function StepMedia({ items }: { items: { title: string; media: Media | null; body: React.ReactNode }[] }) {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const mediaRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = stepRefs.current[0]?.closest('.site') ?? null;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
    }, { root, rootMargin: '-45% 0px -45% 0px' });
    stepRefs.current.forEach((li) => li && io.observe(li));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    // by slide, not by video: some steps are stills
    [...(mediaRef.current?.children ?? [])].forEach((slide, i) => {
      const v = slide.querySelector('video');
      if (v && i === active) v.play().catch(() => {});
      else v?.pause();
    });
    // on a phone the tab row scrolls sideways: keep the current tab in view
    const tabs = tabsRef.current;
    const tab = tabs?.children[active] as HTMLElement | undefined;
    if (tabs && tab) tabs.scrollTo({ left: tab.offsetLeft - (tabs.clientWidth - tab.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);

  const go = (i: number) => stepRefs.current[i]?.scrollIntoView({ block: 'center', behavior: 'smooth' });

  return (
    <div className="lp-steps">
      {/* sticky, and painted in the page colour so passing text fades under it */}
      <div className="lp-steps-bar">
        <div className="lp-steps-tabs" ref={tabsRef} role="tablist" aria-label="Steps">
          {items.map((it, i) => (
            <button key={it.title} type="button" role="tab" aria-selected={i === active}
              className={i === active ? 'is-on' : undefined} onClick={() => go(i)}>{it.title}</button>
          ))}
        </div>
      </div>
      <div className="lp-steps-grid">
        <div className="lp-steps-media" ref={mediaRef} aria-hidden>
          {items.map((it, i) => (
            <div key={it.title} className={`lp-steps-slide${i === active ? ' is-on' : ''}`}>
              {it.media ? <MediaFill m={it.media} lazy={i > 0} /> : <span className="lp-steps-ph">{String(i + 1).padStart(2, '0')}</span>}
            </div>
          ))}
        </div>
        <ol className="lp-steps-list">
          {items.map((it, i) => (
            <li key={it.title} data-i={i} ref={(li) => { stepRefs.current[i] = li; }} className={i === active ? 'is-on' : undefined}>
              {it.body}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
