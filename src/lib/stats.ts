'use client';

import { useEffect } from 'react';
import { API_BASE_URL } from './api';
import { isPublicTour } from './scenes';

/** Visit and time counts for the monthly client report (server/src/stats.js).
 *  sendBeacon with text/plain: it survives the tab closing and needs no preflight. */
function send(body: { space: string; visit?: true; seconds?: number }) {
  try {
    navigator.sendBeacon(`${API_BASE_URL}/api/stats`, new Blob([JSON.stringify(body)], { type: 'text/plain' }));
  } catch { /* counting must never break the tour */ }
}

/** Public tour only: one visit per space opened, plus the seconds spent in it
 *  while the tab was visible — sent on leaving the space, hiding the tab or closing it. */
export function useVisitBeacon(space: string) {
  useEffect(() => {
    if (!isPublicTour() || !space) return;
    send({ space, visit: true });
    let since = document.visibilityState === 'visible' ? Date.now() : 0;
    const flush = () => {
      if (!since) return;
      const seconds = Math.round((Date.now() - since) / 1000);
      since = 0;
      if (seconds > 0) send({ space, seconds });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
      else if (!since) since = Date.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [space]);
}
