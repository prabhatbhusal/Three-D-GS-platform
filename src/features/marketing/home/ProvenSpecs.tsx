/** "Proven on real jobs": the measured numbers (siteContent.ts SPECS), each a
 *  big figure over what it measures. Real measurements stand where a review
 *  wall would go: there are no client reviews to show yet, and none are made
 *  up. Styles: home.css .hp-figures. */
import { SPECS } from '../siteContent';

export function ProvenSpecs() {
  return (
    <section className="hp-block" aria-labelledby="hp-proof-title">
      <header className="hp-block-head">
        <h2 id="hp-proof-title">Proven on real jobs.</h2>
        <p>Measured on site in Kathmandu and Lalitpur, not quoted from a brochure.</p>
      </header>
      <dl className="hp-figures">
        {SPECS.map((s) => (
          <div key={s.k}>
            <dt>{s.k}</dt>
            <dd>{s.n}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
