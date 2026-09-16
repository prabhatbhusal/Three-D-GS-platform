'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSceneManager } from '../lib/useSceneManager';
import { useCameraDirector } from '../lib/useCameraDirector';
import { useLccWalker } from '../lib/useLccWalker';
import { spawnFor, setSessionSpawn, hydrateScenes, DEFAULT_SCENE, SCENE_BY_ID } from '../lib/scenes';
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
  placeHotspotAtCamera, exportSceneJSON
} from '../lib/sceneDoc';
import { projected } from '../lib/hotspotProjector';
import { resetNavMode } from '../lib/navMode';
import { touch, isTouchDevice } from '../lib/mobileInput';
import { Viewer } from './Viewer';
import { EditorShell } from './EditorShell';
import { editorActive } from '../lib/editorActive';
import { getScenes } from '../lib/api';
import type { EditorApi, ViewerState } from '../@types/app.types';
import type { Viewpoint } from '../@types/viewpoint.types';
import type { ProjectedHotspot } from '../@types/hotspot.types';

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

  useEffect(() => subscribeViewpoints(bumpVp), []);

  const playViewport = useCallback(
    (vp: Viewpoint) => { setFlying(true); play(vp, { onDone: () => setFlying(false) }); },
    [play]
  );
  const stopFly = useCallback(() => {
    seq.current = null; stop(); setFlying(false);
  }, [stop]);

  const playSequence = useCallback(
    (list: Viewpoint[], { onIndex }: { onIndex?: (i: number) => void } = {}) => {
      if (!list?.length) return;
      const token = {};
      seq.current = token;
      let i = 0;
      const step = () => {
        if (seq.current !== token) return;
        onIndex?.(i);
        setFlying(true);
        play(list[i], {
          onDone: (arrived: boolean) => {
            if (seq.current !== token) return;
            if (!arrived) { seq.current = null; setFlying(false); return; }
            i = (i + 1) % list.length;
            setTimeout(step, 700);
          }
        });
      };
      step();
    },
    [play]
  );

  // New scene -> cancel flight, drop the walker at its spawn, and always
  // reopen in viewpoints mode (CLAUDE.md §6.1 — walk must never carry over
  // from the space before it, or become the default by accident).
  useEffect(() => {
    stop();
    setFlying(false);
    resetNavMode();
    if (mgr.ready) {
      const { spawn, yaw } = spawnFor(mgr.activeId);
      walkerRef.current?.reset(spawn, yaw);
    }
  }, [mgr.activeId, mgr.ready, stop]);

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
      stopSequence: () => { seq.current = null; stop(); setFlying(false); },
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
      exportScene: () => exportSceneJSON(mgr.activeId)
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
      unitScale: mgr.unitScale,
      flying,
      viewpoints: liveViewpoints(mgr.activeId),
      select: mgr.select,
      playViewport,
      stopFly,
      editor
    });
  }, [
    mgr.activeId, mgr.activeName, mgr.tagline, mgr.loading, mgr.progress,
    mgr.ready, mgr.unitScale, mgr.select, flying, vpTick, playViewport, stopFly, editor, onState
  ]);

  return <HotspotProjector sceneId={mgr.activeId} />;
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

export default function App() {
  const [state, setState] = useState<ViewerState | null>(null);
  const [isTouch] = useState(() => isTouchDevice());
  const editing = editorActive();
  const [previewing, setPreviewing] = useState(false);
  // CLAUDE.md §3 constraint 5 / §8.1 rule 1: no WebGL2, no splat attempt at
  // all — checked once, synchronously, before the SDK gets anywhere near it.
  const [webgl2] = useState(() => hasWebGL2());
  // Tier decides dpr (CLAUDE.md §8 table) — resolved once, same cached value
  // useSceneManager reads, so the Canvas and the loader never disagree.
  const [dpr] = useState(() => tierProfile(detectTier()).dpr);

  useEffect(() => { touch.enabled = isTouch; }, [isTouch]);

  // Best-effort metadata refresh from the Node API — never blocks the first
  // frame (the SDK is already loading off the static list by the time this
  // resolves), and quietly no-ops if the API is down or unreachable.
  useEffect(() => {
    getScenes().then(hydrateScenes).catch(() => {});
  }, []);

  const onState = useMemo(() => (s: ViewerState) => setState(s), []);
  const viewerMode = !editing || previewing;

  // No renderer, no problem: constraint 5 says the enquiry path must still
  // work. Skip the Canvas entirely rather than let it fail deep inside the
  // SDK — this stays a plain, fast, indexable page.
  if (!webgl2) {
    const conf = SCENE_BY_ID[DEFAULT_SCENE];
    return (
      <div className="app-root">
        <div className="vw-enter">
          <div className="vw-enter-spot" />
          <div className="vw-enter-in">
            <p className="vw-enter-kicker">Virtual tour</p>
            <h1 className="vw-enter-mark">{conf?.name ?? 'This space'}</h1>
            <p className="vw-fallback-note">
              Your browser can&apos;t run the 3D tour, but you can still ask about
              this space below.
            </p>
          </div>
        </div>
        <EnquiryPanel sceneId={DEFAULT_SCENE} sceneName={conf?.name} />
      </div>
    );
  }

  return (
    <div className="app-root">
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
        <EditorShell state={state} onPreview={() => setPreviewing(true)} />
      )}

      {editing && previewing && (
        <button className="pv-exit" onClick={() => setPreviewing(false)}>✕ Exit preview</button>
      )}
    </div>
  );
}
