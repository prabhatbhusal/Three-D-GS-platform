/** "Why RCAAS?": what changes for the client, before → after (siteContent.ts WINS). */
import { Section } from '../../../components/ui/Section';
import { WINS } from '../siteContent';

const Arrow = () => (
  <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export function WhyTours() {
  return (
    <Section
      title={<>Why <em>RCAAS</em>?</>}
      lede="A photo album shows a room. A tour lets a guest walk into it, and ask about it while they are there."
    >
      <div className="lp-wins">
        {WINS.map((w) => (
          <div key={w.from} className="lp-win">
            <h3>{w.from}<Arrow />{w.to}</h3>
            <p>{w.b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
