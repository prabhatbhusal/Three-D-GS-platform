import type { Metadata } from 'next';
import { StepMedia } from '../../../components/SiteMotion';
import { PageHead, SitePage } from '../../../components/SitePage';
import { media } from '../../../lib/media';
import { SERVICES } from '../../../lib/siteContent';

export const metadata: Metadata = {
  title: 'Services',
  description: 'Virtual tours that take enquiries, point clouds, BIM-ready models, measured drawings and heritage records, from one LiDAR walk-through.'
};

export default function ServicesPage() {
  const items = SERVICES.map((s) => ({ ...s, media: media(`services/${s.k}`) }));

  return (
    <SitePage>
      <section className="lp-band">
        <PageHead label="What we deliver" lede="The same capture becomes a tour for your guests, a model for your engineers and a record for the archive.">
          One walk-through. <em>Every</em> deliverable.
        </PageHead>
        {items.some((s) => s.media) ? (
          <StepMedia
            items={items.map((s, i) => ({
              title: s.tab,
              media: s.media,
              body: (
                <>
                  <span className="lp-steps-n">{String(i + 1).padStart(2, '0')}</span>
                  <h2>{s.title}</h2>
                  <p>{s.body}</p>
                </>
              )
            }))}
          />
        ) : (
          <div className="lp-services">
            {SERVICES.map((s, i) => (
              <article key={s.k} className={`lp-svc lp-svc-${s.k}`}>
                <span className="lp-svc-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="lp-svc-ic" aria-hidden />
                <h2>{s.title}</h2>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </SitePage>
  );
}
