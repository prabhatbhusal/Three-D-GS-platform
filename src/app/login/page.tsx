import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthPanel } from '../../components/AuthPanel';
import { SplatField } from '../../components/SplatField';
import '../../components/site.css';

export const metadata: Metadata = { title: 'Sign in' };

/** Fully static now — AuthPanel reads ?mode=/?next= itself via
 *  useSearchParams(), which is what lets this page prerender at build time
 *  (needed for the static export build, NEXT_OUTPUT_EXPORT) instead of
 *  requiring the request's query string up front. useSearchParams() requires
 *  a Suspense boundary; the fallback only shows for the instant before
 *  hydration reads the real URL. */
export default function LoginPage() {
  return (
    <main className="site auth">
      <aside className="auth-art">
        <SplatField className="auth-canvas" />
        <div className="auth-art-copy">
          <Link href="/" className="site-brand">
            <span className="site-mark" aria-hidden />
            <span>RCAAS<span className="site-brand-tld">.tech</span></span>
          </Link>
          <blockquote>
            The model is how we get there.
            <br />
            <em>The enquiry is the point.</em>
          </blockquote>
        </div>
      </aside>

      <section className="auth-side">
        <Link href="/" className="auth-back">Back to home</Link>
        <Suspense fallback={null}>
          <AuthPanel />
        </Suspense>
      </section>
    </main>
  );
}
