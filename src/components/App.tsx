'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSceneManager } from '../lib/useSceneManager';
import { Gizmo, useSceneTransform } from './Gizmo';
import { transformFor, setTransform, IDENTITY } from '../lib/transform';
import { walkerCfg } from '../lib/walkerConfig';
import { findFloorBelow, findStandingSpot } from '../lib/collision';
import { useCameraDirector } from '../lib/useCameraDirector';
import { useLccWalker } from '../lib/useLccWalker';
import { spawnFor, setSessionSpawn, hydrateScenes, SCENE_BY_ID, firstScene, isPublicTour } from '../lib/scenes';
import { hasWebGL2 } from '../lib/deviceTier';
import { tierProfile, detectTier } from '../lib/lccConfig';
import { EnquiryPanel } from './EnquiryPanel';
import './viewer.css';
import {
  liveViewpoints, subscribeViewpoints, exportViewpoints, poseWaypoint,
  newSessionViewpoint, updateSessionViewpoint, removeSessionViewpoint,
  appendWaypoint, removeWaypointFrom
} from '../lib/viewpoints';
import {
  hotspotsFor, addHotspot, updateHotspot, removeHotspot,
  placeHotspotAtCamera, exportSceneJSON, loadSceneDoc
} from '../lib/sceneDoc';
import { projected } from '../lib/hotspotProjector';
import { resetNavMode, navMode, useNavMode } from '../lib/navMode';
import { touch, isTouchDevice } from '../lib/mobileInput';
import { Viewer } from './Viewer';
import { EditorShell } from './EditorShell';
import { editorActive } from '../lib/editorActive';
import { useUiConfig } from '../lib/uiConfig';
import { getScenes } from '../lib/api';
import { unlockAudio } from '../lib/audio';
import { mapPose, setMapGoto } from '../lib/floorMap';
import type { EditorApi, ViewerState } from '../@types/app.types';
import type { Viewpoint } from '../@types/viewpoint.types';
import type { ProjectedHotspot } from '../@types/hotspot.types';
import type { Property } from '../@types/scene.types';

/* ================================================================== */
/* Inside the Canvas                                                   */
/* ================================================================== */

interface StageProps {
  onState: (s: ViewerState) => void;
  viewerMode: boolean;
}

