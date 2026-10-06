'use client';
/** The nav on phones and tablets (up to 1240 px wide, 2026-10-06): the bar
 *  grows down into one card that holds the whole site. The pages as numbered chapters in large type, a
 *  scan line that passes down the card as it opens, Services and Work
 *  unfolding in place, and the ways to reach us at its foot. Navbar opens and
 *  closes it (a link, Esc and a new page close it too). Styles: site.css .mnav. */
import Link from 'next/link';
import { useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { SERVICES, STATUS, WORK } from '../siteContent';
import { OpenNow, ReachIcons } from './Reach';

type Chapter = { href: string; label: string; sub?: 'services' | 'work' };
const CHAPTERS: Chapter[] = [
  { href: '/services', label: 'Services', sub: 'services' }, { href: '/work', label: 'Work', sub: 'work' },
  { href: '/how-it-works', label: 'How it works' }, { href: '/gallery', label: 'Live tours' },
  { href: '/about', label: 'About' }, { href: '/contact', label: 'Contact' }
];

const EASE = [0.22, 1, 0.36, 1] as const;
const BAR = 56; // the bar's height: the card grows from it
const list: Variants = { open: { transition: { staggerChildren: 0.045, delayChildren: 0.16 } }, shut: {} };
const line: Variants = {
  shut: { opacity: 0, y: 18, filter: 'blur(8px)' },
  open: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, ease: EASE } }
};

export function MobileMenu({ pathname, signedIn, onClose }: { pathname: string; signedIn: boolean; onClose: () => void }) {
  const [unfolded, setUnfolded] = useState<Chapter['sub'] | null>(null);
  // The card fills the screen less a 10 px margin (site.css .mnav); it opens from just the bar.
  // Only ever mounted after a tap, so the window is there to measure.
  const shut = `inset(0px 0px ${Math.max(0, window.innerHeight - 20 - BAR)}px 0px round 22px)`;
  const full = 'inset(0px 0px 0px 0px round 22px)';

  return (
    <>
      <motion.div className="mnav-scrim" aria-hidden onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }} />
      <motion.div id="site-menu" className="mnav" role="dialog" aria-modal="true" aria-label="Menu"
        initial={{ clipPath: shut }}
        animate={{ clipPath: full, transition: { duration: 0.6, ease: EASE } }}
        exit={{ clipPath: shut, transition: { duration: 0.38, ease: EASE } }}>
        <span className="mnav-scan" aria-hidden />
        <motion.nav className="mnav-body" aria-label="Pages" variants={list} initial="shut" animate="open">
          <ol className="mnav-chapters">
            {CHAPTERS.map((c, i) => {
              const here = pathname === c.href;
              const open = unfolded === c.sub && !!c.sub;
              return (
                <motion.li key={c.href} variants={line} className={here ? 'is-here' : undefined}>
                  <div className="mnav-row">
                    <Link href={c.href} onClick={onClose} aria-current={here ? 'page' : undefined} className="mnav-link">
                      <span className="mnav-n" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                      <span className="mnav-t">{c.label}</span>
                    </Link>
                    {c.sub && (
                      <button type="button" className="mnav-more" aria-expanded={open} aria-controls={`mnav-${c.sub}`}
                        aria-label={`${c.label}: ${open ? 'hide' : 'show'} the list`} onClick={() => setUnfolded(open ? null : c.sub!)}>
                        <Icon name="add" />
                      </button>
                    )}
                  </div>
                  {c.sub && (
                    <motion.ul id={`mnav-${c.sub}`} className="mnav-sub" initial={false}
                      animate={open ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.45, ease: EASE }} aria-hidden={!open}>
                      {c.sub === 'services'
                        ? SERVICES.map((s) => (
                          <li key={s.k}>
                            <Link href={`/services#${s.k}`} onClick={onClose} tabIndex={open ? 0 : -1}>
                              <Icon name={s.ic} /><span>{s.tab}</span>
                            </Link>
                          </li>
                        ))
                        : WORK.map((w) => (
                          <li key={w.slug}>
                            <Link href={`/work#${w.slug}`} onClick={onClose} tabIndex={open ? 0 : -1}>
                              <span className={`drop-status is-${w.status}`} aria-hidden />
                              <span>{w.place}<small>{STATUS[w.status]}</small></span>
                            </Link>
                          </li>
                        ))}
                    </motion.ul>
                  )}
                </motion.li>
              );
            })}
          </ol>

          <motion.div className="mnav-foot" variants={line}>
            <Button href="/contact" variant="primary" className="mnav-cta" transitionTypes={['nav-forward']}>Book a capture</Button>
            {signedIn
              ? <Button href="/studio" reload variant="ghost" className="mnav-cta">Open studio</Button>
              : <Button href="/login" variant="ghost" className="mnav-cta">Sign in</Button>}
            <ReachIcons className="mnav-reach" />
            <OpenNow />
            <p className="mnav-coords" aria-hidden>Kathmandu · 27.72° N, 85.32° E</p>
          </motion.div>
        </motion.nav>
      </motion.div>
    </>
  );
}
