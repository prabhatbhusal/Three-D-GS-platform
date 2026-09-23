import Link from 'next/link';
import { ViewTransition } from 'react';

/* The body of every marketing page under src/app/(site)/. The nav lives in
 * that group's layout and stays put; this part slides: out one way and in
 * from the other, by the direction the link was tagged with (SiteNav tags
 * nav links by their order). Untagged navigations (browser back) just
 * crossfade. The wrapper must be rendered by each page, not the layout:
 * a layout persists, so it never enters or exits. CSS is in site.css. */
const SLIDE = { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' };

export function SitePage({ children, contact = true }: { children: React.ReactNode; contact?: boolean }) {
  return (
    <ViewTransition enter={SLIDE} exit={SLIDE} default="none">
      <div className="lp-page">
        {children}
        {contact && <ContactBand />}
        <footer className="site-foot lp-foot">
          <div className="lp-foot-top">
            <div>
              <span className="lp-foot-brand">RCAAS<span className="site-brand-tld">.tech</span></span>
              <p className="site-foot-dim">Reality Capture As A Service. A GeoNova Solutions and I.STEM Lab product.</p>
            </div>
            <nav className="lp-foot-cols" aria-label="Footer">
              <div>
                <p className="lp-foot-h">Explore</p>
                <Link href="/work" transitionTypes={['nav-forward']}>Work</Link>
                <Link href="/services" transitionTypes={['nav-forward']}>Services</Link>
                <Link href="/how-it-works" transitionTypes={['nav-forward']}>How it works</Link>
                <Link href="/gallery" transitionTypes={['nav-forward']}>Gallery</Link>
              </div>
              <div>
                <p className="lp-foot-h">Company</p>
                <Link href="/about" transitionTypes={['nav-forward']}>About</Link>
                <Link href="/contact" transitionTypes={['nav-forward']}>Contact</Link>
                <a href="https://geonova.com.np/about-us" target="_blank" rel="noreferrer">GeoNova</a>
                <a href="https://www.linkedin.com/company/geonova-solutions-pvt-ltd/" target="_blank" rel="noreferrer">LinkedIn</a>
              </div>
            </nav>
          </div>
          <div className="lp-foot-base">
            <span>GeoNova Solutions Pvt. Ltd., Kathmandu</span>
            <Link href="/login">Team sign-in</Link>
          </div>
        </footer>
      </div>
    </ViewTransition>
  );
}

/** A page's opening block: label, the one h1, a line of context. */
export function PageHead({ label, children, lede }: { label: string; children: React.ReactNode; lede?: string }) {
  return (
    <header className="lp-head lp-page-head">
      <p className="lp-label">{label}</p>
      <h1>{children}</h1>
      {lede && <p>{lede}</p>}
    </header>
  );
}

export function ContactWays() {
  return (
    <div className="lp-contact-ways">
      <a href="tel:+9779846789573" className="lp-way">
        <span>Call</span><strong>+977 984 678 9573</strong>
      </a>
      <a href="mailto:info@geonova.com.np?subject=Capture%20enquiry%20from%20RCAAS.tech" className="lp-way">
        <span>Email</span><strong>info@geonova.com.np</strong>
      </a>
      <div className="lp-way lp-way-static">
        <span>Visit</span><strong>Kageshwari-Manohara, Kathmandu</strong>
        <small>Sunday to Friday, 10:00 to 17:30</small>
      </div>
    </div>
  );
}

function ContactBand() {
  return (
    <section className="lp-contact" aria-label="Contact">
      <h2>Have a space worth <em>walking</em>?</h2>
      <p>Tell us what it is and where. We will scan it, publish it and hand you a link.</p>
      <ContactWays />
    </section>
  );
}
