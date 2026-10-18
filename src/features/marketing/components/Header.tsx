import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { ArrowRight, ChevronDown, LayoutDashboard, Plus } from 'lucide-react';
import { RoutePath } from '../types';
import { PILLARS, INDUSTRIES } from '../data/siteData';
import { PILLAR_ICONS, industryIcon } from '../data/icons';
import { IMG } from '../data/images';
import { useSession } from '../../auth/useSession';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { AccountMenu } from './AccountMenu';
import { withBase } from '../../../lib/basePath';

/* The site's nav, in the earlier rcaas.tech site's design (2026-10-05/06)
 * with this site's pages and colours:
 *  - a floating glass pill; scrolling down past 200 px folds it to just the
 *    links, any scroll up opens it again; a scan line along its foot is drawn
 *    by the page's scroll;
 *  - the current page wears a viewfinder (four corner brackets) that glides
 *    from link to link; hover grows a faint pill from the middle;
 *  - What we create, Industries and About open a panel that unrolls like a
 *    curtain behind a scan line, framed by a viewfinder, items arriving one
 *    after another, the page dimmed behind;
 *  - up to 1240 px wide the links give way to a Menu button: the bar grows
 *    down into one card with the pages as numbered chapters.
 * Styles: rcaas.css "Nav" (.snav-*, .mnav-*). */

type DropKey = 'services' | 'industries' | 'about';

const PILLAR_SUBPAGES: Record<string, { label: string; path: RoutePath }[]> = {
  'immersive-experiences': [{ label: '3D virtual tours', path: '/services/immersive-experiences/3d-virtual-tours/' }],
  'digital-twins': [
    { label: '3D laser scanning', path: '/services/digital-twins/3d-laser-scanning/' },
    { label: 'Drone mapping', path: '/services/digital-twins/drone-mapping/' },
  ],
};

const ABOUT_GROUPS: { heading: string; items: { label: string; line: string; path: RoutePath }[] }[] = [
  {
    heading: 'Company',
    items: [
      { label: 'About us', line: 'Who we are and why we started', path: '/about/' },
      { label: 'How we work', line: 'From first call to launch', path: '/how-we-work/' },
      { label: 'Partner with us', line: 'Work alongside our team', path: '/about/#partner' as RoutePath },
      { label: 'Contact', line: 'Tell us about your place', path: '/contact/' },
    ],
  },
  {
    heading: 'Learn',
    items: [
      { label: 'Learn hub', line: 'Guides to 3D, VR and capture', path: '/learn/' },
      { label: 'Blog', line: 'Stories from the field', path: '/blog/' },
      { label: 'FAQ', line: 'Quick answers', path: '/faq/' },
    ],
  },
];

const ABOUT_SECTIONS = ['/about', '/how-we-work', '/learn', '/blog', '/faq', '/contact'];

const LINKS: { path: RoutePath; label: string; drop?: DropKey; on: (p: string) => boolean }[] = [
  { path: '/services/', label: 'What we create', drop: 'services', on: (p) => p.startsWith('/services') },
  { path: '/industries/', label: 'Industries', drop: 'industries', on: (p) => p.startsWith('/industries') },
  { path: '/work/', label: 'Our work', on: (p) => p.startsWith('/work') },
  { path: '/platform/', label: 'Platform', on: (p) => p.startsWith('/platform') },
  { path: '/gallery/', label: 'Live tours', on: (p) => p.startsWith('/gallery') },
  { path: '/about/', label: 'About', drop: 'about', on: (p) => ABOUT_SECTIONS.some((s) => p.startsWith(s)) },
];

const EASE = [0.22, 1, 0.36, 1] as const;

interface HeaderProps {
  currentPath: RoutePath;
  onNavigate: (path: RoutePath) => void;
  onOpenPlanner: () => void;
}

/** A real link (crawlable, opens in a new tab), moved in-app by the App's router. */
const NavLink: React.FC<
  { to: RoutePath; go: (p: RoutePath) => void } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>
