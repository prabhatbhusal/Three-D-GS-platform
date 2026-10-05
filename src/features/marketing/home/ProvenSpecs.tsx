/** "Proven on real jobs": the measured numbers (siteContent.ts SPECS). */
import { Section } from '../../../components/ui/Section';
import { SPECS } from '../siteContent';

export function ProvenSpecs() {
  return (
    <Section title="Proven on real jobs" lede="Measured on site in Kathmandu and Lalitpur, not quoted from a brochure.">
      <div className="lp-specs">
        {SPECS.map((s) => (
          <div key={s.k} className="lp-spec">
            <svg className="lp-spec-ic" viewBox="0 0 24 24" aria-hidden><path d={s.ic} /></svg>
            <strong>{s.n}</strong>
            <span>{s.k}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
