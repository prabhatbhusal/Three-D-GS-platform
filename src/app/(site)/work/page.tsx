import { SitePage } from '../../../features/marketing/layout/SitePage';
import { PageHead } from '../../../components/ui/PageHead';
import { WorkEntry } from '../../../features/marketing/work/WorkEntry';
import { WORK } from '../../../features/marketing/siteContent';
import { pageMeta } from '../../../lib/shareMeta';
import { BreadcrumbJsonLd } from '../../../features/marketing/JsonLd';

export const metadata = pageMeta('/work', 'Work: scanned hotels, colleges and landmarks in Nepal',
  'Places RCAAS.tech has captured: Gwarko Overpass, Madan Ashrit and Nepathya colleges, and Basera Boutique Hotel.');

/** Work: delivered and live projects, one WorkEntry each, from features/marketing/siteContent.ts WORK. */
export default function WorkPage() {
  return (
    <SitePage>
      <BreadcrumbJsonLd name="Work" path="/work" />
      <PageHead center label="work" facts={[`${WORK.length} sites`, '3 districts', 'Infrastructure, education, hospitality']}
        lede="From a four-lane overpass to the classroom next door and the hotel we are scanning now.">
        Places we have measured.
      </PageHead>
      <ol className="ip-log">
        {WORK.map((w) => <WorkEntry key={w.slug} w={w} />)}
      </ol>
    </SitePage>
  );
}
