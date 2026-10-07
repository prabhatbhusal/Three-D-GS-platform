'use client';
/** A client website's nav (2026-10-07), the marketing site's (marketing/layout
 *  Navbar + MobileMenu) in the client's own colour, font and sections: a
 *  floating plain white pill with the brand, the top sections, call and WhatsApp
 *  icons and the main button; a viewfinder on the section in view; scrolling
 *  down folds it to the links, scrolling up opens it; a scan line along its
 *  foot drawn by the page's scroll. Up to 960 px wide a Menu button grows the
 *  bar into one card with every chapter numbered. Styles: website.css .wsn. */
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { Icon } from '../../components/ui/Icon';

type Reach = { call?: string; whatsapp?: string };

const EASE = [0.22, 1, 0.36, 1] as const;
const BAR = 56;
const list: Variants = { open: { transition: { staggerChildren: 0.045, delayChildren: 0.16 } }, shut: {} };
const line: Variants = {
  shut: { opacity: 0, y: 18, filter: 'blur(8px)' },
  open: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, ease: EASE } }
};

export function SiteNav({ name, logo, base = '', top, chapters, cta, reach }: {
  name: string; logo: string | null;
  /** On a space page, the hub's address: the brand and the menu card's chapters link back to it. */
  base?: string;
  /** The bar's links, five at most ('#stay', 'Stay'). */
  top: [string, string][];
  /** Every chapter, in page order ('stay', 'Stay'): the menu card's list. */
  chapters: [string, string][];
  cta: [string, string];
  reach: Reach;
}) {
  const navRef = useRef<HTMLElement>(null);
  const [here, setHere] = useState('');
  const [menu, setMenu] = useState(false);
  const [dark, setDark] = useState<boolean | null>(null);

  // The visitor's light or dark choice, remembered in this browser; first visit: the site's own look.
  useEffect(() => {
    const ws = navRef.current?.closest<HTMLElement>('.ws');
    let saved: string | null = null;
    try { saved = localStorage.getItem('ws-mode'); } catch { /* private window: the site's own look */ }
    setDark(saved ? saved === 'dark' : ws?.dataset.style === 'night');
  }, []);
  useEffect(() => {
    if (dark === null) return;
    navRef.current?.closest<HTMLElement>('.ws')?.setAttribute('data-mode', dark ? 'dark' : 'light');
  }, [dark]);
  const flip = () => {
    const next = !dark;
    setDark(next);
    try { localStorage.setItem('ws-mode', next ? 'dark' : 'light'); } catch { /* not remembered */ }
  };

  // Fold on the way down, open on the way up; and which chapter is in view.
  // Attributes for the fold (every scrolled frame), state only when the chapter changes.
  useEffect(() => {
    const nav = navRef.current!;
    const scroller = nav.closest<HTMLElement>('.ws');
    if (!scroller) return;
    const links = nav.querySelector<HTMLElement>('.wsn-links');
    let last = scroller.scrollTop;
    let raf = 0;
    const measure = () => { if (links) nav.style.setProperty('--merged-w', `${links.scrollWidth + 28}px`); };
    const update = () => {
      raf = 0;
      const y = scroller.scrollTop;
      if (y <= 200) nav.removeAttribute('data-collapsed');
      else if (Math.abs(y - last) > 4) nav.toggleAttribute('data-collapsed', y > last);
      last = y;
      // the last chapter whose top has passed under the bar
      let at = '';
      for (const [id] of chapters) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= BAR + 60) at = id;
      }
      setHere(at);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    measure();
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); scroller.removeEventListener('scroll', onScroll); window.removeEventListener('resize', measure); };
  }, [chapters]);

  // The open card holds the page still under it; Esc closes it, focus back on its button.
  useEffect(() => {
    if (!menu) return;
    const ws = navRef.current?.closest<HTMLElement>('.ws');
    ws?.setAttribute('data-sheet', '');
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenu(false);
      navRef.current?.querySelector<HTMLButtonElement>('.wsn-menu-btn')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => { ws?.removeAttribute('data-sheet'); document.removeEventListener('keydown', onKey); };
  }, [menu]);

  const icons = (
    <>
      {reach.call && <a className="wsn-ic" href={reach.call} aria-label="Call us"><Icon name="call" /></a>}
      {reach.whatsapp && (
        <a className="wsn-ic" href={reach.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp"><Icon name="chat" /></a>
      )}
    </>
  );

  return (
    <>
      <header className="wsn" ref={navRef} data-menu={menu ? '' : undefined}>
        <a className="wsn-brand" href={base || '#top'} onClick={() => setMenu(false)}>
          {logo && <Image src={logo} alt="" width={200} height={72} sizes="120px" className="wsn-logo" />}
          <span className="wsn-word">{name}</span>
        </a>
        <nav className="wsn-links" aria-label="Sections">
          {top.map(([href, label]) => {
            const on = href === `#${here}`;
            return (
              <a key={href} href={href} aria-current={on ? 'location' : undefined}>
                {on && <span className="wsn-pill" aria-hidden />}
                {label}
              </a>
            );
          })}
        </nav>
        <button type="button" className="wsn-ic wsn-mode" onClick={flip} aria-label={dark ? 'Switch to light' : 'Switch to dark'} title={dark ? 'Light' : 'Dark'}>
          {dark ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
              <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />
            </svg>
          )}
        </button>
        <div className="wsn-actions">
          {icons}
          <a className="ws-btn wsn-cta" href={cta[0]}>{cta[1]}</a>
        </div>
        <button type="button" className="wsn-menu-btn" aria-expanded={menu} aria-controls="wsn-menu" onClick={() => setMenu(!menu)}>
          <span className="wsn-menu-word">{menu ? 'Close' : 'Menu'}</span>
          <span className="ws-menu-ic" aria-hidden><i /><i /></span>
        </button>
      </header>

      <AnimatePresence>
        {menu && <MenuCard name={name} base={base} chapters={chapters} here={here} cta={cta} icons={icons} onClose={() => setMenu(false)} />}
      </AnimatePresence>
    </>
  );
}

