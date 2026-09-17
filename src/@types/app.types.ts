import type { Viewpoint } from './viewpoint.types';
import type { Hotspot, HotspotType } from './hotspot.types';

/** Editor commands exposed by App.jsx's <Stage>, consumed by EditorShell and
 *  the viewer's own preview path. Kept loose (return types vary by call site)
 *  since this is an internal authoring bridge, not a public API. */
export interface EditorApi {
  snapshot: () => string | undefined;
  getPose: () => { x: number; y: number; z: number; yaw: number };
  copySpawn: () => void;
  setSceneSpawn: () => void;
  setBackground: (hex: string) => void;
  newViewFromPose: (label?: string) => Viewpoint;
  updateViewToCurrent: (id: string) => void;
  appendWpTo: (id: string) => void;
  removeWpFrom: (id: string, i: number) => void;
  renameView: (id: string, label: string) => void;
  setViewSeconds: (id: string, seconds: number) => void;
  removeViewpoint: (id: string) => void;
  play: (vp: Viewpoint) => void;
  playSequence: (list: Viewpoint[], opts?: { onIndex?: (i: number) => void }) => void;
  stopSequence: () => void;
  exportAll: () => string;
  addHotspot: (type: HotspotType) => Hotspot | undefined;
  updateHotspot: (id: string, patch: Partial<Hotspot>) => void;
  removeHotspot: (id: string) => void;
  placeHotspotAtCamera: (id: string) => void;
  lookAtHotspot: (id: string) => void;
  exportScene: () => string;
  resetTransform: () => void;
  /** Moves the model so the floor under the camera sits at y = 0. Returns a
   *  sentence for the inspector to show. */
  dropToFloor: () => string;
}

/** The state object App.jsx's <Stage> reports up to Viewer / EditorShell. */
export interface ViewerState {
  activeId: string;
  activeName: string;
  tagline: string;
  loading: boolean;
  progress: number;
  ready: boolean;
  unitScale: number;
  flying: boolean;
  viewpoints: Viewpoint[];
  select: (sceneId: string) => void;
  playViewport: (vp: Viewpoint) => void;
  stopFly: () => void;
  editor: EditorApi;
}
