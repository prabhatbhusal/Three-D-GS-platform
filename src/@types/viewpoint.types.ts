export interface PathWaypoint {
  pos: [number, number, number];
  look: [number, number, number];
}

/** An authored camera shot (CLAUDE.md's "Track", legacy name in this file — §13). */
export interface Viewpoint {
  id: string;
  label: string;
  seconds: number;
  path: PathWaypoint[];
  thumb?: string;
  fov?: number;
  /** Set only on entries saved this session, so the editor knows what's editable. */
  session?: boolean;
}
