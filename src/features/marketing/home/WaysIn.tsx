/** "One capture, four ways in": the ways a visitor moves (siteContent.ts
 *  MODES), each beside a photo from public/media/tour. Hidden without photos. */
import { ImageTabs } from '../SiteMotion';
import { Button } from '../../../components/ui/Button';
import { Section } from '../../../components/ui/Section';
import { frames } from '../media';
import { MODES } from '../siteContent';

export function WaysIn() {
  const tour = frames('tour');
  if (!tour.length) return null;
  return (
    <Section
      title={<>One capture, <em>four ways</em> in</>}
      lede="Visitors choose how they move. Every picture here is from a live tour of a college computer lab."
    >
      <ImageTabs
        alt="A college computer lab, seen in its live 3D tour"
        items={MODES.map((m, i) => ({ label: m.t, body: m.b, image: tour[i % tour.length] }))}
      />
      <p className="lp-more">
        <Button href="/gallery" transitionTypes={['nav-forward']}>Open the gallery</Button>
      </p>
    </Section>
  );
}
