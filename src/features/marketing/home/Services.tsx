/** "What we capture": the kinds of place RCAAS scans (siteContent.ts SECTORS),
 *  one card each, the whole grid linking on to Services. Styles: home.css .hp-cards. */
import Link from 'next/link';
import { Icon } from '../../../components/ui/Icon';
import { Pic } from '../../../components/ui/Pic';
import { SECTORS } from '../siteContent';

export function Services() {
  return (
    <section className="hp-block" aria-labelledby="hp-services-title">
      <header className="hp-block-head">
        <h2 id="hp-services-title">What we capture.</h2>
        <p>Anywhere a visitor decides by looking around first.</p>
      </header>
      <ul className="hp-cards hp-cards-3">
        {SECTORS.map((s) => (
          <li key={s.t}>
            <Link href="/services" transitionTypes={['nav-forward']} className="hp-card">
              <Pic src={s.img} className="hp-card-pic" />
              <Icon name={s.ic} className="hp-card-ic" />
              <h3>{s.t}</h3>
              <p>{s.b}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
