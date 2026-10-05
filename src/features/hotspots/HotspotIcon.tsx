/** One line icon per hotspot type, on a 24 grid, 1em square so it takes the
 *  size of the text around it: the marker in the 3D view, its card, and the
 *  studio's hotspot tree all use these (HotspotMarkers, EditorShell). */
import type { ReactNode } from 'react';
import type { HotspotType } from '../../@types/hotspot.types';

const PATHS: Record<HotspotType, ReactNode> = {
  text: <><path d="M12 10.5v6.5" /><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" /></>,
  image: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m4 16 4.5-4.5 3.5 3.5 2.5-2.5L20 17" /><circle cx="15.5" cy="9.2" r="1.3" /></>,
  video: <path d="M9 7.2v9.6l7.6-4.8z" fill="currentColor" />,
  audio: <><path d="M5 10v4h3l4 3.5v-11L8 10z" /><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" /><path d="M18 7.3a6.6 6.6 0 0 1 0 9.4" /></>,
  link: <><path d="M8 16 16 8" /><path d="M9.5 8H16v6.5" /></>,
  portal: <><path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" /><path d="M4 12h10" /><path d="m10.5 8.5 3.5 3.5-3.5 3.5" /></>,
  table: <><path d="M7 4v5a2 2 0 0 0 4 0V4" /><path d="M9 11v9" /><path d="M16.5 20V4c-1.8 0-3 2.2-3 5.2 0 2.6 1.2 3.8 3 3.8" /></>,
  room: <><path d="M3.5 18.5V7" /><path d="M3.5 14.5h17v4" /><path d="M20.5 14.5V12a3 3 0 0 0-3-3H11v5.5" /><circle cx="7.3" cy="11.3" r="1.6" /></>,
  hall: <><path d="M8 3.5h8l-.7 5a3.3 3.3 0 0 1-6.6 0z" /><path d="M12 11.8v8" /><path d="M8.5 20h7" /></>
};

export function HotspotIcon({ type, className }: { type: HotspotType; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="1em" height="1em" aria-hidden
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[type] ?? PATHS.text}
    </svg>
  );
}
