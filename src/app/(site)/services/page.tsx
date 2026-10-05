import type { Metadata } from 'next';
import Link from 'next/link';
import { SitePage } from '../../../features/marketing/layout/SitePage';
import { PageHead } from '../../../components/ui/PageHead';
import { Section } from '../../../components/ui/Section';
import { Icon } from '../../../components/ui/Icon';
import { Pic } from '../../../components/ui/Pic';
import { SECTORS, SERVICES, serviceImg } from '../../../features/marketing/siteContent';

export const metadata: Metadata = {
  alternates: { canonical: '/services' },
  title: 'Services',
  description: 'Virtual tours that take enquiries, point clouds, BIM-ready models, measured drawings and heritage records, from one LiDAR walk-through.'
};

/** Services: everything one scan becomes (siteContent.ts SERVICES), each a
 *  picture and its words, linked to by id from the nav's Services dropdown;
 *  then who it is for (SECTORS) as a list of large words. Styles: inner.css
 *  .ip-svcs, .ip-words. */
export default function ServicesPage() {
  return (
    <SitePage>
      <PageHead center label="services" facts={['6 deliverables', '1 walk-through', '±1.2 cm relative accuracy']}
        lede="The same capture becomes a tour for your guests, a model for your engineers and a record for the archive.">
        One walk-through. Every deliverable.
      </PageHead>

      <Section id="svc-what" title="What one scan becomes">
        <ul className="ip-svcs">
          {SERVICES.map((s) => (
            <li key={s.k} id={s.k} className="ip-svc" data-reveal>
              <Pic src={serviceImg(s.k)} className="ip-svc-pic" />
              <h3 className="ip-svc-t"><Icon name={s.ic} />{s.title}</h3>
              <p className="ip-svc-b">{s.body}</p>
              <Link href="/contact" className="ip-go" transitionTypes={['nav-forward']}>Ask about this <Icon name="arrow" /></Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="svc-who" title="Who it is for" lede="Places people choose by looking first.">
        <ul className="ip-words">
          {SECTORS.map((s) => (
            <li key={s.t} data-reveal>
              <Icon name={s.ic} className="ip-words-ic" />
              <span className="ip-words-t">{s.t}</span>
              <span className="ip-words-b">{s.b}</span>
            </li>
          ))}
        </ul>
      </Section>
    </SitePage>
  );
}
