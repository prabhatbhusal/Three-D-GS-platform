'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSession } from '../../lib/api';
import '../../components/editor.css'; // .ed2-boot, before the shell loads

// Client-only for the same reason as before the routes split: LCCRender is a
// module singleton that breaks under a server render pass.
const App = dynamic(() => import('../../components/App'), { ssr: false });

/**
 * The studio. Signed-out visitors go to /login and come back here.
 *
 * The check runs before App mounts so the SDK never starts loading for
 * someone about to be redirected. If the API can't be reached at all, the
 * studio opens anyway — every write is still refused server-side, and
 * offline work on scenes shouldn't be blocked by a second server (§12).
 */
export default function StudioPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getSession()
      .then((s) => {
        if (s?.authenticated) setReady(true);
        else router.replace('/login?next=/studio');
      })
      .catch(() => setReady(true));
  }, [router]);

  if (!ready) return <div className="ed2-boot">Checking your session…</div>;
  return <App />;
}
