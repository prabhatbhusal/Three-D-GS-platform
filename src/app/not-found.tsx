import type { Metadata } from 'next';
import Link from 'next/link';
import { NOINDEX } from '../lib/shareMeta';

export const metadata: Metadata = { title: 'Page not found', robots: NOINDEX };

/** Every missing page, a project or tour that isn't published included: a
 *  way back instead of a bare "404". Styled from globals.css (.nf-*) only:
 *  CSS imported here isn't loaded for the root not-found page in dev. */
export default function NotFound() {
  return (
    <main className="nf">
      <Link href="/" className="nf-brand">RCAAS<span>.tech</span></Link>
      <section className="nf-body">
        <p className="nf-code">404</p>
        <h1>This page <em>isn’t here</em></h1>
        <p>The link may be old, or the tour may not be published yet. Start from the home page, or ask us and we’ll send the right link.</p>
        <div className="nf-cta">
          <Link href="/" className="nf-btn nf-btn-main">Home</Link>
          <Link href="/contact" className="nf-btn">Contact us</Link>
        </div>
      </section>
    </main>
  );
}
