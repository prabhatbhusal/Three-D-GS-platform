'use client';

import { useEffect, useReducer, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  applyToRenderer, authorMatrix, eulerDegrees, gizmo, setGizmoMode, setTransform,
  subscribeTransform, transformFor
} from '../lib/transform';
import { scaleWalkerCfg, walkerCfg } from '../lib/walkerConfig';
import { isTypingTarget } from '../lib/useLccWalker';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK renderer handle
type SdkRenderer = any;

/**
 * Keeps the loaded model where the scene's transform says, in the studio and
 * the tour alike, and rescales the walker when the author changes scale
 * (§7.2: "re-derive, don't reload").
 */
export function useSceneTransform(renderer: SdkRenderer, sceneId: string, unitScale: number, base: THREE.Matrix4) {
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const lastScale = useRef<{ renderer: SdkRenderer; scale: number } | null>(null);
  useEffect(() => subscribeTransform(bump), []);

  useEffect(() => {
    if (!renderer) return;
    const t = transformFor(sceneId);
    applyToRenderer(renderer, t, base);
    const prev = lastScale.current;
    // A fresh renderer arrives with the walker already scaled for scale 1.
    const was = prev && prev.renderer === renderer ? prev.scale : 1;
    if (t.scale !== was) scaleWalkerCfg((unitScale || 1) * t.scale);
    lastScale.current = { renderer, scale: t.scale };
  }, [renderer, sceneId, unitScale, base, tick]);
}

/**
 * Move / rotate / scale handles on the model (§7.2). G / R / T switch tools
 * (S is already "walk back"), Esc turns the gizmo off, and holding Ctrl snaps:
 * 0.1 m, 15°, 0.1×.
 *
 * The handles appear in front of the camera when the tool is switched on,
 * not at the model's origin — that is usually off-screen, often behind you.
 * A drag is applied to the model AROUND the handles: rotating spins the scan
 * about the point you're looking at, like a 3D cursor.
 */
export function Gizmo({ sceneId }: { sceneId: string }) {
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    const pivot = new THREE.Object3D(); // what the handles move; world-aligned at rest
    scene.add(pivot);

    const tc = new TransformControls(camera, gl.domElement);
    tc.setSize(1.05);
    tc.attach(pivot);
    scene.add(tc);

    const fwd = new THREE.Vector3();
    const placeInView = () => {
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
      fwd.normalize().multiplyScalar(2.5 * (walkerCfg.unitScale || 1));
      pivot.position.copy(camera.position).add(fwd);
      pivot.position.y -= 0.45 * (walkerCfg.unitScale || 1);
      pivot.quaternion.identity();
      pivot.scale.setScalar(1);
      pivot.updateMatrixWorld(true);
    };

    let lastMode = gizmo.mode;
    const sync = () => {
      const on = gizmo.mode !== 'off';
      if (on && lastMode === 'off') placeInView();
      lastMode = gizmo.mode;
      tc.visible = on;
      tc.enabled = on;
      if (on) tc.setMode(gizmo.mode as 'translate' | 'rotate' | 'scale');
    };
    sync();
    const unsub = subscribeTransform(sync);

    // model' = (pivotNow × pivotAtGrab⁻¹) × modelAtGrab
    const grabPivotInv = new THREE.Matrix4();
    const grabModel = new THREE.Matrix4();
    const delta = new THREE.Matrix4();
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();

    const onDragging = (e: { value: unknown }) => {
      gizmo.dragging = !!e.value;
      if (gizmo.dragging) {
        pivot.updateMatrix();
        grabPivotInv.copy(pivot.matrix).invert();
        authorMatrix(transformFor(sceneId), grabModel);
      } else {
        // Back to world-aligned handles where the drag left them.
        pivot.quaternion.identity();
        pivot.scale.setScalar(1);
      }
    };
    const onChange = () => {
      if (!gizmo.dragging) return;
      if (tc.mode === 'scale') {
        // Uniform only: whichever axis the author pulled furthest from 1.
        const s = pivot.scale;
        const k = [s.x, s.y, s.z].reduce((a, b) => (Math.abs(b - 1) > Math.abs(a - 1) ? b : a), 1);
        pivot.scale.setScalar(k);
      }
      pivot.updateMatrix();
      delta.multiplyMatrices(pivot.matrix, grabPivotInv).multiply(grabModel);
      delta.decompose(pos, quat, scl);
      setTransform(sceneId, {
        position: pos.toArray() as [number, number, number],
        rotation: eulerDegrees(quat),
        scale: scl.x
      });
    };
    tc.addEventListener('dragging-changed', onDragging);
    tc.addEventListener('objectChange', onChange);

    const snap = (on: boolean) => {
      tc.setTranslationSnap(on ? 0.1 : null);
      tc.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null);
      tc.setScaleSnap(on ? 0.1 : null);
    };
    const onKey = (e: KeyboardEvent) => {
      snap(e.ctrlKey);
      if (e.type !== 'keydown' || isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyG') setGizmoMode('translate');
      else if (e.code === 'KeyR') setGizmoMode('rotate');
      else if (e.code === 'KeyT') setGizmoMode('scale');
      else if (e.code === 'Escape' && gizmo.mode !== 'off') setGizmoMode('off');
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    return () => {
      unsub();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      tc.removeEventListener('dragging-changed', onDragging);
      tc.removeEventListener('objectChange', onChange);
      tc.detach();
      tc.dispose();
      scene.remove(tc, pivot);
      gizmo.dragging = false;
    };
  }, [camera, gl, scene, sceneId]);

  return null;
}
