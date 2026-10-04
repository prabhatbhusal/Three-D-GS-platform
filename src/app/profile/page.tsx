import type { Metadata } from 'next';
import Link from 'next/link';
import '../../components/site.css';
import { NOINDEX } from '../../lib/shareMeta';

export const metadata: Metadata = { title: 'Profile', robots: NOINDEX };

/** A placeholder: it shows fixed sample details, not the signed-in account. */
export default function ProfilePage() {
  return (
    <main className="site">
      <div className="site-shell detail-shell">
        <header className="detail-header">
          <Link href="/" className="site-brand" aria-label="Home">
            <span className="site-mark" aria-hidden />
            <span>RCAAS<span className="site-brand-tld">.tech</span></span>
          </Link>
          <Link href="/gallery" className="site-btn site-btn-ghost">Back to gallery</Link>
        </header>

        <section className="detail-panel">
          <div className="detail-banner">
            <span className="detail-kicker">Account</span>
            <h1>Profile</h1>
          </div>
          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Name</span>
              <strong>Studio editor</strong>
            </div>
            <div className="detail-card">
              <span className="detail-label">Email</span>
              <strong>editor@rcaas.tech</strong>
            </div>
            <div className="detail-card">
              <span className="detail-label">Role</span>
              <strong>Editor</strong>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
