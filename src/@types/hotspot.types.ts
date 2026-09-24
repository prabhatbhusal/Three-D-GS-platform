/** 'audio' is a hotspot whose content IS the clip (+ its transcript); any
 *  other type can carry a clip too, in payload.audio. */
export type HotspotType = 'image' | 'video' | 'text' | 'link' | 'portal' | 'audio';

export interface HotspotPayload {
  url?: string;
  caption?: string;
  text?: string;
  sceneId?: string;
  /** `asset://<assetId>/<file>.m4a` (§5.2, §6.3). Plays when the hotspot opens. */
  audio?: string;
  /** What the audio says, for the visitor who never unmutes (§6.3). */
  transcript?: string;
  /** When its card shows (text hotspots; HotspotMarkers/hotspotLayout.ts).
   *  Absent: today's default — one of the room's nearest few. 'near': only
   *  within NEAR_DISTANCE, so close-together labels never overlap. 'always':
   *  every time it's on screen, at any distance. */
  reveal?: 'near' | 'always';
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
