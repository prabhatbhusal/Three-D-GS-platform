/** One place in the Work page's field log (siteContent.ts WORK): its status
 *  and sector held beside it while you read, the place at poster size, what
 *  happened there, its numbers as large figures that count up, and what was
 *  handed over. The nav's Work dropdown links to it by id (the slug). To add
 *  a project, add it to WORK, not here. Styles: inner.css .ip-case. */
import { Icon } from '../../../components/ui/Icon';
import { MediaFill } from '../SiteMotion';
import { media } from '../media';
import { STATUS, WORK } from '../siteContent';

export function WorkEntry({ w }: { w: (typeof WORK)[number] }) {
  const m = media(`work/${w.slug}`);
  return (
    <li id={w.slug} className={`ip-case is-${w.status}`}>
      <div className="ip-case-side">
        <p className={`ip-status is-${w.status}`}>{STATUS[w.status]}</p>
        {w.when && <p>{w.when}</p>}
        <p>{w.sector}</p>
      </div>
      <div className="ip-case-main">
        <h2 className="ip-case-t" data-lines>{w.place}</h2>
        <p className="ip-case-where" data-reveal><Icon name="place" />{w.where}</p>
        {m && <div className="ip-case-media" data-reveal aria-hidden><MediaFill m={m} lazy /></div>}
        <p className="ip-case-b" data-reveal>{w.body}</p>
        {w.stats && (
          <dl className="ip-figs" data-reveal>
            {w.stats.map(([v, k]) => (
              <div key={k}><dt>{k}</dt><dd data-count aria-label={v}>{v}</dd></div>
            ))}
          </dl>
        )}
        {w.ships && (
          <ul className="ip-ships" aria-label="Handed over" data-reveal>
            {w.ships.map((d) => <li key={d}><Icon name="check" />{d}</li>)}
          </ul>
        )}
        {w.href && (
          <a className="ip-go" href={w.href} target="_blank" rel="noreferrer" data-reveal>
            Read the case study <Icon name="outward" />
          </a>
        )}
      </div>
    </li>
  );
}
