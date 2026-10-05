/** One project in the Work page's field log (siteContent.ts WORK): its
 *  footage, status, place, what was delivered and its numbers. To add a
 *  project, add it to WORK, not here. Styles: landing.css .lp-entry. */
import { MediaFill } from '../SiteMotion';
import { media } from '../media';
import { STATUS, WORK } from '../siteContent';

export function WorkEntry({ w }: { w: (typeof WORK)[number] }) {
  const m = media(`work/${w.slug}`);
  return (
    <li className={`lp-entry is-${w.status}`}>
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
}