/** The bar grown down into one card: every chapter numbered, the main button and the icons at its foot. */
function MenuCard({ name, base, chapters, here, cta, icons, onClose }: {
  name: string; base: string; chapters: [string, string][]; here: string; cta: [string, string]; icons: React.ReactNode; onClose: () => void;
}) {
  // the card fills the screen less a 10 px margin; it opens from just the bar (mounted only after a tap)
  const shut = `inset(0px 0px ${Math.max(0, window.innerHeight - 20 - BAR)}px 0px round 22px)`;
  const full = 'inset(0px 0px 0px 0px round 22px)';
  return (
    <>
      <motion.div className="wsn-scrim" aria-hidden onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }} />
      <motion.div id="wsn-menu" className="wsn-card" role="dialog" aria-modal="true" aria-label={`${name}: sections`}
        initial={{ clipPath: shut }}
        animate={{ clipPath: full, transition: { duration: 0.6, ease: EASE } }}
        exit={{ clipPath: shut, transition: { duration: 0.38, ease: EASE } }}>
        <span className="wsn-scan" aria-hidden />
        <motion.nav className="wsn-body" aria-label="Sections" variants={list} initial="shut" animate="open">
          <ol className="wsn-chapters">
            {chapters.map(([id, label], i) => (
              <motion.li key={id} variants={line} className={id === here ? 'is-here' : undefined}>
                <a href={`${base}#${id}`} onClick={onClose} aria-current={id === here ? 'location' : undefined}>
                  <span className="wsn-n" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                  <span className="wsn-t">{label}</span>
                </a>
              </motion.li>
            ))}
          </ol>
          <motion.div className="wsn-foot" variants={line}>
            <a className="ws-btn wsn-card-cta" href={cta[0]} onClick={onClose}>{cta[1]}</a>
            <div className="wsn-foot-icons">{icons}</div>
          </motion.div>
        </motion.nav>
      </motion.div>
    </>
  );
}
