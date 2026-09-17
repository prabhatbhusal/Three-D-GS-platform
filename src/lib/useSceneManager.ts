import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LCCRender } from '../vendor/sdk/lcc-web-sdk.js';
import { SCENE_BY_ID, metaPath, spawnFor, firstScene } from './scenes';
import { buildLoadOptions, tuneCameraForRoom, resolveTier } from './lccConfig';
import { persistMeasuredTier, createFpsMonitor, logTierLine } from './deviceTier';
import { walkerCfg, scaleWalkerCfg } from './walkerConfig';

/** The SDK's per-scene renderer handle (collision, raycast, bounds — untyped,
 *  see @types/vendor.d.ts) plus our own load bookkeeping. */
interface SceneEntry {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK renderer handle, see @types/vendor.d.ts
  renderer: any;
  mesh: THREE.Object3D | null;
  state: 'loading' | 'ready' | 'error';
  t0: number;
  loadMs?: number;
  unitScale?: number;
}

/**
 * Fallback guess for world-units-per-metre from the scan's bbox, used only when
 * a scene has no explicit `unitScale`. Lixel Studio exports are metric almost
 * without exception and the meta bbox is often inflated by stray splats far
 * from the room (bar-restro's spans ~58 units), so this defaults to 1 and only
 * scales up when the whole scan is clearly sub-metre. Set an explicit
 * `unitScale` in scenes.js for any scene that is genuinely not in metres.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK renderer handle
function unitScaleFromBounds(renderer: any): number {
  try {
    const b = renderer?.getBounds?.();
    if (!b) return 1;
    const diag = Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
    if (!isFinite(diag) || diag <= 0) return 1;
    if (diag < 1.5) return Math.min(3 / diag, 20);
    return 1;
  } catch {
    return 1;
  }
}

/**
 * LCC is Z-up, Three is Y-up. Correct it on the MODEL, not the camera, so
 * gravity stays at -Y and every controller assumption stays simple. This exact
 * matrix is from the SDK's own three.html example.
 */
export const LCC_MODEL_MATRIX = new THREE.Matrix4(
  -1, 0, 0, 0,
   0, 0, 1, 0,
   0, 1, 0, 0,
   0, 0, 0, 1
);

/**
 * Loads exactly ONE hotel scene at a time.
 *
 * The campus demo kept 5 rooms resident with LRU eviction and graph prefetch
 * because you could walk between them. These two scans are unrelated spaces
 * picked from a menu, so the rule is simpler and lighter: load the chosen
 * scene, unload whatever was loaded before, done.
 *
 * `LCCRender.load()` returns a per-scene renderer (collision, raycast,
 * setVisible); `LCCRender.unload(renderer)` calls destroyRenderer() internally,
 * which is what actually frees GPU memory.
 */
