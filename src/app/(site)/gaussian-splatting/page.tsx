import Link from 'next/link';
import { SitePage } from '../../../features/marketing/layout/SitePage';
import { PageHead } from '../../../components/ui/PageHead';
import { Section } from '../../../components/ui/Section';
import { Icon } from '../../../components/ui/Icon';
import { GUIDE } from '../../../features/marketing/guide';
import { BreadcrumbJsonLd, FaqJsonLd, GuideJsonLd } from '../../../features/marketing/JsonLd';
import { pageMeta } from '../../../lib/shareMeta';

export const metadata = pageMeta(GUIDE.path, GUIDE.title, GUIDE.short);

/** The explainer (2026-10-06): the answer to "what is a 3D Gaussian splat
 *  tour?" in the first lines, how it differs from a 360° tour and a mesh, the
 *  words people meet, and the questions they ask. Written so a search result
 *  or an AI answer can quote it; its content lives in guide.ts
 *  (also read by /llms.txt). Styles: inner.css .ip-compare, .ip-terms. */
export default function GuidePage() {
  const { head, rows } = GUIDE.compare;
  return (
    <SitePage>
      <PageHead center label="gaussian splatting" facts={['From a LiDAR scan', 'Opens in a browser', 'No app to install']} lede={GUIDE.answer}>
        {GUIDE.title}
      </PageHead>

      <Section id="gs-compare" title="Splat tour, 360° tour and mesh, side by side">
        <div className="ip-compare" data-reveal>
          <table>
            <caption>How the three common ways of showing a real space compare</caption>
            <thead><tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(([k, ...cells]) => (
                <tr key={k}><th scope="row">{k}</th>{cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="gs-terms" title="The words you will meet">
        <dl className="ip-terms">
          {GUIDE.terms.map(([t, d]) => (
            <div key={t} data-reveal><dt>{t}</dt><dd>{d}</dd></div>
          ))}
        </dl>
      </Section>

      <Section id="gs-faq" title="Questions people ask">
        <div className="ip-faq">
          {GUIDE.faq.map((f) => (
            <details key={f.q} data-reveal>
              <summary>{f.q}<Icon name="add" className="ip-faq-ic" /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        <p className="ip-next" data-reveal>
          See one: <Link href="/gallery">walk a live tour</Link>. See how we make it: <Link href="/how-it-works">how it works</Link>. Have a space in mind: <Link href="/contact">book a capture</Link>.
        </p>
        <FaqJsonLd items={GUIDE.faq} />
        <GuideJsonLd />
        <BreadcrumbJsonLd name={GUIDE.title} path={GUIDE.path} />
      </Section>
    </SitePage>
  );
}
