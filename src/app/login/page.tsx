import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthPanel } from '../../components/AuthPanel';
import { SplatField } from '../../components/SplatField';
import '../../components/site.css';

export const metadata: Metadata = { title: 'Sign in' };

/** Only same-site paths — never an absolute or protocol-relative URL, which
 *  would turn ?next= into an open redirect. */
function safeNext(v: unknown): string {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\')
    ? v
    : '/studio';
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const q = await searchParams;
  const mode = q.mode === 'signup' ? 'signup' : 'signin';

  return (
    <main className="site auth">
      <aside className="auth-art">
        <SplatField className="auth-canvas" />
        <div className="auth-art-copy">
          <Link href="/" className="site-brand">
            <span className="site-mark" aria-hidden />
            <span>threedview<span className="site-brand-tld">.services</span></span>
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
        <AuthPanel initialMode={mode} next={safeNext(q.next)} />
      </section>
    </main>
  );
}
