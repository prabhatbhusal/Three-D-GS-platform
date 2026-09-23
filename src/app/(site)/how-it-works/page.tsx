import type { Metadata } from 'next';
import { StepMedia } from '../../../components/SiteMotion';
import { PageHead, SitePage } from '../../../components/SitePage';
import { media } from '../../../lib/media';
import { STEPS } from '../../../lib/siteContent';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'Capture, process, author, publish: how a LiDAR walk-through becomes a live 3D tour on your website.'
};

export default function HowPage() {
  const items = STEPS.map((s, i) => ({ ...s, media: media(`how/${i + 1}`) }));

  return (
    <SitePage>
      <section className="lp-band">
        <PageHead label="How it works">From a walk&#8209;through to <em>your website</em></PageHead>
        {items.some((s) => s.media) ? (
          <StepMedia
            items={items.map((s, i) => ({
              title: s.t,
              media: s.media,
              body: (
                <>
                  <span className="lp-steps-n">{String(i + 1).padStart(2, '0')}</span>
                  <h2>{s.t}</h2>
                  <p>{s.b}</p>
                </>
              )
            }))}
          />
        ) : (
          <ol className="lp-path">
            {STEPS.map((s, i) => (
              <li key={s.t}>
                <span className="lp-path-node" aria-hidden>{i + 1}</span>
                <h2>{s.t}</h2>
                <p>{s.b}</p>
              </li>
            ))}
          </ol>
        )}
        <div className="lp-vs">
          <p><b>Not a 360° photo.</b> Visitors move through the space, not between fixed bubbles.</p>
          <p><b>Not a video.</b> Rendered live, sharp at any size, and it stops the moment someone wants to look around.</p>
          <p><b>Not a download.</b> Tiles stream as the camera moves, so large scans open quickly.</p>
        </div>
      </section>
    </SitePage>
  );
}
