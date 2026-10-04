/** The layout of the policy pages (terms, privacy, security, cookies) and the contact block they share. */
import { PageHead, SitePage } from './SitePage';

export type PolicySection = { h: string; body: React.ReactNode };

/** A policy page (terms, privacy, security): the page head, the date it last
 *  changed, then numbered sections of plain text. Styles: landing.css .lp-legal. */
export function PolicyPage({ label, title, lede, updated, sections }: {
  label: string; title: React.ReactNode; lede: string; updated: string; sections: PolicySection[];
}) {
  return (
    <SitePage contact={false}>
      <section className="lp-band lp-legal">
        <PageHead label={label} lede={lede}>{title}</PageHead>
        <p className="lp-legal-updated">Last updated {updated}</p>
        <ol className="lp-legal-list">
          {sections.map((s) => (
            <li key={s.h}>
              <h2>{s.h}</h2>
              {s.body}
            </li>
          ))}
        </ol>
      </section>
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
