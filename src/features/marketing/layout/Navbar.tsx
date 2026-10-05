'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, ViewTransition } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import { useSession } from '../../auth/useSession';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { AccountMenu } from './AccountMenu';
import { NavDrop, type DropKey } from './NavDrop';
import { ReachIcons } from './Reach';

// In page order: a link to the right of the current page slides the next
// page in from the right (nav-forward), one to the left from the left.
// A third entry gives the link a dropdown (NavDrop), opened by hover or by
// the chevron beside it.
const LINKS: [string, string, DropKey?][] = [
  ['/services', 'Services', 'services'], ['/work', 'Work', 'work'], ['/how-it-works', 'How it works'],
  ['/about', 'About'], ['/gallery', 'Live tours'], ['/contact', 'Contact']
];

/** The marketing site's floating nav: brand, page links (Services and Work
 *  open a dropdown), WhatsApp and call icons, and either Sign in and Book a
 *  capture (team sign-up is on the sign-in page) or the signed-in person's
 *  menu (AccountMenu). It sits in app/(site)/layout.tsx, so it stays on
 *  screen while pages change underneath it. Styles: site.css .site-nav,
 *  inner.css .drop. */
export function Navbar() {
  const pathname = usePathname();
  const here = LINKS.findIndex(([href]) => href === pathname);
  const navRef = useRef<HTMLElement | null>(null);
  const [user, setUser] = useSession();
  const [drop, setDrop] = useState<DropKey | null>(null);
  const shutTimer = useRef(0);
  const hold = () => window.clearTimeout(shutTimer.current);
  const shutSoon = () => { hold(); shutTimer.current = window.setTimeout(() => setDrop(null), 180); };
  const openOnHover = (k: DropKey) => (e: React.PointerEvent) => { if (e.pointerType === 'mouse') { hold(); setDrop(k); } };
  useClickOutside([navRef], () => setDrop(null));

  // The layout's .site is the scroll container and it persists across
  // pages, so a new page would open at the old one's scroll position.
  // Layout effect: before the view transition takes its new snapshot.
  useLayoutEffect(() => {
    navRef.current?.closest('.site')?.scrollTo({ top: 0, behavior: 'instant' });
    setDrop(null);
  }, [pathname]);

  // Esc shuts the dropdown and puts focus back on its chevron.
  useEffect(() => {
    if (!drop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      navRef.current?.querySelector<HTMLButtonElement>(`[aria-controls="drop-${drop}"]`)?.focus();
      setDrop(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drop]);

  // XGRIDS' merge: scrolling down past 200 px folds the pill to just the
  // mark and the links; any scroll up opens it again. Over a section marked
  // data-nav-dark (photos, the fly-through) the pill turns dark in either
  // theme. Attributes, not state: this runs every scrolled frame.
  useEffect(() => {
    const nav = navRef.current!;
    const scroller = nav.closest('.site')!;
    const links = nav.querySelector<HTMLElement>('.site-links')!;
    let last = scroller.scrollTop;
    let raf = 0;
    const measure = () => nav.style.setProperty('--merged-w', `${links.scrollWidth + 80}px`);
    const update = () => {
      raf = 0;
      const y = scroller.scrollTop;
      if (y <= 200) nav.removeAttribute('data-collapsed');
      else if (Math.abs(y - last) > 4) nav.toggleAttribute('data-collapsed', y > last);
      last = y;
      const r = nav.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      nav.toggleAttribute('data-over-dark', [...scroller.querySelectorAll('[data-nav-dark]')].some((el) => {
        const b = el.getBoundingClientRect();
        return mid >= b.top && mid < b.bottom;
      }));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    measure();
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, [pathname]);

  return (
    <header className="site-nav" ref={navRef}>
      <Link href="/" transitionTypes={['nav-back']} className="site-brand" aria-label="RCAAS.tech home">
        <span className="site-mark" aria-hidden />
        <span className="site-brand-word">RCAAS<span className="site-brand-tld">.tech</span></span>
      </Link>
      <nav className="site-links" aria-label="Main">
        {LINKS.map(([href, label, dk], i) => {
          const on = i === here;
          const link = (
            <Link
              key={href}
              href={href}
              transitionTypes={[i > here ? 'nav-forward' : 'nav-back']}
              aria-current={on ? 'page' : undefined}
              data-open={dk && drop === dk ? '' : undefined}
            >
              {/* One viewfinder, one name: React pairs it across the navigation
               *  and the browser glides it from the old link to the new one. */}
              {on && (
                <ViewTransition name="site-nav-pill" share="site-nav-pill" enter="site-nav-pill-in" exit="site-nav-pill-out" default="none">
                  <span className="site-links-pill" aria-hidden />
                </ViewTransition>
              )}
              <span className="site-links-label">{label}</span>
            </Link>
          );
          if (!dk) return link;
          return (
            <span key={href} className="site-drop-at" onPointerEnter={openOnHover(dk)} onPointerLeave={shutSoon}>
              {link}
              <button type="button" className="site-drop-btn" aria-expanded={drop === dk} aria-controls={`drop-${dk}`}
                aria-label={`${label}: show the list`} onClick={() => setDrop(drop === dk ? null : dk)}>
                <Icon name="expand" />
              </button>
            </span>
          );
        })}
      </nav>
      <div className="site-actions">
        {/* reload: the studio needs a full page load for its LCCRender singleton (§12) */}
        {user && <Button href="/studio" reload variant="primary">Open studio</Button>}
        <ReachIcons only={['WhatsApp', 'Call']} className="reach-nav" />
        {user ? (
          <AccountMenu user={user} onSignedOut={() => setUser(null)} />
        ) : (
          <>
            <Button href="/login" variant="quiet">Sign in</Button>
            <Button href="/contact" transitionTypes={['nav-forward']} variant="primary">Book a capture</Button>
          </>
        )}
      </div>
      <AnimatePresence>
        {drop && <NavDrop key={drop} which={drop} id={`drop-${drop}`} onEnter={hold} onLeave={shutSoon} onPick={() => setDrop(null)} />}
      </AnimatePresence>
    </header>
  );
}
