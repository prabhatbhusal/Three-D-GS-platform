'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, logout } from '../lib/api';

/** Top bar for the marketing pages (/, /gallery).
 *
 *  The page shell stays server-rendered (CLAUDE.md §4/§12); only this
 *  island is a client component, so it can ask /api/auth/session who is
 *  signed in and swap Sign in/Get started for Studio/Sign out. It renders the
 *  signed-out buttons first (matches the server-rendered HTML, no flash of
 *  wrong layout) and swaps after the session check resolves — best-effort,
 *  same as every other api.ts call, so a slow or unreachable API just leaves
 *  the signed-out buttons in place. */
export function SiteNav() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((s) => { if (!cancelled) setUser(s?.authenticated ? (s.user ?? null) : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleLogout = () => {
    logout().catch(() => {}).finally(() => {
      setUser(null);
      router.refresh();
    });
  };

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
        {user ? (
          <>
            <button type="button" onClick={handleLogout} className="site-btn site-btn-quiet">Sign out</button>
            <Link href="/studio" className="site-btn site-btn-primary">Studio</Link>
          </>
        ) : (
          <>
            <Link href="/login" className="site-btn site-btn-quiet">Sign in</Link>
            <Link href="/login?mode=signup" className="site-btn site-btn-primary">Get started</Link>
          </>
        )}
      </div>
    </header>
  );
}
