/** The marketing site's footer (reworked 2026-10-05): the wordmark in the
 *  display mono, how to reach the team (email, phone, WhatsApp), the
 *  Explore / Company / Legal links, and a base line that ends on Kathmandu's
 *  coordinates, the same point the home page's globe opens on. SitePage puts
 *  it under every marketing page. To add a page to the footer, add a link to
 *  COLUMNS. Styles: landing.css .lp-foot. */
import Link from 'next/link';
import { COMPANY } from '../siteContent';

// [label, href, external]: external links open in a new tab
const COLUMNS: [string, [string, string, boolean?][]][] = [
  ['Explore', [['Work', '/work'], ['Services', '/services'], ['How it works', '/how-it-works'], ['Gallery', '/gallery']]],
  ['Company', [
    ['About', '/about'], ['Contact', '/contact'],
    ['GeoNova', 'https://geonova.com.np/about-us', true],
    ['LinkedIn', 'https://www.linkedin.com/company/geonova-solutions-pvt-ltd/', true]
  ]],
  ['Legal', [['Terms of Service', '/terms'], ['Privacy Policy', '/privacy'], ['Security Policy', '/security'], ['Cookie Policy', '/cookies']]]
];

const DIGITS = COMPANY.phone.replace(/\D/g, '');

export function Footer() {
  return (
    <footer className="site-foot lp-foot">
      <div className="lp-foot-top">
        <div className="lp-foot-about">
          <span className="lp-foot-brand">RCAAS<span className="site-brand-tld">.tech</span></span>
          <p className="site-foot-dim">Reality Capture As A Service. A GeoNova Solutions and I.STEM Lab product.</p>
          <ul className="lp-foot-reach" aria-label="Reach the team">
            <li><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></li>
            <li><a href={`tel:+${DIGITS}`}>{COMPANY.phone}</a></li>
            <li><a href={`https://wa.me/${DIGITS}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
          </ul>
        </div>
        <nav className="lp-foot-cols" aria-label="Footer">
          {COLUMNS.map(([heading, links]) => (
            <div key={heading}>
              <p className="lp-foot-h">{heading}</p>
              {links.map(([label, href, external]) => external
                ? <a key={href} href={href} target="_blank" rel="noreferrer">{label}</a>
                : <Link key={href} href={href} transitionTypes={['nav-forward']}>{label}</Link>)}
            </div>
          ))}
        </nav>
      </div>
      <div className="lp-foot-base">
        <span>© {new Date().getFullYear()} {COMPANY.name}</span>
        <span className="lp-foot-coord">{COMPANY.city} 27.72° N, 85.32° E</span>
        <Link href="/login">Team sign-in</Link>
      </div>
    </footer>
  );
}
