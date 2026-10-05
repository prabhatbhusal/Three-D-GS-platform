'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, ViewTransition } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from '../../auth/useSession';
import { Button } from '../../../components/ui/Button';
import { AccountMenu } from './AccountMenu';
import { COMPANY } from '../siteContent';

const WHATSAPP = `https://wa.me/${COMPANY.phone.replace(/\D/g, '')}?text=${encodeURIComponent('Hello RCAAS, I would like to ask about a capture.')}`;

// In page order: a link to the right of the current page slides the next
// page in from the right (nav-forward), one to the left from the left.
const LINKS = [
  ['/work', 'Work'], ['/services', 'Services'], ['/how-it-works', 'How it works'],
  ['/about', 'About'], ['/gallery', 'Gallery'], ['/contact', 'Contact']
] as const;

/** The marketing site's floating nav: brand, page links, theme switch, and
 *  either Sign in and Book a capture (team sign-up is on the sign-in page) or the signed-in person's menu
 *  (AccountMenu). It sits in app/(site)/layout.tsx, so it stays on screen
 *  while pages change underneath it. Styles: site.css .site-nav. */
export function Navbar() {
  const pathname = usePathname();
  const here = LINKS.findIndex(([href]) => href === pathname);
  const navRef = useRef<HTMLElement | null>(null);
  const [user, setUser] = useSession();

  // The layout's .site is the scroll container and it persists across
  // pages, so a new page would open at the old one's scroll position.
  // Layout effect: before the view transition takes its new snapshot.
  useLayoutEffect(() => {
    navRef.current?.closest('.site')?.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

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
        {LINKS.map(([href, label], i) => {
          const on = i === here;
          return (
            <Link
              key={href}
              href={href}
              transitionTypes={[i > here ? 'nav-forward' : 'nav-back']}
              aria-current={on ? 'page' : undefined}
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
        })}
      </nav>
      <div className="site-actions">
        {/* reload: the studio needs a full page load for its LCCRender singleton (§12) */}
        {user && <Button href="/studio" reload variant="primary">Open studio</Button>}
        <a className="site-wa" href={WHATSAPP} target="_blank" rel="noopener noreferrer">
          <span className="site-wa-dot" aria-hidden />WhatsApp us
        </a>
        {user ? (
          <AccountMenu user={user} onSignedOut={() => setUser(null)} />
        ) : (
          <>
            <Button href="/login" variant="quiet">Sign in</Button>
            <Button href="/contact" transitionTypes={['nav-forward']} variant="primary">Book a capture</Button>
          </>
        )}
      </div>
    </header>
  );
}
