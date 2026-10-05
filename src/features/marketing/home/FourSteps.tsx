/** "Four steps to a live tour" (siteContent.ts STEPS, which How it works
 *  tells in full), with a link there. */
import { Button } from '../../../components/ui/Button';
import { Section } from '../../../components/ui/Section';
import { STEPS } from '../siteContent';

export function FourSteps() {
  return (
    <Section title="Four steps to a live tour" lede="Days, not months, from the first walk-through to a link on your website.">
      <ol className="lp-four">
        {STEPS.map((s, i) => (
          <li key={s.t}>
            <span className="lp-four-n" aria-hidden>{i + 1}</span>
            <h3>{s.t}</h3>
            <p>{s.b}</p>
          </li>
        ))}
      </ol>
      <p className="lp-more">
        <Button href="/how-it-works" transitionTypes={['nav-forward']}>How it works</Button>
      </p>
    </Section>
  );
}
