/** The layout of the policy pages (terms, privacy, security, cookies) and the contact block they share. */
import { SitePage } from './layout/SitePage';
import { PageHead } from '../../components/ui/PageHead';

export type PolicySection = { h: string; body: React.ReactNode };

const slug = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A policy page: the page head with the date it last changed, then its
 *  numbered sections beside a contents list that stays in view while you
 *  read. Styles: inner.css .ip-legal. */
export function PolicyPage({ label, title, lede, updated, sections }: {
  label: string; title: React.ReactNode; lede: string; updated: string; sections: PolicySection[];
}) {
  return (
    <SitePage contact={false}>
      <PageHead label={label.toLowerCase()} lede={lede} facts={[`Last updated ${updated}`]}>{title}</PageHead>
      <div className="ip-legal">
        <nav className="ip-legal-toc" aria-label="On this page">
          <ol>{sections.map((s) => <li key={s.h}><a href={`#${slug(s.h)}`}>{s.h}</a></li>)}</ol>
        </nav>
        <ol className="ip-legal-list">
          {sections.map((s) => (
            <li key={s.h} id={slug(s.h)}>
              <h2>{s.h}</h2>
              {s.body}
            </li>
          ))}
        </ol>
      </div>
    </SitePage>
  );
}

/** Who to write to, shared by every policy. */
export const POLICY_CONTACT = (
  <p>
    GeoNova Solutions Pvt. Ltd., Kageshwari-Manohara, Kathmandu, Nepal.
    Email <a href="mailto:info@geonova.com.np">info@geonova.com.np</a> or call <a href="tel:+9779846789573">+977 984 678 9573</a>.
  </p>
);
