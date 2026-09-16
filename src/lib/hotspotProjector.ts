import type { ProjectedHotspot } from '../@types/hotspot.types';

/**
 * Bridge between the R3F frame loop and the DOM hotspot markers. Stage projects
 * the active scene's hotspots to screen pixels every frame and writes them here;
 * the DOM <HotspotMarkers> reads on its own rAF. Plain mutable object — no React
 * state at 60fps.
 */
export const projected: { list: ProjectedHotspot[] } = {
  list: []
};
