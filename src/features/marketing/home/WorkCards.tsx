/** The projects so far (siteContent.ts WORK) as cards: where, what state it is
 *  in, and the first lines of the story; the Work page tells the rest.
 *  Styles: home.css .hp-cards, .hp-status. */
import Link from 'next/link';
import { STATUS, WORK } from '../siteContent';

export function WorkCards() {
  return (
    <section className="hp-block" aria-labelledby="hp-work-title">
      <header className="hp-block-head">
        <h2 id="hp-work-title">Places we have walked.</h2>
        <p>Measured on site in Kathmandu, Lalitpur and Butwal, not quoted from a brochure.</p>
      </header>
      <ul className="hp-cards hp-cards-2">
        {WORK.map((w) => (
          <li key={w.place}>
            <Link href="/work" transitionTypes={['nav-forward']} className="hp-card hp-card-work">
              <span className={`hp-status is-${w.status}`}>{STATUS[w.status]}</span>
              <h3>{w.place}</h3>
              <p className="hp-card-where">{w.where}{w.status === 'done' && w.when ? `, ${w.when}` : ''}</p>
              <p>{w.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
