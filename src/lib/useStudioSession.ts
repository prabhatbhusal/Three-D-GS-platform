'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from './api';

/**
 * Studio pages are for signed-in team members. Signed-out visitors go to
 * /login and come back to `next`. Resolves true once it's fine to render.
 * If the API can't be reached at all it lets the page through — the page
 * then shows its own "server isn't answering" state, and every write is
 * refused server-side anyway.
 */
export function useStudioSession(next: string): boolean {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    getSession()
      .then((s) => {
        if (s?.authenticated) setOk(true);
        else router.replace(`/login?next=${encodeURIComponent(next)}`);
      })
      .catch(() => setOk(true));
  }, [router, next]);
  return ok;
}
