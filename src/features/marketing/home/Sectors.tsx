/** "Who it's for": the kinds of client (siteContent.ts SECTORS). */
import { Section } from '../../../components/ui/Section';
import { SECTORS } from '../siteContent';

export function Sectors() {
  return (
    <Section title="Who it's for" lede="Anywhere a visitor decides by looking around first.">
      <ul className="lp-sectors">
        {SECTORS.map((s) => <li key={s.t}><b>{s.t}</b><span>{s.b}</span></li>)}
      </ul>
    </Section>
  );
}
