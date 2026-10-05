'use client';
/** Who is signed in, read once when the component mounts (GET /api/auth/session).
 *  null while loading, when signed out, and for the old shared-password sign-in,
 *  which has no account. The setter is for signing out without a reload.
 *  Used by the site nav (Navbar) and the studio's account menu (EditorShell). */
import { useEffect, useState } from 'react';
import { getSession, type SessionUser } from '../../lib/api';

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    let alive = true;
    getSession()
      .then((s) => { if (alive) setUser(s?.authenticated ? (s.user ?? null) : null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return [user, setUser] as const;
}
