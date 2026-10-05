/** A hotel scene entry from lib/scenes.js (CLAUDE.md §5.2's pre-schema shape). */
export interface Scene {
  id: string;
  name: string;
  tagline?: string;
  spawn: [number, number, number];
  yaw: number;
  outdoor?: boolean;
  /** World units per metre. Explicit when the scan's bbox can't be trusted (§14). */
  unitScale?: number;
  /** Override for META_FILE, per-scene. */
  meta?: string;
  /** Absent = lcc2 (every space before 2026-09-23). */
  format?: ModelFormat;
  /** High-variant asset id (CLAUDE.md §2, §9) — when set, metaPath() resolves
   *  through /api/assets/<id>/... instead of the legacy public/assets/rooms/
   *  convention. Unset for the two hand-authored demo scenes. */
  assetId?: string;
  neighbours?: string[];
  /** Which client this space belongs to (§5.1). Null/absent = not filed yet. */
  propertyId?: string | null;
  /** Another space in the same project: this one's night version (day/night switch in the tour). */
  night?: string | null;
  /** Where in a large site: its building and floor, as the studio typed them ("Main block", "Ground floor"). */
  building?: string;
  floor?: string;
}

export interface SpawnState {
  spawn: [number, number, number];
  yaw: number;
}

/** Shape returned by GET /api/scenes, used to patch the static SCENES list. */
export interface ApiScene {
  id: string;
  title?: string;
  tagline?: string;
  spawn?: { position?: number[]; yaw?: number };
  outdoor?: boolean;
  unitScale?: number;
  assetId?: string;
  meta?: string;
  format?: ModelFormat;
  neighbours?: string[];
  night?: string | null;
  building?: string;
  floor?: string;
  propertyId?: string | null;
}

/** A client (§5.1): one hotel, college or campus. Spaces point at it.
 *  Ownership (2026-09-24): `ownerId: null` means every studio account can
 *  see and manage it (every project made before ownership existed). */
export interface Property {
  id: string;
  version: 1;
  title: string;
  createdAt: string;
  ownerId: string | null;
  members: string[];
  /** The client's staff (2026-09-28): enquiries, reservations and the report only. */
  staff?: string[];
  /** How this session may use it: 'staff' sees only enquiries, reservations and the report. */
  access?: 'owner' | 'member' | 'staff';
  /** Branding on its tours; see ProjectTheme. */
  theme?: import('./config.types').ProjectTheme;
  /** Its brand information; see ProjectInfo. */
  info?: import('./config.types').ProjectInfo;
  /** Only on GET /api/properties. */
  spaceCount?: number;
  /** Only on GET /api/properties: a project from before accounts, listed by name only, to claim. */
  claimable?: boolean;
  /** Only on GET /api/properties/:id (the share panel). */
  ownerName?: string | null;
  memberDetails?: { id: string; name: string; email: string }[];
  staffDetails?: { id: string; name: string; email: string }[];
}

/** Optional Book now card (§7.6). Off unless a hotel asks for it. Everything
 *  past `url` is optional and absent on docs saved before 2026-09-21. */
export interface Booking {
  enabled: boolean;
  /** Button text, e.g. "Book now". */
  label: string;
  /** The hotel's booking page; may use {checkin} {checkout} {guests} {nights}. */
  url: string;
  /** Card heading, e.g. "Deluxe Suite". Empty -> the space's name. */
  title?: string;
  subtitle?: string;
  /** What the hotel typed, e.g. "$120" / "/ night" / "Includes taxes & fees".
   *  Not live pricing — there is no availability feed. */
  price?: string;
  priceUnit?: string;
  priceNote?: string;
  /** Ask for check-in, check-out and guests, and pass them in the link. */
  askDates?: boolean;
}

/** Scene document schema v2 (CLAUDE.md §5.2) as produced by sceneDoc.js today —
 *  a subset: no upload system yet, so `splat.variants` only ever has `high`. */
export interface TrackKeyframe {
  t: number;
  position: number[];
  target: number[];
  easing: string;
}

export interface Track {
  id: string;
  label: string;
  loop: boolean;
  autoplayOnLoad: boolean;
  keyframes: TrackKeyframe[];
  cues: unknown[];
  /** Narration (2026-09-28): an uploaded .m4a (an asset path), played as the visitor flies to this view. */
  audio: string | null;
  /** What the narration says, shown as a caption. */
  transcript?: string;
  /** Total flight time. Absent on docs saved before 2026-09-17 → 4 s. */
  seconds?: number;
  /** Filmstrip thumbnail (data URL). Absent → none. */
  thumb?: string | null;
}

/** How a space's model is stored (§5.2 splat.format). lcc2 streams through
 *  the XGRIDS SDK; glb is a 3D model (FBX/OBJ/PLY/glTF converted in the
 *  studio, src/features/studio/modelConvert.ts) loaded whole by src/features/scene/meshModel.ts;
 *  video360 is an equirectangular 360 camera video, streamed and shown
 *  around the viewer by src/features/scene/panoModel.ts. */
export type ModelFormat = 'lcc2' | 'glb' | 'video360';

export interface SplatVariant {
  assetId: string;
  /** The file to load inside the asset: the .lcc2 index, or the .obj/.ply. */
  meta: string;
  /** Total upload size. Recorded for glb, whose whole file is the bytes
   *  to first frame (publish warns past 35 MB). */
  bytes?: number;
}

/** A collision box (2026-09-29): an invisible wall or floor where the scan
 *  has none, e.g. a hole the scanner never covered. World units, like
 *  hotspots, so moving the model later doesn't move it. Turns about Y only.
 *  `color` is how the studio draws it; the tour never draws it at all. */
export interface Collider {
  id: string;
  label: string;
  position: [number, number, number];
  /** Full width, height, depth. */
  size: [number, number, number];
  /** Degrees about Y. */
  yaw: number;
  color: string;
}

export interface SceneDoc {
  id: string;
  version: 2;
  propertyId: string | null;
  title: string;
  splat: {
    format: ModelFormat;
    // high is mandatory (CLAUDE.md §7.5 won't publish without it); medium/low
    // fall back upward when absent (§8.2).
    variants: { high: SplatVariant; medium?: SplatVariant; low?: SplatVariant };
  };
  transform: { position: [number, number, number]; rotation: [number, number, number]; scale: number };
  unitScale: number;
  spawn: { position: [number, number, number]; yaw: number; eyeHeight: number };
  camera: { fov: number; near: number; far: number; mode: 'viewpoint' };
  viewpoints: unknown[];
  hotspots: import('./hotspot.types').Hotspot[];
  /** Absent on docs saved before 2026-09-29 -> none. */
  colliders?: Collider[];
  tracks: Track[];
  audio: null;
  cta: null;
  theme: null;
  /** Absent on docs saved before 2026-09-21 -> null (migrate.js). */
  booking: Booking | null;
  neighbours: string[];
  /** This space's night version: another space's id (features/scene/scenes.ts dayNightPair). */
  night?: string | null;
  /** Its building and floor, for sites with several (features/scene/scenes.ts placesMap). */
  building?: string;
  floor?: string;
  status: 'draft' | 'published';
}
