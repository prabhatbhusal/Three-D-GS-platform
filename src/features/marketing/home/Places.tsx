/** The places captured so far (siteContent.ts WORK), sliding slowly across
 *  under the hero; it holds still on hover and for reduced motion. The list
 *  is drawn three times so the loop is seamless; the copy is hidden from screen
 *  readers. Styles: home.css .hp-places. */
import Link from 'next/link';
import { WORK } from '../siteContent';

export function Places() {
  const row = (copy: boolean) => (
    <ul className="hp-places-row" aria-hidden={copy || undefined}>
      {WORK.map((w) => (
        <li key={w.place}>
          <span className="hp-places-name">{w.place}</span>
          <span className="hp-places-where">{w.where}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="hp-places" aria-label="Places we have captured">
      <Link href="/work" transitionTypes={['nav-forward']} className="hp-places-track">
        {row(false)}
        {row(true)}
        {row(true)}
      </Link>
    </section>
  );
}
