export type HotspotType = 'image' | 'video' | 'text' | 'link' | 'portal';

export interface HotspotPayload {
  url?: string;
  caption?: string;
  text?: string;
  sceneId?: string;
}

export interface Hotspot {
  id: string;
  type: HotspotType;
  position: [number, number, number];
  radius: number;
  label: string;
  payload: HotspotPayload;
  occludedBy: 'geometry' | 'none';
}

/** One projected hotspot, written by hotspotProjector.js every frame. */
export interface ProjectedHotspot {
  id: string;
  type: HotspotType;
  label: string;
  x: number;
  y: number;
  dist: number;
  onScreen: boolean;
}
