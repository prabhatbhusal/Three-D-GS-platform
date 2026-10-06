'use client';
/** The nav's two dropdown panels (2026-10-05): Services (the six things a
 *  scan becomes, and who they are for) and Work (the places we have
 *  measured). Navbar decides which is open; this draws it, framed by a
 *  viewfinder's four corners, with a scan line that passes down it once as it
 *  opens and its items arriving one after another: an icon or status, the
 *  name, a line and a small picture each. Styles: inner.css .drop. */
import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { Icon } from '../../../components/ui/Icon';
import { Pic } from '../../../components/ui/Pic';
import { SECTORS, SERVICES, STATUS, WORK, serviceImg, workImg } from '../siteContent';

export type DropKey = 'services' | 'work';

const EASE = [0.22, 1, 0.36, 1] as const;
// The panel is opaque from the first frame and unrolls downwards (a curtain, its
// scan line leading: inner.css .drop::after); it never fades, or the page
// would show through it. Its items rise in after the curtain has passed them.
const panel: Variants = {
  shut: { y: -6, clipPath: 'inset(0% 0% 100% 0% round 24px)', transition: { duration: 0.3, ease: EASE } },
  open: {
    y: 0, clipPath: 'inset(0% 0% 0% 0% round 24px)',
    transition: { duration: 0.5, ease: EASE, staggerChildren: 0.04, delayChildren: 0.12 }
  }
};
const item: Variants = {
  shut: { opacity: 0, y: 14 },
  open: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } }
};

export function NavDrop({ which, id, onEnter, onLeave, onPick }: {
  which: DropKey; id: string; onEnter: () => void; onLeave: () => void; onPick: () => void;
}) {
  return (
    <motion.div id={id} className="drop" variants={panel} initial="shut" animate="open" exit="shut"
      onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <span className="drop-corners" aria-hidden />
      {which === 'services' ? (
        <>
          <ul className="drop-grid">
            {SERVICES.map((s) => (
              <motion.li key={s.k} variants={item}>
                <Link href={`/services#${s.k}`} onClick={onPick} className="drop-item">
                  <Icon name={s.ic} className="drop-ic" />
                  <span className="drop-t">{s.title}</span>
                  <span className="drop-b">{s.body}</span>
                  <Pic src={serviceImg(s.k)} className="drop-pic" sizes="120px" />
                </Link>
              </motion.li>
            ))}
          </ul>
          <motion.aside className="drop-side" variants={item}>
            <p className="drop-k">Who it is for</p>
            <ul className="drop-sectors">
              {SECTORS.map((s) => <li key={s.t}><Icon name={s.ic} />{s.t}</li>)}
            </ul>
            <Link href="/services" onClick={onPick} className="drop-all">All services <Icon name="arrow" /></Link>
          </motion.aside>
        </>
      ) : (
        <>
          <ul className="drop-grid drop-grid-work">
            {WORK.map((w) => (
              <motion.li key={w.slug} variants={item}>
                <Link href={`/work#${w.slug}`} onClick={onPick} className="drop-item">
                  <span className={`drop-status is-${w.status}`}>{STATUS[w.status]}</span>
                  <span className="drop-t drop-t-lg">{w.place}</span>
                  <span className="drop-b">{w.where}</span>
                  <Pic src={workImg(w.slug)} className="drop-pic" sizes="120px" />
                </Link>
              </motion.li>
            ))}
          </ul>
          <motion.aside className="drop-side" variants={item}>
            <p className="drop-k">The field log</p>
            <p className="drop-blurb">From a 576 m overpass in traffic to the classroom next door, measured to ±1.2 cm.</p>
            <Link href="/work" onClick={onPick} className="drop-all">All work <Icon name="arrow" /></Link>
            <Link href="/gallery" onClick={onPick} className="drop-all">Walk a live tour <Icon name="walk" /></Link>
          </motion.aside>
        </>
      )}
    </motion.div>
  );
}
