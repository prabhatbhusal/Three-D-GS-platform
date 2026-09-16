import { useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Viewpoint } from '../@types/viewpoint.types';

/**
 * The cinematic engine behind the viewport buttons.
 *
 * play(viewpoint) snapshots the current camera pose, then flies the camera
 * along a Catmull-Rom spline through the viewpoint's waypoint positions —
 * orientation slerped between per-waypoint look targets — easing in and out,
 * and settling exactly on the final waypoint. Then it hands control back.
 *
 * Runs in a useFrame at the DEFAULT priority (0). Per the SDK notes, the moment
 * ANY useFrame uses priority > 0, R3F stops auto-rendering. So this only mutates
 * the camera; the walker's frame loop (which runs after this one) owns the
 * single mandatory LCCRender.update() per frame.
 *
 * The flight is interruptible: any key / pointer / touch input aborts it and
 * returns to free-look from wherever the camera currently is.
 */
const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const UP = new THREE.Vector3(0, 1, 0);

function quatLookingAt(
  posArr: [number, number, number],
  lookArr: [number, number, number],
  out: THREE.Quaternion,
  m: THREE.Matrix4
) {
  m.lookAt(
    new THREE.Vector3(posArr[0], posArr[1], posArr[2]),
    new THREE.Vector3(lookArr[0], lookArr[1], lookArr[2]),
    UP
  );
  return out.setFromRotationMatrix(m);
}

interface FlightAnim {
  curve: THREE.CatmullRomCurve3;
  quats: THREE.Quaternion[];
  fovs: [number, number] | null;
  seconds: number;
  elapsed: number;
  onDone?: (arrived: boolean) => void;
}

export function useCameraDirector({ onArrive }: { onArrive?: () => void } = {}) {
  const { camera } = useThree() as { camera: THREE.PerspectiveCamera };

  const flying = useRef(false);
  const anim = useRef<FlightAnim | null>(null);
  const scratchM = useRef(new THREE.Matrix4()).current;
  const scratchQ = useRef(new THREE.Quaternion()).current;
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  const finish = useCallback(
    (arrived: boolean) => {
      const a = anim.current;
      anim.current = null;
      flying.current = false;
      if (a && arrived) {
        // Snap exactly onto the final pose so free-look resumes without drift.
        camera.position.copy(a.curve.getPointAt(1));
        camera.quaternion.copy(a.quats[a.quats.length - 1]);
        if (a.fovs) {
          camera.fov = a.fovs[1];
          camera.updateProjectionMatrix();
        }
      }
      // Let the walker adopt the current camera orientation as its yaw/pitch.
      onArriveRef.current?.();
      a?.onDone?.(arrived);
    },
    [camera]
  );

  const stop = useCallback(() => {
    if (flying.current) finish(false);
  }, [finish]);

  const play = useCallback(
    (viewpoint: Viewpoint, { onDone }: { onDone?: (arrived: boolean) => void } = {}) => {
      if (!viewpoint?.path?.length) return;

      const startPos = camera.position.clone();
      const startQuat = camera.quaternion.clone();

      const pts = [startPos, ...viewpoint.path.map((w) => new THREE.Vector3(w.pos[0], w.pos[1], w.pos[2]))];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);

      const quats = [startQuat];
      for (const w of viewpoint.path) {
        const q = new THREE.Quaternion();
        const look: [number, number, number] = w.look ?? [w.pos[0], w.pos[1], w.pos[2] - 1];
        quatLookingAt(w.pos, look, q, scratchM);
        quats.push(q);
      }

      anim.current = {
        curve,
        quats,
        fovs: viewpoint.fov ? [camera.fov, viewpoint.fov] : null,
        seconds: Math.max(0.4, viewpoint.seconds ?? 4),
        elapsed: 0,
        onDone
      };
      flying.current = true;
    },
    [camera, scratchM]
  );

  // Abort on any manual input while a flight is running.
  useEffect(() => {
    const abort = () => stop();
    const opts = { passive: true };
    window.addEventListener('keydown', abort);
    window.addEventListener('pointerdown', abort, opts);
    window.addEventListener('wheel', abort, opts);
    window.addEventListener('touchstart', abort, opts);
    return () => {
      window.removeEventListener('keydown', abort);
      window.removeEventListener('pointerdown', abort);
      window.removeEventListener('wheel', abort);
      window.removeEventListener('touchstart', abort);
    };
  }, [stop]);

  useFrame((_, delta) => {
    const a = anim.current;
    if (!a) return;

    a.elapsed += Math.min(delta, 0.05);
    const u = Math.min(a.elapsed / a.seconds, 1);
    const te = smootherstep(u);

    camera.position.copy(a.curve.getPointAt(te));

    // Orientation: piecewise slerp across the waypoint quats. `te` is already
    // eased (smootherstep on the global 0..1), so interpolate LINEARLY within
    // each segment — a second ease per segment would add a velocity kink at
    // every waypoint boundary.
    const segs = a.quats.length - 1;
    const f = te * segs;
    const i = Math.min(Math.floor(f), segs - 1);
    scratchQ.copy(a.quats[i]).slerp(a.quats[i + 1], f - i);
    camera.quaternion.copy(scratchQ);

    if (a.fovs) {
      camera.fov = a.fovs[0] + (a.fovs[1] - a.fovs[0]) * te;
      camera.updateProjectionMatrix();
    }

    // Keep world + inverse matrices in step with the pose we just set. The
    // walker's LCCRender.update() runs right after and refreshes them anyway;
    // this just makes the flight's intent explicit.
    camera.updateMatrixWorld();

    if (u >= 1) finish(true);
  });

  return { play, stop, flyingRef: flying };
}
