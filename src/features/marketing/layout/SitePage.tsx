import { ViewTransition } from 'react';
import { SiteGsap } from '../SiteGsap';
import { ContactBand } from './ContactBand';
import { Footer } from './Footer';

/* The body of every marketing page under src/app/(site)/: the page's own
 * sections, then the contact band (unless contact={false}) and the footer.
 * The nav (Navbar) lives in that group's layout and stays put; this part
 * slides: out one way and in from the other, by the direction the link was
 * tagged with (Navbar tags nav links by their order). Untagged navigations
 * (browser back) just crossfade. The wrapper must be rendered by each page,
 * not the layout: a layout persists, so it never enters or exits. CSS is in
 * site.css. */
const SLIDE = { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' };

export function SitePage({ children, contact = true }: { children: React.ReactNode; contact?: boolean }) {
  return (
    <ViewTransition enter={SLIDE} exit={SLIDE} default="none">
      <div className="lp-page">
        <SiteGsap />
        {children}
        {contact && <ContactBand />}
        <Footer />
      </div>
    </ViewTransition>
  );
}
