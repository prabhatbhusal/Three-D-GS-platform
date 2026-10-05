'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { logout, ROLE_NAME, type SessionUser } from '../../../lib/api';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { PasswordChange } from '../../auth/PasswordChange';

/** The signed-in person's menu in the site nav: their name opens Profile,
 *  Settings (theme, change password) and Log out; Profile and Settings slide
 *  in a drawer. The studio has its own copy in its top bar (EditorShell
 *  Account), styled for the studio. Styles: site.css .site-user-*, .site-account-*. */
export function AccountMenu({ user, onSignedOut }: { user: SessionUser; onSignedOut: () => void }) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // The drawer renders outside the nav: the nav's backdrop-filter makes it the
  // containing block for position: fixed, which would squeeze the drawer into
  // the bar. .site, not body, so it keeps the site's colour tokens.
  const [drawerHost, setDrawerHost] = useState<Element | null>(null);
  useEffect(() => { setDrawerHost(menuRef.current?.closest('.site') ?? document.body); }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailView, setDetailView] = useState<'profile' | 'settings' | null>(null);

  const closeMenu = () => {
    setMenuOpen(false);
    setDetailView(null);
  };
  useClickOutside([menuRef, panelRef], closeMenu);

  const openDetail = (view: 'profile' | 'settings') => {
    setMenuOpen(false);
    setDetailView(view);
  };

  const handleLogout = () => {
    closeMenu();
    logout().catch(() => {}).finally(() => {
      onSignedOut();
      router.refresh();
    });
  };

  const initials = user.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'U';

  return (
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

      {drawerHost && createPortal(<AnimatePresence>
        {detailView && (
          <motion.div
            ref={panelRef}
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
                  <p>{detailView === 'profile' ? user.email : 'Your password.'}</p>
                </div>

                {detailView === 'profile' ? (
                  <div className="site-account-stack">
                    <div className="site-account-item static"><span>Name</span><strong>{user.name}</strong></div>
                    <div className="site-account-item static"><span>Email</span><strong>{user.email}</strong></div>
                    <div className="site-account-item static"><span>Role</span><strong>{ROLE_NAME[user.role] ?? user.role}</strong></div>
                  </div>
                ) : (
                  <>
                    <PasswordChange cls="site" email={user.email} />
                  </>
                )}
              </div>

              <div className="site-account-footer">
                <button type="button" className="site-account-dismiss" onClick={closeMenu}>Close</button>
                <button type="button" className="site-account-logout" onClick={handleLogout}>Log out</button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>, drawerHost)}
    </div>
  );
}