function Stage({ onState, viewerMode }: StageProps) {
  const mgr = useSceneManager({ dev: (process.env.NODE_ENV !== 'production') });
  const { camera, gl, scene } = useThree() as { camera: THREE.PerspectiveCamera; gl: THREE.WebGLRenderer; scene: THREE.Scene };

  const walkerRef = useRef<ReturnType<typeof useLccWalker> | null>(null);
  const [flying, setFlying] = useState(false);
  const [vpTick, bumpVp] = useReducer((n) => n + 1, 0);
  const seq = useRef<object | null>(null);
  // Who to tell when the running sequence stops (the tour bar's play state).
  const seqEnd = useRef<(() => void) | null>(null);
  const endSeq = () => { const f = seqEnd.current; seqEnd.current = null; f?.(); };

  const { play, stop } = useCameraDirector({
    onArrive: () => walkerRef.current?.adoptCameraOrientation()
  });

  const walker = useLccWalker({
    renderer: mgr.renderer,
    sceneId: mgr.activeId,
    enabled: mgr.ready && !mgr.loading && !flying,
    pointerLock: viewerMode,
    alwaysControl: !viewerMode
  });
  walkerRef.current = walker;

  // The floor map (FloorMap.tsx): where the camera is in the scan's own
  // coordinates, every frame, and how to jump to a point on the plan.
  const mapP = useRef(new THREE.Vector3()).current, mapF = useRef(new THREE.Vector3()).current;
  useFrame(() => {
    const root: THREE.Object3D | undefined = mgr.renderer?.root;
    if (!root || !mgr.ready) { mapPose.ok = false; return; }
    root.worldToLocal(mapP.copy(camera.position));
    root.worldToLocal(mapF.set(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position));
    const fx = mapF.x - mapP.x, fy = mapF.y - mapP.y, l = Math.hypot(fx, fy) || 1;
    mapPose.x = mapP.x; mapPose.y = mapP.y; mapPose.fx = fx / l; mapPose.fy = fy / l; mapPose.ok = true;
  });
  useEffect(() => {
    setMapGoto((x, y, z) => {
      const root: THREE.Object3D | undefined = mgr.renderer?.root;
      const w = walkerRef.current;
      if (!root || !w) return;
      const p = root.localToWorld(new THREE.Vector3(x, y, z));
      w.reset([p.x, p.y, p.z], w.yaw());
    });
    return () => setMapGoto(null);
  }, [mgr.renderer]);

  useEffect(() => subscribeViewpoints(bumpVp), []);

  /**
   * Fly mode: circle the middle of the space, looking down on it. The middle
   * is taken from what was authored — every camera-track waypoint, or the
   * start view — not from the scan's bounds, which stray splats inflate
   * (§14). The camera is aimed high and far; the walker then pulls it in to
   * the first wall or ceiling in the way (collision.ts clearOrbitDistance),
   * so indoors it circles just under the ceiling and outdoors it stays up in
   * the air. Called on entering Fly, on Reset, and when a new space opens
   * while flying.
   */
  const openFloor = useRef(new Map<string, { x: number; y: number; z: number } | null>());
  /** Orbit: frame the room — circle its middle at eye level. (Fly is free
   *  flight and needs no framing; it takes off from where you are.) */
  const frameAerial = useCallback(() => {
    const pts: THREE.Vector3[] = [];
    for (const vp of liveViewpoints(mgr.activeId)) for (const w of vp.path) pts.push(new THREE.Vector3(...w.pos));
    if (!pts.length) {
      // No tracks: the start view may still be the placeholder, anywhere at
      // all. Use the open floor nearest the middle of the scan instead — the
      // walker's own "somewhere to stand" search — found once per space.
      let spot = openFloor.current.get(mgr.activeId);
      if (spot === undefined) {
        const r = mgr.renderer;
        spot = r ? findStandingSpot(r, r.getBounds?.(), { eyeHeight: walkerCfg.eyeHeight, radius: walkerCfg.radius }) : null;
        openFloor.current.set(mgr.activeId, spot);
      }
      pts.push(spot ? new THREE.Vector3(spot.x, spot.y, spot.z) : new THREE.Vector3(...spawnFor(mgr.activeId).spawn));
    }
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const spread = Math.max(0, ...pts.map((p) => p.distanceTo(c)));
    const u = walkerCfg.unitScale || 1;
    walkerCfg.orbitDist = Math.max(spread * 1.1, 4 * u);
    walkerCfg.orbitTarget = [c.x, c.y, c.z];
    camera.quaternion.setFromEuler(new THREE.Euler(-0.15, walkerRef.current?.yaw?.() ?? 0, 0, 'YXZ'));
    camera.position.copy(c).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), -walkerCfg.orbitDist);
    camera.updateMatrixWorld();
    walkerRef.current?.adoptCameraOrientation();
  }, [camera, mgr.activeId, mgr.renderer]);

  // Enter Fly or Orbit: remember where the visitor was. Orbit then frames the
  // room; Fly takes off from right here, like an Unreal viewport. Leave both:
  // put them back exactly where they were (or at the start view, if they
  // changed space meanwhile).
  const nav = useNavMode();
  const aerialKind = viewerMode ? (nav.flyEnabled ? 'fly' : nav.orbitEnabled ? 'orbit' : null) : null;
  const preFly = useRef<{ p: THREE.Vector3; q: THREE.Quaternion } | null>(null);
  const wasAerial = useRef<'fly' | 'orbit' | null>(null);
  useEffect(() => {
    if (aerialKind === wasAerial.current) return;
    const from = wasAerial.current;
    wasAerial.current = aerialKind;
    if (aerialKind) {
      stop();
      setFlying(false);
      if (!from) preFly.current = { p: camera.position.clone(), q: camera.quaternion.clone() };
      if (aerialKind === 'orbit') frameAerial();
      else walkerRef.current?.adoptCameraOrientation();
    } else if (preFly.current) {
      camera.position.copy(preFly.current.p);
      camera.quaternion.copy(preFly.current.q);
      camera.updateMatrixWorld();
      walkerRef.current?.adoptCameraOrientation();
      preFly.current = null;
    } else {
      const { spawn, yaw } = spawnFor(mgr.activeId);
      walkerRef.current?.reset(spawn, yaw);
    }
  }, [aerialKind, camera, frameAerial, stop, mgr.activeId]);
  // Saved tracks, hotspots and placement for whichever space is open.
  // The public tour reads the published copy; the studio (and its Preview) the draft.
  useEffect(() => { loadSceneDoc(mgr.activeId, isPublicTour() ? 'published' : 'draft'); }, [mgr.activeId]);
  useSceneTransform(mgr.renderer, mgr.activeId, mgr.unitScale, mgr.baseMatrix);

  const playViewport = useCallback(
    (vp: Viewpoint) => { setFlying(true); play(vp, { onDone: () => setFlying(false) }); },
    [play]
  );
  const stopFly = useCallback(() => {
    seq.current = null; stop(); setFlying(false);
  }, [stop]);

  const playSequence = useCallback(
    (list: Viewpoint[], { onIndex, onEnd }: { onIndex?: (i: number) => void; onEnd?: () => void } = {}) => {
      if (!list?.length) return;
      const token = {};
      seq.current = token;
      seqEnd.current = onEnd ?? null;
      let i = 0;
      const step = () => {
        if (seq.current !== token) return;
        onIndex?.(i);
        setFlying(true);
        play(list[i], {
          onDone: (arrived: boolean) => {
            if (seq.current !== token) return;
            if (!arrived) { seq.current = null; setFlying(false); endSeq(); return; }
            i = (i + 1) % list.length;
            setTimeout(step, 700);
          }
        });
      };
      step();
    },
    [play]
  );

  // New scene -> cancel flight, drop the walker at its spawn, and reopen in
  // viewpoints mode (CLAUDE.md §6.1 — walk must never carry over from the
  // space before it, or become the default by accident). Fly is the one
  // exception: browsing floors from above (the layers rail) stays aerial.
  useEffect(() => {
    stop();
    setFlying(false);
    const stayAerial = viewerMode && (navMode.flyEnabled || navMode.orbitEnabled);
    if (!stayAerial) resetNavMode();
    preFly.current = null; // the old space's pose means nothing here
    if (mgr.ready) {
      const { spawn, yaw } = spawnFor(mgr.activeId);
      walkerRef.current?.reset(spawn, yaw);
      if (stayAerial && navMode.orbitEnabled) frameAerial();
    }
  }, [mgr.activeId, mgr.ready, stop]); // eslint-disable-line react-hooks/exhaustive-deps -- frameAerial follows activeId

  const editor = useMemo((): EditorApi => {
    const yaw = () => walkerRef.current?.yaw?.() ?? 0;
    const snapshot = () => {
      try { return gl.domElement.toDataURL('image/jpeg', 0.55); } catch { return undefined; }
    };
    return {
      snapshot,
      getPose: () => ({
        x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: yaw()
      }),
      copySpawn: () => {
        const p = camera.position;
        const line = `spawn: [${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}], yaw: ${yaw().toFixed(2)},`;
        navigator.clipboard?.writeText(line);
        console.log('[scene] ' + line);
      },
      setSceneSpawn: () => {
        const p = camera.position;
        setSessionSpawn(mgr.activeId, [p.x, p.y, p.z], yaw());
      },
      setBackground: (hex: string) => {
        try { gl.setClearColor(hex); scene.background = new THREE.Color(hex); } catch { /* mid-type */ }
      },
      // --- camera tracks (the Views filmstrip) ---
      newViewFromPose: (label) =>
        newSessionViewpoint(mgr.activeId, {
          label, seconds: 3.5, path: [poseWaypoint(camera)], thumb: snapshot()
        }),
      updateViewToCurrent: (id) =>
        updateSessionViewpoint(mgr.activeId, id, { path: [poseWaypoint(camera)], thumb: snapshot() }),
      appendWpTo: (id) => appendWaypoint(mgr.activeId, id, camera),
      removeWpFrom: (id, i) => removeWaypointFrom(mgr.activeId, id, i),
      renameView: (id, label) => updateSessionViewpoint(mgr.activeId, id, { label }),
      setViewSeconds: (id, s) => updateSessionViewpoint(mgr.activeId, id, { seconds: Number(s) || 3 }),
      removeViewpoint: (id) => removeSessionViewpoint(mgr.activeId, id),
      play: (vp) => playViewport(vp),
      playSequence,
      stopSequence: () => { seq.current = null; stop(); setFlying(false); endSeq(); },
      exportAll: () => exportViewpoints(),
      // --- hotspots ---
      addHotspot: (type) => addHotspot(mgr.activeId, camera, type),
      updateHotspot: (id, patch) => updateHotspot(mgr.activeId, id, patch),
      removeHotspot: (id) => removeHotspot(mgr.activeId, id),
      placeHotspotAtCamera: (id) => placeHotspotAtCamera(mgr.activeId, id, camera),
      lookAtHotspot: (id) => {
        const h = hotspotsFor(mgr.activeId).find((x) => x.id === id);
        if (!h) return;
        camera.lookAt(h.position[0], h.position[1], h.position[2]);
        camera.updateMatrixWorld();
        walkerRef.current?.adoptCameraOrientation();
      },
      exportScene: () => exportSceneJSON(mgr.activeId),
      // --- model placement (§7.2) ---
      resetTransform: () => setTransform(mgr.activeId, IDENTITY),
      dropToFloor: () => {
        if (!mgr.renderer) return 'The model is still loading.';
        const shape = { eyeHeight: walkerCfg.eyeHeight, radius: walkerCfg.radius };
        const p = camera.position;
        const at = findFloorBelow(mgr.renderer, p.x, p.z, p.y, p.y - 40 * (walkerCfg.unitScale || 1), shape);
        if (!at) return 'No floor under this view. Move over the floor and try again.';
        const floorY = at.y - shape.eyeHeight;
        const t = transformFor(mgr.activeId);
        setTransform(mgr.activeId, { position: [t.position[0], t.position[1] - floorY, t.position[2]] });
        camera.position.y -= floorY; // keep the same view of the model
        return `Floor moved to 0 m (it was at ${floorY.toFixed(2)} m).`;
      }
    };
  }, [camera, gl, scene, mgr.activeId, play, playViewport, playSequence, stop]);

  useEffect(() => {
    onState({
      activeId: mgr.activeId,
      activeName: mgr.activeName,
      tagline: mgr.tagline,
      loading: mgr.loading,
      progress: mgr.progress,
      ready: mgr.ready,
      failed: mgr.failed,
      unitScale: mgr.unitScale,
      flying,
      viewpoints: liveViewpoints(mgr.activeId),
      select: mgr.select,
      playViewport,
      stopFly,
      flyReset: () => {
        if (navMode.orbitEnabled) { frameAerial(); return; }
        const home = preFly.current;
        if (home) {
          camera.position.copy(home.p);
          camera.quaternion.copy(home.q);
        } else {
          const { spawn, yaw } = spawnFor(mgr.activeId);
          camera.position.set(...spawn);
          camera.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
        }
        camera.updateMatrixWorld();
        walkerRef.current?.adoptCameraOrientation();
      },
      editor
    });
  }, [
    mgr.activeId, mgr.activeName, mgr.tagline, mgr.loading, mgr.progress,
    mgr.ready, mgr.failed, mgr.unitScale, mgr.select, flying, vpTick, playViewport, stopFly, frameAerial, editor, onState
  ]);

  return (
    <>
      <HotspotProjector sceneId={mgr.activeId} />
      {!viewerMode && <Gizmo sceneId={mgr.activeId} />}
    </>
  );
}

