/** The marketing site's footer (2026-10-05, third pass): a closing line over a
 *  turning point-cloud room (RoomCloud), and
 *  the ways to reach us as icons with whether the office is open now; then
 *  Services (each links to its row), Projects (each place we have measured,
 *  with its status), Company and Legal; the wordmark across the whole width
 *  (its letters rise in, SiteGsap .ft-mark); and a base line ending on Kathmandu's
 *  coordinates, where the home page's globe opens. SitePage puts it under
 *  every marketing page. Lists come from siteContent.ts, so a new service or
 *  project appears here by itself. Styles: inner.css .ft. */
import Link from 'next/link';
import { Icon } from '../../../components/ui/Icon';
import { COMPANY, SERVICES, STATUS, WORK } from '../siteContent';
import { OpenNow, ReachIcons } from './Reach';
import { RoomCloud } from './RoomCloud';

// [label, href, external]: external links open in a new tab
const COMPANY_LINKS: [string, string, boolean?][] = [
  ['All work', '/work'], ['How it works', '/how-it-works'], ['Live tours', '/gallery'], ['About', '/about'], ['Contact', '/contact'],
  ['GeoNova', 'https://geonova.com.np/about-us', true], ['LinkedIn', 'https://www.linkedin.com/company/geonova-solutions-pvt-ltd/', true]
];
const LEGAL: [string, string][] = [['Terms of Service', '/terms'], ['Privacy Policy', '/privacy'], ['Security Policy', '/security'], ['Cookie Policy', '/cookies']];

export function Footer() {
  return (
    <footer className="ft">
      <div className="ft-top">
        <RoomCloud />
        <p className="ft-say" data-lines>Walk it once.<br />Open it anywhere.</p>
        <div className="ft-reach">
          <ReachIcons className="reach-lg" />
          <OpenNow />
        </div>
      </div>

      <nav className="ft-cols" aria-label="Footer">
        <div>
          <p className="ft-h">Services</p>
          <ul>
            {SERVICES.map((s) => (
              <li key={s.k}><Link href={`/services#${s.k}`}><Icon name={s.ic} />{s.tab}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <p className="ft-h">Projects</p>
          <ul>
            {WORK.map((w) => (
              <li key={w.slug}>
                <Link href={`/work#${w.slug}`}>
                  <span className={`ft-dot is-${w.status}`} aria-hidden />{w.place}
                  <span className="ft-sub">{STATUS[w.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="ft-h">Company</p>
          <ul>
            {COMPANY_LINKS.map(([label, href, external]) => (
              <li key={href}>
                {external
                  ? <a href={href} target="_blank" rel="noreferrer">{label}<Icon name="outward" /></a>
                  : <Link href={href}>{label}</Link>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="ft-h">Legal</p>
          <ul>{LEGAL.map(([label, href]) => <li key={href}><Link href={href}>{label}</Link></li>)}</ul>
        </div>
      </nav>

      <p className="ft-mark" aria-hidden>RCAAS.tech</p>

      <div className="ft-base">
        <span>© {new Date().getFullYear()} {COMPANY.name}</span>
        <span>{COMPANY.city} 27.72° N, 85.32° E</span>
        <Link href="/login">Team sign-in</Link>
      </div>
    </footer>
  );
}
