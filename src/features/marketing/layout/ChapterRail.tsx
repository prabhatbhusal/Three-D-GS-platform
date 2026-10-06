'use client';
/** The chapter rail (2026-10-06), after lightweight.info's "01 Philosophy,
 *  02 Craft": on a wide screen, a page's parts down its left edge, numbered,
 *  with a line that fills as you read and the part you're in lit. A tap goes
 *  there. A page opts in by marking its parts `data-chapter="Name"`; with
 *  fewer than three it stays away. The scroll gauge (SiteGsap) is its
 *  partner on the right. `root`: the page's scroll container (the marketing
 *  pages' .site, a client website's .ws). Styles: rail.css. */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import './rail.css';

export function ChapterRail({ root = '.site' }: { root?: string }) {
  const pathname = usePathname();
  const [parts, setParts] = useState<{ el: HTMLElement; name: string }[]>([]);
  const [here, setHere] = useState(0);

  useEffect(() => {
    let off = () => {};
    // after the new page has rendered its parts
    const t = window.setTimeout(() => {
      const site = document.querySelector<HTMLElement>(root);
      if (!site) return;
      const found = [...site.querySelectorAll<HTMLElement>('[data-chapter]')].map((el) => ({ el, name: el.dataset.chapter! }));
      setParts(found);
      setHere(0);
      if (found.length < 3) return;
      // the part crossing a line a third of the way down the screen
      const onScroll = () => {
        const line = window.innerHeight / 3;
        let i = 0;
        found.forEach((p, k) => { if (p.el.getBoundingClientRect().top <= line) i = k; });
        setHere(i);
        site.style.setProperty('--rail-p', String(site.scrollTop / Math.max(1, site.scrollHeight - site.clientHeight)));
      };
      onScroll();
      site.addEventListener('scroll', onScroll, { passive: true });
      off = () => site.removeEventListener('scroll', onScroll);
    }, 300);
    return () => { window.clearTimeout(t); off(); };
  }, [pathname, root]);

  if (parts.length < 3) return null;
  return (
    <nav className="rail" aria-label="On this page">
      <ol>
        {parts.map((p, i) => (
          <li key={`${pathname}-${i}`} className={i === here ? 'is-here' : i < here ? 'is-past' : undefined}>
            <button type="button" onClick={() => p.el.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              aria-current={i === here ? 'location' : undefined}>
              <span className="rail-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="rail-t">{p.name}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
