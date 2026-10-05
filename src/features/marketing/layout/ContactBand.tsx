/** "Have a space worth walking?": the call to get in touch that SitePage puts
 *  above the footer, framed like a camera's viewfinder (its four corners
 *  close in as it scrolls into view, the record light blinks), with Book a
 *  capture and the ways to reach us as icons. Styles: inner.css .ip-band. */
import { Button } from '../../../components/ui/Button';
import { ReachIcons } from './Reach';

export function ContactBand() {
  return (
    <section className="ip-band" aria-labelledby="ip-band-t">
      <span className="ip-band-vf" aria-hidden><i /><i /><i /><i /></span>
      <p className="ip-band-rec" aria-hidden><span />REC</p>
      <h2 id="ip-band-t" data-lines>Have a space worth walking?</h2>
      <p className="ip-band-b" data-reveal>Tell us what it is and where. We scan it, publish it and hand you a link.</p>
      <div className="ip-band-act" data-reveal>
        <Button href="/contact" variant="primary" large transitionTypes={['nav-forward']}>Book a capture</Button>
        <ReachIcons />
      </div>
    </section>
  );
}
