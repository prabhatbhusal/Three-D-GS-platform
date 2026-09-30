/** 'audio' is a hotspot whose content IS the clip (+ its transcript); any
 *  other type can carry a clip too, in payload.audio. */
export type HotspotType = 'image' | 'video' | 'text' | 'link' | 'portal' | 'audio' | 'table' | 'room' | 'hall';

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
  /** 'table': which table on the website's floor plan this is (its booking lets visitors reserve it). */
  tableId?: string;
  /** 'table': which dining place it's in (the site's other places, site.dining); none, the main one. */
  outlet?: string;
  /** 'room': which of the website's room types it is (Room booking): its price, deposit, Book this room. */
  roomId?: string;
  /** 'hall': which of the website's event halls it is (Event booking): capacity, price, deposit, Book this hall. */
  hallId?: string;
  /** Book now on a room, hall or table (2026-09-30), with nothing else set up:
   *  what the visitor sees, typed on the hotspot. `capacity`: a table's seats,
   *  a room's sleeps, a hall's seated; `standing`: a hall's. `bookUrl`: the
   *  hotel's own booking page instead of a request (may use {checkin} {checkout} {guests} {nights}). */
  price?: string;
  deposit?: string;
  capacity?: number;
  standing?: number;
  bookUrl?: string;
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
