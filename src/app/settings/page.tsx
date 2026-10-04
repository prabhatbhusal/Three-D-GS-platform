import type { Metadata } from 'next';
import Link from 'next/link';
import '../../components/site.css';
import { NOINDEX } from '../../lib/shareMeta';

export const metadata: Metadata = { title: 'Settings', robots: NOINDEX };

/** A placeholder: it shows fixed sample settings, not the signed-in account’s. */
export default function SettingsPage() {
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
            <span className="detail-kicker">Preferences</span>
            <h1>Settings</h1>
          </div>
          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Theme</span>
              <strong>System default</strong>
            </div>
            <div className="detail-card">
              <span className="detail-label">Notifications</span>
              <strong>Enabled</strong>
            </div>
            <div className="detail-card">
              <span className="detail-label">Session</span>
              <strong>Secure</strong>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