> = ({ to, go, onClick, children, ...rest }) => (
  <a
    href={to}
    onClick={(e) => {
      onClick?.(e);
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      go(to);
    }}
    {...rest}
  >
    {children}
  </a>
);

export const Header: React.FC<HeaderProps> = ({ currentPath, onNavigate, onOpenPlanner }) => {
  const navRef = useRef<HTMLElement | null>(null);
  const linksRef = useRef<HTMLElement | null>(null);
  const [user, setUser] = useSession();
  const [drop, setDrop] = useState<DropKey | null>(null);
  const [menu, setMenu] = useState(false);
  const shutTimer = useRef(0);
  const hold = () => window.clearTimeout(shutTimer.current);
  const shutSoon = () => {
    hold();
    shutTimer.current = window.setTimeout(() => setDrop(null), 180);
  };
  const openOnHover = (k: DropKey) => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      hold();
      setDrop(k);
    }
  };
  useClickOutside([navRef], () => setDrop(null));

  const go = (path: RoutePath) => {
    setDrop(null);
    setMenu(false);
    onNavigate(path);
  };
  const plan = () => {
    setDrop(null);
    setMenu(false);
    onOpenPlanner();
  };

  // A new page shuts whatever was open.
  useEffect(() => {
    setDrop(null);
    setMenu(false);
  }, [currentPath]);

  // Esc shuts the panel or the menu, focus back on what opened it.
  useEffect(() => {
    if (!drop && !menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (drop) navRef.current?.querySelector<HTMLButtonElement>(`[aria-controls="snav-drop-${drop}"]`)?.focus();
      else navRef.current?.querySelector<HTMLButtonElement>('.snav-menu-btn')?.focus();
      setDrop(null);
      setMenu(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drop, menu]);

  // The open menu holds the page still under it.
  useEffect(() => {
    if (!menu) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menu]);

  // Fold on the way down, open on the way up. Attributes, not state: this runs every scrolled frame.
  useEffect(() => {
    const nav = navRef.current!;
    const links = linksRef.current!;
    let last = window.scrollY;
    let raf = 0;
    const measure = () => nav.style.setProperty('--merged-w', `${links.scrollWidth + 76}px`);
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      if (y <= 200) nav.removeAttribute('data-collapsed');
      else if (Math.abs(y - last) > 4) nav.toggleAttribute('data-collapsed', y > last);
      last = y;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    measure();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <>
      <header ref={navRef} className="snav" data-menu={menu ? '' : undefined}>
        <NavLink to="/" go={go} className="snav-brand" aria-label="RCAAS Technology, home">
          <span className="snav-mark" aria-hidden="true" />
          <img src={withBase('/logo.png')} alt="" width={522} height={106} className="snav-logo" />
        </NavLink>

        <nav ref={linksRef} className="snav-links" aria-label="Main">
          {LINKS.map((l) => {
            const on = l.on(currentPath);
            const link = (
              <NavLink
                key={l.path}
                to={l.path}
                go={go}
                aria-current={on ? 'page' : undefined}
                data-open={l.drop && drop === l.drop ? '' : undefined}
                className="snav-link"
              >
                {on && (
                  <motion.span
                    layoutId="snav-viewfinder"
                    className="snav-vf"
                    aria-hidden="true"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative">{l.label}</span>
              </NavLink>
            );
            if (!l.drop) return link;
            const dk = l.drop;
            return (
              <span key={l.path} className="snav-drop-at" onPointerEnter={openOnHover(dk)} onPointerLeave={shutSoon}>
                {link}
                <button
                  type="button"
                  className="snav-drop-btn"
                  aria-expanded={drop === dk}
                  aria-controls={`snav-drop-${dk}`}
                  aria-label={`${l.label}: show the list`}
                  onClick={() => setDrop(drop === dk ? null : dk)}
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${drop === dk ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </span>
            );
          })}
        </nav>

        <div className="snav-actions">
          {user ? (
            <AccountMenu user={user} onSignedOut={() => setUser(null)} compact />
          ) : (
            // plain <a>: the studio is its own app and needs a full page load
            <a href="/login" className="snav-quiet">
              Sign in
            </a>
          )}
          <button type="button" onClick={plan} className="snav-primary">
            Plan your experience
          </button>
        </div>

        <button
          type="button"
          className="snav-menu-btn"
          aria-expanded={menu}
          aria-controls="snav-menu"
          onClick={() => setMenu(!menu)}
        >
          <span className="snav-menu-word">{menu ? 'Close' : 'Menu'}</span>
          <span className="snav-menu-ic" aria-hidden="true">
            <i />
            <i />
          </span>
        </button>

        <AnimatePresence>
          {drop && <NavDrop key={drop} which={drop} go={go} onEnter={hold} onLeave={shutSoon} />}
        </AnimatePresence>
      </header>

      {/* the page dims behind an open panel; clicks pass through it (useClickOutside closes) */}
      <AnimatePresence>
        {drop && (
          <motion.div
            className="snav-scrim"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menu && (
          <MobileMenu
            currentPath={currentPath}
            go={go}
            plan={plan}
            signedIn={user ? user.name : null}
            onClose={() => setMenu(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

/* ------------------------------------------------------------------ panels */

const panel: Variants = {
  shut: { y: -6, clipPath: 'inset(0% 0% 100% 0% round 24px)', transition: { duration: 0.3, ease: EASE } },
  open: {
    y: 0,
    clipPath: 'inset(0% 0% 0% 0% round 24px)',
    transition: { duration: 0.5, ease: EASE, staggerChildren: 0.035, delayChildren: 0.12 },
  },
};
const rise: Variants = {
  shut: { opacity: 0, y: 14 },
  open: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

const itemCls =
  'group grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3.5 gap-y-1 rounded-2xl px-3.5 pb-4 pt-3.5 text-ink transition-colors duration-300 hover:bg-zinc-100/80 focus-visible:bg-zinc-100/80 focus-visible:outline-none';
const icCls =
  'row-span-2 mt-0.5 h-5 w-5 text-zinc-400 transition-[color,transform] duration-500 group-hover:-rotate-6 group-hover:scale-110 group-hover:text-accent';

const NavDrop: React.FC<{ which: DropKey; go: (p: RoutePath) => void; onEnter: () => void; onLeave: () => void }> = ({
  which,
  go,
  onEnter,
  onLeave,
}) => (
  <motion.div
    id={`snav-drop-${which}`}
    className="snav-drop"
    variants={panel}
    initial="shut"
    animate="open"
    exit="shut"
    onPointerEnter={onEnter}
    onPointerLeave={onLeave}
  >
    <span className="snav-drop-corners" aria-hidden="true" />

    {which === 'services' && (
      <>
        <ul className="grid grid-cols-2 gap-x-2.5 gap-y-1.5">
          {PILLARS.map((p) => {
            const Icon = PILLAR_ICONS[p.iconName];
            return (
              <motion.li key={p.id} variants={rise}>
                <NavLink to={p.link as RoutePath} go={go} className={itemCls}>
                  {Icon && <Icon className={icCls} aria-hidden="true" />}
                  <span className="text-sm font-bold tracking-tight font-display">{p.title}</span>
                  <span className="col-start-2 line-clamp-2 text-xs leading-relaxed text-muted">{p.promise}</span>
                </NavLink>
                {PILLAR_SUBPAGES[p.slug] && (
                  <div className="mb-1 ml-12 flex flex-wrap gap-1.5">
                    {PILLAR_SUBPAGES[p.slug].map((s) => (
                      <NavLink
                        key={s.path}
                        to={s.path}
                        go={go}
                        className="rounded-md border border-line px-2 py-1 text-[11px] font-mono text-zinc-600 transition-colors hover:border-accent hover:text-accent"
                      >
                        {s.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </motion.li>
            );
          })}
        </ul>
        <motion.aside variants={rise} className="grid content-start gap-3.5 pt-3.5">
          <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">See it working</p>
          <NavLink to="/gallery/" go={go} className="group relative block overflow-hidden rounded-xl bg-zinc-950">
            <img
              src={IMG['menu/live-tour-card']}
              alt=""
              className="aspect-[4/3] w-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105"
            />
            <span className="absolute inset-x-3 bottom-3 text-sm font-bold text-white font-display">Walk a live 3D tour</span>
          </NavLink>
          <NavLink to="/services/" go={go} className="snav-all">
            Everything we create <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </NavLink>
        </motion.aside>
      </>
    )}

    {which === 'industries' && (
      <>
        <ul className="grid grid-cols-3 gap-x-2.5 gap-y-1">
          {INDUSTRIES.map((ind) => {
            const Icon = industryIcon(ind.id);
            return (
              <motion.li key={ind.id} variants={rise}>
                <NavLink to={ind.link as RoutePath} go={go} className={itemCls}>
                  <Icon className={icCls} aria-hidden="true" />
                  <span className="text-[13px] font-bold tracking-tight font-display">{ind.title}</span>
                  <span className="col-start-2 line-clamp-1 text-[11px] text-muted">{ind.goalHeadline}</span>
                </NavLink>
              </motion.li>
            );
          })}
        </ul>
        <motion.aside variants={rise} className="grid content-start gap-3.5 pt-3.5">
          <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">Who it is for</p>
          <p className="text-[13px] leading-relaxed text-muted">
            Hotels, schools, developers, heritage sites, municipalities and more: one capture, shaped around what each needs
            people to do.
          </p>
          <NavLink to="/industries/" go={go} className="snav-all">
            All industries <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </NavLink>
        </motion.aside>
      </>
    )}

    {which === 'about' && (
      <>
        <div className="grid grid-cols-2 gap-x-8">
          {ABOUT_GROUPS.map((g) => (
            <div key={g.heading}>
              <motion.p variants={rise} className="px-3.5 pb-2 text-[11px] font-mono uppercase tracking-widest text-zinc-400">
                {g.heading}
              </motion.p>
              <ul className="grid gap-0.5">
                {g.items.map((it) => (
                  <motion.li key={it.label} variants={rise}>
                    <NavLink to={it.path} go={go} className="group block rounded-2xl px-3.5 py-2.5 transition-colors hover:bg-zinc-100/80">
                      <span className="block text-sm font-bold tracking-tight text-ink font-display transition-colors group-hover:text-accent">
                        {it.label}
                      </span>
                      <span className="block text-xs text-muted">{it.line}</span>
                    </NavLink>
                  </motion.li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <motion.aside variants={rise} className="grid content-start gap-3.5 pt-3.5">
          <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">Kathmandu · 27.72° N, 85.32° E</p>
          <p className="text-[13px] leading-relaxed text-muted">
            Engineers and game developers turning real places into experiences people can walk.
          </p>
          <NavLink to="/contact/" go={go} className="snav-all">
            Tell us about your place <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </NavLink>
        </motion.aside>
      </>
    )}
  </motion.div>
);

/* ------------------------------------------------------------- phone menu */

type Chapter = { path: RoutePath; label: string; on: (p: string) => boolean; sub?: { label: string; path: RoutePath }[] };

const CHAPTERS: Chapter[] = [
  {
    ...LINKS[0],
    sub: PILLARS.flatMap((p) => [{ label: p.title, path: p.link as RoutePath }, ...(PILLAR_SUBPAGES[p.slug] ?? [])]),
  },
  { ...LINKS[1], sub: INDUSTRIES.map((i) => ({ label: i.title, path: i.link as RoutePath })) },
  LINKS[2],
  LINKS[3],
  LINKS[4],
  { ...LINKS[5], sub: ABOUT_GROUPS.flatMap((g) => g.items.map(({ label, path }) => ({ label, path }))) },
];

const BAR = 56; // the bar's height: the card grows from it
const list: Variants = { open: { transition: { staggerChildren: 0.045, delayChildren: 0.16 } }, shut: {} };
const line: Variants = {
  shut: { opacity: 0, y: 18, filter: 'blur(8px)' },
  open: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, ease: EASE } },
};

const MobileMenu: React.FC<{
  currentPath: string;
  go: (p: RoutePath) => void;
  plan: () => void;
  signedIn: string | null;
  onClose: () => void;
}> = ({ currentPath, go, plan, signedIn, onClose }) => {
  const [unfolded, setUnfolded] = useState<string | null>(null);
  // Only ever mounted after a tap, so the window is there to measure.
  const shut = `inset(0px 0px ${Math.max(0, window.innerHeight - 20 - BAR)}px 0px round 22px)`;
  const full = 'inset(0px 0px 0px 0px round 22px)';

  return (
    <>
      <motion.div
        className="snav-mscrim"
        aria-hidden="true"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.25 } }}
      />
      <motion.div
        id="snav-menu"
        className="mnav"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        initial={{ clipPath: shut }}
        animate={{ clipPath: full, transition: { duration: 0.6, ease: EASE } }}
        exit={{ clipPath: shut, transition: { duration: 0.38, ease: EASE } }}
      >
        <span className="mnav-scan" aria-hidden="true" />
        <motion.nav className="mnav-body" aria-label="Pages" variants={list} initial="shut" animate="open">
          <ol>
            {CHAPTERS.map((c, i) => {
              const here = c.on(currentPath);
              const open = unfolded === c.path && !!c.sub;
              return (
                <motion.li key={c.path} variants={line} className="border-b border-line">
                  <div className="flex items-center gap-2">
                    <NavLink
                      to={c.path}
                      go={go}
                      aria-current={here ? 'page' : undefined}
                      className="flex flex-1 items-baseline gap-3.5 pb-3.5 pt-4 text-ink"
                    >
                      <span className={`-translate-y-[0.45em] font-mono text-[11px] tabular-nums ${here ? 'text-accent' : 'text-zinc-400'}`}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="mnav-t">
                        {c.label}
                        {here && <span className="ml-3 inline-block h-2 w-2 rounded-full bg-accent align-[0.35em]" aria-hidden="true" />}
                      </span>
                    </NavLink>
                    {c.sub && (
                      <button
                        type="button"
                        className="mnav-more"
                        aria-expanded={open}
                        aria-controls={`mnav-${i}`}
                        aria-label={`${c.label}: ${open ? 'hide' : 'show'} the list`}
                        onClick={() => setUnfolded(open ? null : c.path)}
                      >
                        <Plus className="h-5 w-5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {c.sub && (
                    <motion.ul
                      id={`mnav-${i}`}
                      className="overflow-hidden pl-8"
                      initial={false}
                      animate={open ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.45, ease: EASE }}
                      aria-hidden={!open}
                    >
                      {c.sub.map((s) => (
                        <li key={s.path + s.label} className="last:pb-3.5">
                          <NavLink
                            to={s.path}
                            go={go}
                            tabIndex={open ? 0 : -1}
                            className="block py-2 text-[15px] text-muted transition-colors hover:text-accent"
                          >
                            {s.label}
                          </NavLink>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </motion.li>
              );
            })}
          </ol>

          <motion.div variants={line} className="mt-auto grid gap-2.5 pt-7">
            <button type="button" onClick={plan} className="loro-btn-primary min-h-[50px] w-full text-[15px]">
              Plan your experience
            </button>
            {/* plain <a>: the studio is its own app and needs a full page load */}
            <a
              href={signedIn ? '/studio' : '/login'}
              className="loro-btn-secondary inline-flex min-h-[50px] w-full items-center justify-center gap-2 text-[15px] font-semibold"
            >
              {signedIn && <LayoutDashboard className="h-4 w-4 text-accent" aria-hidden="true" />}
              {signedIn ? 'Open studio' : 'Sign in'}
            </a>
            {signedIn && <p className="text-center text-xs text-muted">Signed in as {signedIn}</p>}
            <p className="mt-1 text-center font-mono text-[11px] tracking-wider text-zinc-400" aria-hidden="true">
              Kathmandu · 27.72° N, 85.32° E
            </p>
          </motion.div>
        </motion.nav>
      </motion.div>
    </>
  );
};
