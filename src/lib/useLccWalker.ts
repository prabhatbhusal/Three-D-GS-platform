import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LCCRender } from '../vendor/sdk/lcc-web-sdk.js';
import { touch } from './mobileInput';
import { walkerCfg } from './walkerConfig';
import { navMode } from './navMode';
import { dropWaypoint, closeViewpoint, exportViewpoints } from './viewpoints';
import { addHotspot } from './sceneDoc';
import { findFloorBelow, findStandingSpot } from './collision';
import { gizmo } from './transform';

// Angular only — these do NOT scale with the scene, unlike everything in
// walkerConfig.js (which is in world units and set from the scan's size).
const LOOK = 0.0022; // mouse: rad per px
const TOUCH_LOOK = 0.005; // touch drag: rad per px

/**
 * True when a keystroke belongs to a text field rather than the camera.
 *
 * The listeners here are on `window`, so without this every character typed
 * anywhere in the studio also drove the walker: WASD walked, N flipped
 * walk/fly, B/H/V dropped scene objects, and `Space` was preventDefault-ed —
 * which meant a space could not be typed into any input at all.
 *
 * Guard keydown with this, never keyup: a key held down over the canvas and
 * released after focus moved into a field must still be cleared, or it stays
 * in `keys` and the visitor walks forever.
 */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
    || el.tagName === 'SELECT' || el.isContentEditable;
}

/**
 * Camera controller. `walkerCfg.mode` picks one:
 *
 *   walk   — 1st person, gravity + capsule collision, WASD / joystick, Shift
 *            or Run to sprint. Falls back to `fly` if the scan has no collision.
 *   fly    — no gravity, free 6-dof, Space / C for up / down  (key N toggles it)
 *   orbit  — camera swings around walkerCfg.orbitTarget (studio only)
 *
 * Third-person/avatar mode is removed (CLAUDE.md §6.1 [remove]) — there is no
 * character mesh, camera boom, or feet-anchored capsule sim any more.
 *
 * All speeds / heights / the near plane come from `walkerConfig.js`, which the
 * scene manager fills in from the scan's measured size — LCC exports are not
 * reliably 1 unit = 1 metre, and a wrong scale is what makes you fall through
 * the floor AND makes near-surface splats explode into rotating lines.
 *
 * COLLISION: renderer.intersectsCapsule({ start, end, radius }) -> { hit, delta }
 * where `delta` is a push-out. Resolve horizontal and vertical in SEPARATE
 * passes or a scuffed wall flings you sideways. Clamp dt or a backgrounded tab
 * tunnels you through the floor.
 */
interface UseLccWalkerOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK per-scene renderer handle, see @types/vendor.d.ts
  renderer: any;
  enabled?: boolean;
  sceneId: string;
  pointerLock?: boolean; // visitor: click captures the mouse. editor: false.
  alwaysControl?: boolean; // editor: WASD works without holding the mouse
}

