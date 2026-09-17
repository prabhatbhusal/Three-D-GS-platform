import Link from 'next/link';

/** Top bar for the marketing pages (/, /gallery). */
export function SiteNav() {
  return (
    <header className="site-nav">
      <Link href="/" className="site-brand" aria-label="threedview.services home">
        <span className="site-mark" aria-hidden />
        <span>threedview<span className="site-brand-tld">.services</span></span>
      </Link>
      <nav className="site-links" aria-label="Main">
        <Link href="/#how">How it works</Link>
        <Link href="/#features">Features</Link>
        <Link href="/gallery">Gallery</Link>
      </nav>
      <div className="site-actions">
        <Link href="/login" className="site-btn site-btn-quiet">Sign in</Link>
        <Link href="/login?mode=signup" className="site-btn site-btn-primary">Get started</Link>
      </div>
    </header>
  );
}
