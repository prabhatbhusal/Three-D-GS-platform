/** The full-bleed "We sell you enquiries" band over public/media/bleed.
 *  Hidden without that film or photo. */
import { MediaFill } from '../SiteMotion';
import { Button } from '../../../components/ui/Button';
import { media } from '../media';

export function EnquiryBleed() {
  const bleed = media('bleed');
  if (!bleed) return null;
  return (
    <section className="lp-bleed" data-nav-dark>
      <div className="lp-bleed-media" aria-hidden><MediaFill m={bleed} lazy /></div>
      <div className="lp-bleed-body">
        <h2>We don&apos;t sell you a 3D model. We sell you <em>enquiries</em>.</h2>
        <p>Every tour carries an enquiry form inside the room, so a visitor who is already looking can ask without leaving.</p>
        <Button href="/contact" transitionTypes={['nav-forward']}>Book a capture</Button>
      </div>
    </section>
  );
}