export function useLccWalker({
  renderer, enabled = true, sceneId,
  pointerLock = true,
  alwaysControl = false
}: UseLccWalkerOptions) {
  const { camera, gl } = useThree() as { camera: THREE.PerspectiveCamera; gl: THREE.WebGLRenderer };

  const keys = useRef(new Set<string>());
  const look = useRef({ yaw: 0, pitch: 0 });
  const vel = useRef(new THREE.Vector3());
  const grounded = useRef(false);
  const locked = useRef(false);
  const dragging = useRef(false); // left-drag look (no pointer lock)
  const touchLook = useRef<{ id: number; x: number; y: number } | null>(null);
  const wheel = useRef(0); // accumulated wheel delta, consumed each frame
  // Last place the walker was actually standing — where a fall out of the
  // world gets undone to. A scan with gaps in its collision mesh is normal.
  const safeGround = useRef<THREE.Vector3 | null>(null);

  const pointerLockRef = useRef(pointerLock);
  pointerLockRef.current = pointerLock;
  const alwaysRef = useRef(alwaysControl);
  alwaysRef.current = alwaysControl;

  const rendererRef = useRef(renderer);
  rendererRef.current = renderer;
  const sceneRef = useRef(sceneId);
  sceneRef.current = sceneId;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const v = useRef({
    fwd: new THREE.Vector3(),
    right: new THREE.Vector3(),
    wish: new THREE.Vector3(),
    tgt: new THREE.Vector3(),
    euler: new THREE.Euler(0, 0, 0, 'YXZ')
  }).current;

  /* ---------------------------------------------------------------- */
  /* Input                                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const el = gl.domElement;
    const clampPitch = () => {
      const lim = Math.PI / 2 - 0.05;
      look.current.pitch = Math.max(-lim, Math.min(lim, look.current.pitch));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return; // typing a name must not walk the camera
      keys.current.add(e.code);
      if (e.code === 'Space') e.preventDefault();

      if (e.code === 'KeyB') dropWaypoint(camera);
      if (e.code === 'KeyH') addHotspot(sceneRef.current, camera, 'text');
      if (e.code === 'KeyV') {
        if (e.shiftKey) exportViewpoints();
        else closeViewpoint(sceneRef.current, camera);
      }
      if (e.code === 'KeyP') {
        const p = camera.position;
        console.log(
          `[pose] spawn: [${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}]`,
          `yaw: ${look.current.yaw.toFixed(2)}`
        );
      }
      // N toggles walk <-> fly (fly = the old "noclip").
      if (e.code === 'KeyN') {
        walkerCfg.mode = walkerCfg.mode === 'fly' ? 'walk' : 'fly';
        vel.current.set(0, 0, 0);
        console.log(`[walker] mode = ${walkerCfg.mode}`);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);

    let dragX = 0, dragY = 0;
    const onMouseMove = (e: MouseEvent) => {
      if (locked.current) {
        look.current.yaw -= e.movementX * LOOK;
        look.current.pitch -= e.movementY * LOOK;
        clampPitch();
      } else if (dragging.current) {
        look.current.yaw -= (e.clientX - dragX) * LOOK * 1.6;
        look.current.pitch -= (e.clientY - dragY) * LOOK * 1.6;
        dragX = e.clientX; dragY = e.clientY;
        clampPitch();
      }
    };
    const onWheel = (e: WheelEvent) => { wheel.current += e.deltaY; };

    // Visitor: click captures the pointer. Editor (pointerLock=false): press-drag
    // to look, like an orbit tool — no capture, panels stay clickable.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || touch.enabled) return;
      // The gizmo's pointerdown runs first and has already claimed this drag.
      if (gizmo.dragging) return;
      if (pointerLockRef.current) { el.requestPointerLock(); return; }
      dragging.current = true;
      dragX = e.clientX; dragY = e.clientY;
      el.style.cursor = 'grabbing';
    };
    const onMouseUp = () => {
      dragging.current = false;
      el.style.cursor = '';
    };
    const onLock = () => {
      locked.current = document.pointerLockElement === el;
      if (!locked.current) keys.current.clear();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (touchLook.current) return;
      const t = e.changedTouches[0];
      touchLook.current = { id: t.identifier, x: t.clientX, y: t.clientY };
    };
    const onTouchMove = (e: TouchEvent) => {
      const tl = touchLook.current;
      if (!tl) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== tl.id) continue;
        look.current.yaw -= (t.clientX - tl.x) * TOUCH_LOOK;
        look.current.pitch -= (t.clientY - tl.y) * TOUCH_LOOK;
        clampPitch();
        tl.x = t.clientX;
        tl.y = t.clientY;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      const tl = touchLook.current;
      if (tl && Array.from(e.changedTouches).some((t) => t.identifier === tl.id)) {
        touchLook.current = null;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('wheel', onWheel, { passive: true });
    document.addEventListener('pointerlockchange', onLock);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onLock);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [gl, camera]);

  /* ---------------------------------------------------------------- */
  /* Depenetration                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Put the camera on solid ground near `spawn`. A scan's collision mesh only
   * covers where the operator walked, so an authored (or, for a fresh upload,
   * a guessed) spawn can sit over nothing at all — and gravity then drops the
   * visitor out of the world with nothing to stop them.
   *
   * Uses capsule stepping rather than `LCCRender.raycastFromOrigin`, which
   * this used to call: that returns nothing usable on these scans, so the
   * floor-snap never actually ran.
   */
  function dropToFloor(spawn: [number, number, number]) {
    const r = rendererRef.current;
    if (!r?.intersectsCapsule) return;
    const shape = { eyeHeight: walkerCfg.eyeHeight, radius: walkerCfg.radius };
    const reach = 8 * walkerCfg.unitScale;

    // Near the spawn first, so an authored start view keeps its framing.
    const near = findFloorBelow(r, spawn[0], spawn[2], spawn[1] + reach, spawn[1] - reach * 6, shape);
    if (near) {
      camera.position.set(near.x, near.y, near.z);
      return;
    }

    // Nothing under the spawn at all — find ground anywhere in the scan
    // rather than leaving the visitor in free fall.
    const bounds = r.getBounds?.();
    const spot = bounds ? findStandingSpot(r, bounds, shape) : null;
    if (spot) {
      camera.position.set(spot.x, spot.y, spot.z);
      console.warn(
        `[walker] nothing to stand on at the spawn — moved to ${spot.x.toFixed(1)}, ${spot.y.toFixed(1)}, ${spot.z.toFixed(1)}. Set a start view (§15).`
      );
    }
  }

  /**
   * A scan's collision mesh stops where the operator stopped walking, so
   * stepping off its edge means falling with nothing below to catch you —
   * which reads to a visitor as the tour breaking. Put them back on the last
   * ground they actually stood on once they've fallen clear of the scan.
   */
  function catchFall() {
    const r = rendererRef.current;
    const safe = safeGround.current;
    const scanFloor = r?.getBounds?.()?.min?.y;

    // Trigger on whichever comes first on the way down: a drop further than
    // any real interior step, or falling clear out of the scan. Waiting for
    // the scan floor alone means a 100 m plunge before anything happens.
    const limits: number[] = [];
    if (safe) limits.push(safe.y - 6 * walkerCfg.unitScale);
    if (typeof scanFloor === 'number') limits.push(scanFloor - 2 * walkerCfg.unitScale);
    if (!limits.length || camera.position.y > Math.max(...limits)) return;

    vel.current.set(0, 0, 0);
    if (safe) {
      camera.position.copy(safe);
    } else if (r) {
      const spot = findStandingSpot(r, r.getBounds?.(), {
        eyeHeight: walkerCfg.eyeHeight, radius: walkerCfg.radius
      });
      if (spot) camera.position.set(spot.x, spot.y, spot.z);
    }
  }

  function resolve(pos: THREE.Vector3) {
    const r = rendererRef.current;
    if (!r?.intersectsCapsule) return;
    const { eyeHeight, radius } = walkerCfg;

    const sx = pos.x, sz = pos.z;
    const hit = r.intersectsCapsule({
      start: { x: sx, y: pos.y - eyeHeight + radius, z: sz },
      end: { x: sx, y: pos.y - radius, z: sz },
      radius
    });
    if (!hit?.hit || !hit.delta) return;

    pos.x += hit.delta.x;
    pos.y += hit.delta.y;
    pos.z += hit.delta.z;
    if (hit.delta.y > 0.001) {
      grounded.current = true;
      if (vel.current.y < 0) vel.current.y = 0;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                            */
  /* ---------------------------------------------------------------- */

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);

    // Keep the camera clip range in step with the editor sliders / scene scale.
    if (camera.near !== walkerCfg.near || camera.far !== walkerCfg.far) {
      camera.near = walkerCfg.near;
      camera.far = walkerCfg.far;
      camera.updateProjectionMatrix();
    }

    const canControl =
      enabledRef.current &&
      (alwaysRef.current || locked.current || dragging.current || touch.enabled);

    const r = rendererRef.current;
    const hasColl = !!r?.hasCollision?.();
    const mode = walkerCfg.mode === 'walk' && !hasColl ? 'fly' : walkerCfg.mode;

    if (canControl) {
      const k = keys.current;
      const w = wheel.current;
      wheel.current = 0;

      const base = walkerCfg.speed * (walkerCfg.speedMul || 1);
      const running = k.has('ShiftLeft') || k.has('ShiftRight') || touch.run;
      const speed = running ? base * 2 : base;

      camera.rotation.set(0, 0, 0);
      camera.rotateY(look.current.yaw);
      camera.rotateX(look.current.pitch);

      // CLAUDE.md §6.1: a space always OPENS in viewpoints — free look always
      // works (above), but WASD/joystick MOVEMENT is gated on the visitor
      // having explicitly switched to Walk mode (Viewer.jsx's toggle writes
      // navMode.walkEnabled). The studio (alwaysControl=true) always moves —
      // authoring needs it, and the studio has no viewpoints/walk split.
      const moveAllowed = alwaysRef.current || navMode.walkEnabled;

      if (!moveAllowed) {
        // Nothing else to do this frame — looking around is all a viewpoints
        // visitor gets, and LCCRender.update() below still has to run.
      } else if (mode === 'orbit') {
        // Dolly with W/S, wheel, or the joystick's Y.
        let d = walkerCfg.orbitDist;
        d *= 1 + w * 0.001;
        if (k.has('KeyW') || k.has('ArrowUp')) d -= speed * dt;
        if (k.has('KeyS') || k.has('ArrowDown')) d += speed * dt;
        if (touch.enabled) d -= touch.move.y * speed * dt;
        d = Math.max(walkerCfg.radius * 2, d);
        walkerCfg.orbitDist = d;

        v.tgt.set(walkerCfg.orbitTarget[0], walkerCfg.orbitTarget[1], walkerCfg.orbitTarget[2]);
        v.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
        camera.position.copy(v.tgt).addScaledVector(v.fwd, -d);
      } else {
        const fly = mode === 'fly';
        v.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
        v.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        if (!fly) { v.fwd.y = 0; v.right.y = 0; }
        v.fwd.normalize();
        v.right.normalize();

        v.wish.set(0, 0, 0);
        if (k.has('KeyW') || k.has('ArrowUp')) v.wish.add(v.fwd);
        if (k.has('KeyS') || k.has('ArrowDown')) v.wish.sub(v.fwd);
        if (k.has('KeyD') || k.has('ArrowRight')) v.wish.add(v.right);
        if (k.has('KeyA') || k.has('ArrowLeft')) v.wish.sub(v.right);
        if (touch.enabled) {
          v.wish.addScaledVector(v.fwd, touch.move.y);
          v.wish.addScaledVector(v.right, touch.move.x);
        }
        if (v.wish.lengthSq() > 1) v.wish.normalize();

        const jump = k.has('Space') || touch.jump;
        touch.jump = false;

        if (fly) {
          camera.position.addScaledVector(v.wish, speed * dt);
          if (jump) camera.position.y += speed * dt;
          if (k.has('KeyC') || k.has('ControlLeft')) camera.position.y -= speed * dt;
        } else {
          if (grounded.current && jump) {
            vel.current.y = 6.2 * walkerCfg.unitScale;
            grounded.current = false;
          }
          vel.current.y = Math.max(
            vel.current.y - 18 * walkerCfg.unitScale * dt,
            -55 * walkerCfg.unitScale
          );
          grounded.current = false;

          camera.position.addScaledVector(v.wish, speed * dt);
          resolve(camera.position);
          camera.position.y += vel.current.y * dt;
          resolve(camera.position);

          if (grounded.current) {
            safeGround.current ??= camera.position.clone();
            safeGround.current.copy(camera.position);
          } else {
            catchFall();
          }
        }
      }
    }

    // The SDK's camera wrapper calls threeCamera.updateMatrixWorld() itself
    // inside LCCRender.update(); doing it here too is cheap and keeps our
    // intent explicit (and covers the director path).
    camera.updateMatrixWorld();

    // Render-loop order, matching the SDK's own three.html example:
    //   controls.update()  ->  LCCRender.update()  ->  renderer.render()
    // Ours is the walker frame  ->  this call  ->  R3F's auto gl.render().
    // MANDATORY every frame: culling, LOD, fetch priority, depth sort. Kept as
    // the last line so it runs after the walker AND the director move the
    // camera; default useFrame priority so R3F still auto-renders after.
    LCCRender.update();
  });

  return {
    locked,
    grounded: () => grounded.current,
    yaw: () => look.current.yaw,
    setYaw: (y: number) => { look.current.yaw = y; },
    adoptCameraOrientation: () => {
      v.euler.setFromQuaternion(camera.quaternion, 'YXZ');
      look.current.yaw = v.euler.y;
      look.current.pitch = v.euler.x;
    },
    reset: (spawn: [number, number, number], yaw = 0) => {
      camera.position.set(...spawn);
      look.current.yaw = yaw;
      look.current.pitch = 0;
      vel.current.set(0, 0, 0);
      grounded.current = false;
      if (walkerCfg.mode === 'walk') dropToFloor(spawn);
      safeGround.current = camera.position.clone();
    }
  };
}
