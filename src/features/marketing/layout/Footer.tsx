/** The marketing site's footer: brand line, Explore / Company / Legal links,
 *  and the team sign-in. SitePage puts it under every marketing page. To add a
 *  page to the footer, add a link to COLUMNS. Styles: landing.css .lp-foot. */
import Link from 'next/link';

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

export function Footer() {
  return (
    <footer className="site-foot lp-foot">
      <div className="lp-foot-top">
        <div>
          <span className="lp-foot-brand">RCAAS<span className="site-brand-tld">.tech</span></span>
          <p className="site-foot-dim">Reality Capture As A Service. A GeoNova Solutions and I.STEM Lab product.</p>
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
        <span>GeoNova Solutions Pvt. Ltd., Kathmandu</span>
        <Link href="/login">Team sign-in</Link>
      </div>
    </footer>
  );
}
