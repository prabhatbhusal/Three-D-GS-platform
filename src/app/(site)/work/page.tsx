import type { Metadata } from 'next';
import { SitePage } from '../../../features/marketing/layout/SitePage';
import { PageHead } from '../../../components/ui/PageHead';
import { WorkEntry } from '../../../features/marketing/work/WorkEntry';
import { WORK } from '../../../features/marketing/siteContent';

export const metadata: Metadata = {
  alternates: { canonical: '/work' },
  title: 'Work',
  description: 'Places RCAAS.tech has captured: Gwarko Overpass, Madan Ashrit and Nepathya colleges, and Basera Boutique Hotel.'
};

/** Work: delivered and live projects, one WorkEntry each, from features/marketing/siteContent.ts WORK. */
export default function WorkPage() {
  return (
    <SitePage>
      <section className="lp-band">
        <PageHead label="Field log" lede="From a four-lane overpass to the classroom next door and the hotel we are scanning now.">
          Places we have <em>captured</em>
        </PageHead>
        <ol className="lp-log">
          {WORK.map((w) => <WorkEntry key={w.place} w={w} />)}
        </ol>
      </section>
    </SitePage>
  );
}
