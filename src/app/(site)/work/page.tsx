import type { Metadata } from 'next';
import { MediaFill } from '../../../components/SiteMotion';
import { PageHead, SitePage } from '../../../components/SitePage';
import { media } from '../../../lib/media';
import { STATUS, WORK } from '../../../lib/siteContent';

export const metadata: Metadata = {
  title: 'Work',
  description: 'Places RCAAS.tech has captured: Gwarko Overpass, Chilancho Stupa, Madan Ashrit and Nepathya colleges, and Basera Boutique Hotel.'
};

export default function WorkPage() {
  return (
    <SitePage>
      <section className="lp-band">
        <PageHead label="Field log" lede="From a stupa of Licchavi and Malla-period art to a four-lane overpass to the classroom next door.">
          Places we have <em>captured</em>
        </PageHead>
        <ol className="lp-log">
          {WORK.map((w) => {
            const m = media(`work/${w.slug}`);
            return (
              <li key={w.place} className={`lp-entry is-${w.status}`}>
                {/* the site's footage opens out to full width as it scrolls in */}
                {m && <div className="lp-grow" aria-hidden><MediaFill m={m} lazy /></div>}
                <div className="lp-entry-meta">
                  <span className={`lp-status is-${w.status}`}>
                    {w.status === 'now' && <span className="lp-rec" aria-hidden />}{STATUS[w.status]}
                  </span>
                  {w.when && <span className="lp-entry-when">{w.when}</span>}
                  <span className="lp-entry-sector">{w.sector}</span>
                </div>
                <div className="lp-entry-main">
                  <h2>{w.place}</h2>
                  <p className="lp-entry-where">{w.where}</p>
                  <p className="lp-entry-body">{w.body}</p>
                  {w.ships && (
                    <ul className="lp-ships" aria-label="Delivered">
                      {w.ships.map((d) => <li key={d}>{d}</li>)}
                    </ul>
                  )}
                  {w.href && (
                    <a className="lp-entry-link" href={w.href} target="_blank" rel="noreferrer">Read the case study</a>
                  )}
                </div>
                {w.stats && (
                  <dl className="lp-entry-stats">
                    {w.stats.map(([v, k]) => (
                      <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </SitePage>
  );
}
