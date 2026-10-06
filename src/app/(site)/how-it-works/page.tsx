import { SitePage } from '../../../features/marketing/layout/SitePage';
import { PageHead } from '../../../components/ui/PageHead';
import { Section } from '../../../components/ui/Section';
import { Icon } from '../../../components/ui/Icon';
import { FAQ, STEPS } from '../../../features/marketing/siteContent';
import { BreadcrumbJsonLd, FaqJsonLd, HowToJsonLd } from '../../../features/marketing/JsonLd';
import { pageMeta } from '../../../lib/shareMeta';

export const metadata = pageMeta('/how-it-works', 'How a LiDAR scan becomes a 3D tour',
  'Capture, process, author, publish: how a LiDAR walk-through becomes a live 3D tour on your website, and answers to common questions.');

// What a tour is not, each crossed out as it scrolls into view.
const NOTS = [
  ['a 360° photo', 'Visitors move through the space, not between fixed bubbles.'],
  ['a video', 'Rendered live, sharp at any size, and it stops the moment someone wants to look around.'],
  ['a download', 'Tiles stream as the camera moves, so large scans open quickly.']
];

/** How it works: the four steps along a line that fills as you scroll, what
 *  a tour is not, and the FAQ, marked up as FAQPage for search and AI
 *  answers. Styles: inner.css .ip-steps, .ip-nots, .ip-faq. */
export default function HowPage() {
  return (
    <SitePage>
      <BreadcrumbJsonLd name="How it works" path="/how-it-works" />
      <HowToJsonLd />
      <PageHead center label="how it works" facts={['1 walk on site', 'Days, not months', 'One link to share']}
        lede="Four steps from the first walk-through to a tour on your own website.">
        From a walk&#8209;through to your website.
      </PageHead>

      <Section id="how-steps" title="Four steps, in order">
        <div className="ip-steps">
          <span className="ip-steps-fill" aria-hidden />
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.t} data-reveal>
                <span className="ip-steps-n" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.t}</h3>
                <p>{s.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section id="how-not" title="What it is not">
        <ul className="ip-nots">
          {NOTS.map(([not, why]) => (
            <li key={not} data-reveal>
              <p className="ip-nots-t">Not <s data-strike>{not}</s>.</p>
              <p className="ip-nots-b">{why}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="faq" title="Asked before every capture">
        <div className="ip-faq">
          {FAQ.map((f) => (
            <details key={f.q} data-reveal>
              <summary>{f.q}<Icon name="add" className="ip-faq-ic" /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        <FaqJsonLd />
      </Section>
    </SitePage>
  );
}
