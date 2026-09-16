'use client';

import dynamic from 'next/dynamic';

// LCCRender + the R3F canvas are pure client-side WebGL — there is nothing to
// server-render, and SSR-mounting a module-level renderer singleton twice
// (server pass + client hydration) breaks it the same way React Strict Mode
// used to under Vite. ssr:false keeps the first frame purely client-drawn,
// which is also what the 5s-TTFF budget wants: no server round trip to wait on.
const App = dynamic(() => import('../components/App'), { ssr: false });

export default function Page() {
  return <App />;
}