export function useSceneManager({ dev = false, appKey = null }: { dev?: boolean; appKey?: string | null } = {}) {
  const { scene, camera, gl } = useThree() as { scene: THREE.Scene; camera: THREE.PerspectiveCamera; gl: THREE.WebGLRenderer };

  // CLAUDE.md §8.1: a GUESS, corrected by measurement. tierRef is mutable
  // (not the resolved value straight into a const) because the FPS monitor
  // below can downgrade it once, mid-session, and reload at the new tier.
  const resolved = useRef(resolveTier()).current; // { tier, guessed, source, deviceStorageKey }
  const tierRef = useRef(resolved.tier);
  const downgradedRef = useRef(false);
  const fpsMonitor = useRef<ReturnType<typeof createFpsMonitor> | null>(null);

  const current = useRef<SceneEntry | null>(null);
  const [activeId, setActiveId] = useState(firstScene);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  // Surfaced as state (not read off the ref during render) so consumers
  // re-render when they land.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK renderer handle
  const [renderer, setRenderer] = useState<any>(null);
  const [unitScale, setUnitScale] = useState(1);

  const load = useCallback(
    (sceneId: string) => {
      const conf = SCENE_BY_ID[sceneId];
      if (!conf) {
        console.error(`[scene] unknown scene "${sceneId}"`);
        return;
      }

      // Tear down the previous scene first — one renderer at a time.
      if (current.current?.renderer) {
        LCCRender.unload(current.current.renderer);
        if (current.current.mesh?.parent) {
          current.current.mesh.parent.remove(current.current.mesh);
        }
      }

      const entry: SceneEntry = { id: sceneId, renderer: null, mesh: null, state: 'loading', t0: performance.now() };
      current.current = entry;

      setActiveId(sceneId);
      setRenderer(null);
      setReady(false);
      setLoading(true);
      setProgress(0);

      const tier = tierRef.current;
      camera.position.set(...spawnFor(sceneId).spawn);
      tuneCameraForRoom(camera, { outdoor: !!conf.outdoor, tier });

      entry.renderer = LCCRender.load(
        buildLoadOptions({
          camera, scene, renderer: gl, canvas: gl.domElement, THREE,
          dataPath: metaPath(sceneId),
          modelMatrix: LCC_MODEL_MATRIX,
          appKey,
          visible: true,
          tier
        }),
        (mesh: THREE.Object3D) => {
          if (current.current !== entry) return; // superseded mid-load
          entry.mesh = mesh;
          entry.state = 'ready';
          entry.loadMs = Math.round(performance.now() - entry.t0);

          // Bind the SDK's sorter/culler to this exact camera instance.
          LCCRender.setCamera?.(camera);

          // World-units-per-metre: an explicit `unitScale` in scenes.js wins;
          // otherwise measure the scan's bbox. The measurement drives eye
          // height, speeds, collision radius, gravity and the near plane, so a
          // wrong value here is what makes you fall through the floor or spawn
          // in the ceiling.
          const measured = unitScaleFromBounds(entry.renderer);
          const u = typeof conf.unitScale === 'number' && Number.isFinite(conf.unitScale) && conf.unitScale > 0
            ? conf.unitScale
            : measured;
          scaleWalkerCfg(u);
          const b = entry.renderer?.getBounds?.();
          if (b) {
            const diag = Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
            walkerCfg.far = Math.max(diag * 4, 60 * u);
          }
          camera.near = walkerCfg.near;
          camera.far = walkerCfg.far;
          camera.updateProjectionMatrix();
          entry.unitScale = u;

          // CLAUDE.md §8.1: one log line every load, tier + why. Also arms the
          // measured-downgrade monitor (sampled in the useFrame below) unless
          // this load IS the downgrade (nothing lower than 'low' to fall to).
          logTierLine({ tier, guessed: resolved.guessed, downgraded: downgradedRef.current, variant: tier });
          // --- MAX-GRAPHICS OVERRIDE (temporary, requested 2026-09-17) ---
          // Runtime measured-FPS downgrade disabled so a session never drops
          // out of "high" once it's forced there (deviceTier.ts). To revert,
          // uncomment this block (and revert deviceTier.ts's resolveInitialTier).
          /*
          fpsMonitor.current = createFpsMonitor({
            tier,
            onDowngrade: (nextTier: typeof tier, medianFps: number) => {
              console.warn(`[tier] median ${medianFps.toFixed(1)}fps on "${tier}" — downgrading to "${nextTier}"`);
              downgradedRef.current = true;
              tierRef.current = nextTier;
              persistMeasuredTier(resolved.deviceStorageKey, nextTier);
              load(sceneId); // once — createFpsMonitor won't fire a second time
            }
          });
          */

          if (dev) {
            window.__LCC = LCCRender;
            window.__scene = entry.renderer;
            window.__camera = camera;
            console.log(
              `[scene] "${sceneId}" ready in ${entry.loadMs}ms`,
              `\n  collision=${!!entry.renderer?.hasCollision?.()}`,
              `shCoef=${!!entry.renderer?.hasShcoef?.()}`,
              `env=${!!entry.renderer?.hasEnvironment?.()}`,
              b ? `\n  bounds=${JSON.stringify(b)}` : '',
              `\n  unitScale=${u.toFixed(3)} ${conf.unitScale ? '(pinned in scenes.js)' : `(auto; bbox fallback = ${measured.toFixed(2)})`}`,
              `\n  eyeHeight=${walkerCfg.eyeHeight.toFixed(2)} radius=${walkerCfg.radius.toFixed(2)}`,
              `near=${walkerCfg.near.toFixed(3)} far=${walkerCfg.far.toFixed(0)}`
            );
          }
          setProgress(1);
          setUnitScale(u);
          setRenderer(entry.renderer);
          setReady(true);
          setLoading(false);
        },
        (p: number) => {
          if (current.current === entry) setProgress(p);
        },
        () => {
          if (current.current !== entry) return;
          entry.state = 'error';
          setLoading(false);
          console.error(`[scene] "${sceneId}" failed to load — ${metaPath(sceneId)}`);
        }
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tierRef/resolved/downgradedRef are refs, stable identity
    [scene, camera, gl, appKey, dev]
  );

  const select = useCallback(
    (sceneId: string) => {
      if (sceneId === current.current?.id) return;
      load(sceneId);
    },
    [load]
  );

  // Initial load + teardown.
  useEffect(() => {
    load(firstScene());
    return () => {
      LCCRender.dispose();
      current.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CLAUDE.md §8.1 rule 6: verify the guess by measurement. Runs every frame,
  // but the monitor itself only checks its rolling window every ~5s and only
  // acts (downgrade, once, never upgrade) if it's stayed bad for 3 of them.
  useFrame((_, dt) => {
    fpsMonitor.current?.sample(dt);
  });

  const conf = SCENE_BY_ID[activeId];

  return {
    activeId,
    activeName: conf?.name ?? '',
    tagline: conf?.tagline ?? '',
    loading,
    progress,
    ready,
    select,
    /** Pass to the walker so it only collides with the live scene. */
    renderer,
    unitScale,
    stats: () => ({
      tier: tierRef.current,
      scene: activeId,
      renderers: LCCRender.getAllRenderers?.()?.length ?? 0,
      drawCalls: gl.info.render.calls,
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
      far: camera.far,
      loadMs: current.current?.loadMs ?? null
    })
  };
}
