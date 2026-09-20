'use client';

import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, logout } from '../lib/api';

export function SiteNav() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailView, setDetailView] = useState<'profile' | 'settings' | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((s) => { if (!cancelled) setUser(s?.authenticated ? (s.user ?? null) : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setDetailView(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const closeMenu = () => {
    setMenuOpen(false);
    setDetailView(null);
  };

  const openDetail = (view: 'profile' | 'settings') => {
    setMenuOpen(false);
    setDetailView(view);
  };

  const handleLogout = () => {
    setMenuOpen(false);
    setDetailView(null);
    logout().catch(() => {}).finally(() => {
      setUser(null);
      router.refresh();
    });
  };

  const initials = user?.name
    ? user.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('').slice(0, 2)
    : 'U';

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
          <div className="site-user-menu" ref={menuRef}>
            <button
              type="button"
              className="site-user-trigger"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <span className="site-user-avatar" aria-hidden>{initials}</span>
              <span className="site-user-name">{user.name}</span>
              <svg viewBox="0 0 20 20" className={menuOpen ? 'site-user-caret open' : 'site-user-caret'} aria-hidden>
                <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <AnimatePresence>
              {menuOpen && !detailView && (
                <motion.div
                  className="site-user-dropdown"
                  role="menu"
                  aria-label="User account menu"
                  initial={{ opacity: 0, y: -12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                >
                  <button type="button" className="site-user-option" onClick={() => openDetail('profile')}>Profile</button>
                  <button type="button" className="site-user-option" onClick={() => openDetail('settings')}>Settings</button>
                  <button type="button" className="site-user-option site-user-option-danger" onClick={handleLogout}>Log out</button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {detailView && (
                <motion.div
                  className="site-account-backdrop"
                  onClick={closeMenu}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <motion.aside
                    className="site-account-panel"
                    role="dialog"
                    aria-modal="true"
                    aria-label={detailView === 'profile' ? 'Profile panel' : 'Settings panel'}
                    onClick={(event) => event.stopPropagation()}
                    initial={{ x: 42, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 42, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                  >
                    <div className="site-account-header">
                      <div className="site-account-usermeta">
                        <span className="site-user-avatar" aria-hidden>{initials}</span>
                        <div>
                          <div className="site-account-label">{detailView === 'profile' ? 'Profile' : 'Settings'}</div>
                          <div className="site-account-email">{user.email}</div>
                        </div>
                      </div>
                      <button type="button" className="site-account-close" onClick={closeMenu} aria-label="Close panel">×</button>
                    </div>

                    <div className="site-account-body">
                      <div className="site-account-card">
                        <div className="site-account-kicker">{detailView === 'profile' ? 'Account' : 'Preferences'}</div>
                        <h3>{detailView === 'profile' ? user.name : 'Studio settings'}</h3>
                        <p>
                          {detailView === 'profile'
                            ? user.email
                            : 'Theme, workspace preferences, and session details live here.'}
                        </p>
                      </div>

                      {detailView === 'profile' ? (
                        <div className="site-account-stack">
                          <div className="site-account-item static"><span>Name</span><strong>{user.name}</strong></div>
                          <div className="site-account-item static"><span>Email</span><strong>{user.email}</strong></div>
                          <div className="site-account-item static"><span>Role</span><strong>Editor</strong></div>
                        </div>
                      ) : (
                        <div className="site-account-stack">
                          <div className="site-account-item static"><span>Theme</span><strong>System default</strong></div>
                          <div className="site-account-item static"><span>Notifications</span><strong>Enabled</strong></div>
                          <div className="site-account-item static"><span>Session</span><strong>Secure</strong></div>
                        </div>
                      )}
                    </div>

                    <div className="site-account-footer">
                      <button type="button" className="site-account-dismiss" onClick={closeMenu}>Close</button>
                      <button type="button" className="site-account-logout" onClick={handleLogout}>Log out</button>
                    </div>
                  </motion.aside>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <>
            <Link href="/login" className="site-btn site-btn-quiet">Sign in</Link>
            <Link href="/login?mode=signup" className="site-btn site-btn-primary">Create account</Link>
          </>
        )}
      </div>
    </header>
  );
}