/** Projects the active scene's hotspots to screen pixels each frame for the
 *  DOM markers. Runs after the walker (child component -> later useFrame). */
function HotspotProjector({ sceneId }: { sceneId: string }) {
  const { camera, size } = useThree();
  const idRef = useRef(sceneId);
  idRef.current = sceneId;
  const p = useRef(new THREE.Vector3()).current;

  useFrame(() => {
    const list: ProjectedHotspot[] = [];
    for (const h of hotspotsFor(idRef.current)) {
      p.set(h.position[0], h.position[1], h.position[2]);
      const dist = p.distanceTo(camera.position);
      p.project(camera);
      list.push({
        id: h.id, type: h.type, label: h.label, dist,
        x: (p.x * 0.5 + 0.5) * size.width,
        y: (-p.y * 0.5 + 0.5) * size.height,
        onScreen: p.z < 1 && Math.abs(p.x) < 1.3 && Math.abs(p.y) < 1.3
      });
    }
    list.sort((a, b) => b.dist - a.dist); // far ones drawn first
    projected.list = list;
  });
  return null;
}

/* ================================================================== */
/* Root                                                                */
/* ================================================================== */

/** `property` is set on /studio/<property>: the editor works inside that
 *  client's spaces only (scenes.ts scopeToProperty, called before mount). */
export default function App({ property }: { property?: Property } = {}) {
  const [state, setState] = useState<ViewerState | null>(null);
  const [isTouch] = useState(() => isTouchDevice());
  const editing = editorActive();
  const [previewing, setPreviewing] = useState(false);
  // CLAUDE.md §3 constraint 5 / §8.1 rule 1: no WebGL2, no splat attempt at
  // all — checked once, synchronously, before the SDK gets anywhere near it.
  const [webgl2] = useState(() => hasWebGL2());
  // Tier decides dpr (§8 table: 1 low, 1.25 medium, 1.5 high) — resolved
  // once, the same cached value useSceneManager reads, so the Canvas and the
  // loader never disagree. Never above the screen's own ratio.
  const [tierDpr] = useState(() => Math.min(tierProfile(detectTier()).dpr, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1));
  // The visitor's HD toggle drops to 1× for weak devices or a hot laptop.
  const dpr = useUiConfig().hd === false ? 1 : tierDpr;

  useEffect(() => { touch.enabled = isTouch; }, [isTouch]);

  // Best-effort metadata refresh from the Node API — never blocks the first
  // frame (the SDK is already loading off the static list by the time this
  // resolves), and quietly no-ops if the API is down or unreachable.
  useEffect(() => {
    // The public tour was already hydrated from published docs by /tour —
    // draft metadata here would leak unpublished edits to visitors.
    if (!isPublicTour()) getScenes().then(hydrateScenes).catch(() => {});
  }, []);

  const onState = useMemo(() => (s: ViewerState) => setState(s), []);
  const viewerMode = !editing || previewing;

  // No renderer, no problem: constraint 5 says the enquiry path must still
  // work. Skip the Canvas entirely rather than let it fail deep inside the
  // SDK — this stays a plain, fast, indexable page.
  if (!webgl2) {
    const conf = SCENE_BY_ID[firstScene()];
    return (
      <div className="app-root">
        <div className="vw-enter">
          <div className="vw-enter-in">
            <p className="vw-enter-brand">Virtual tour</p>
            <h1 className="vw-enter-mark">{conf?.name ?? 'This space'}</h1>
            <p className="vw-fallback-note">
              Your browser can&apos;t run the 3D tour, but you can still ask about
              this space below.
            </p>
          </div>
        </div>
        <EnquiryPanel sceneId={firstScene()} sceneName={conf?.name} />
      </div>
    );
  }

  return (
    <div className="app-root" data-preview={editing && previewing ? '' : undefined}>
      <Canvas
        frameloop="always"
        gl={{
          antialias: false,
          // SDK assumes plain WebGLRenderer defaults; ACES washes the splats out.
          toneMapping: THREE.NoToneMapping,
          // So the editor can grab view thumbnails off the canvas.
          preserveDrawingBuffer: editing
        }}
        dpr={dpr}
        camera={{ fov: 60, near: 0.25, far: 300, position: [0, 1.7, 3] }}
      >
        <Stage onState={onState} viewerMode={viewerMode} />
      </Canvas>

      {viewerMode && (
        <Viewer
          state={state}
          isTouch={isTouch}
          autoStart={previewing}
          tour={previewing}
        />
      )}

      {editing && !previewing && (
        <EditorShell state={state} property={property} onPreview={() => {
          unlockAudio(); // the Preview click is this path's gesture — there is no enter gate
          setPreviewing(true);
        }} />
      )}

      {editing && previewing && (
        <button className="pv-exit" onClick={() => setPreviewing(false)}>✕ Exit preview</button>
      )}
    </div>
  );
}
