'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { collidersFor, colliderUi, subscribeDoc, updateCollider } from '../lib/sceneDoc';
import { gizmo } from '../lib/transform';

const DEG = Math.PI / 180;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Studio only — App.tsx never mounts this in the tour or in Preview, so
 * visitors never see a box, they only bump into it (collision.ts
 * withColliders). Each box is drawn in its colour, its outline showing
 * through the scan so a box behind a wall can still be found, and the
 * selected one gets move arrows.
 */
export function ColliderBoxes({ sceneId }: { sceneId: string }) {
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    const group = new THREE.Group();
    group.name = 'collision-boxes';
    const box = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(box);

    const pivot = new THREE.Object3D(); // what the arrows move
    const tc = new TransformControls(camera, gl.domElement);
    tc.setSize(0.8);
    tc.attach(pivot);
    scene.add(group, pivot, tc);

    const clear = () => {
      for (const g of [...group.children]) {
        g.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose());
        group.remove(g);
      }
    };
    // ponytail: rebuilds every box on each edit; fine for tens of boxes, reuse meshes if a space needs hundreds.
    const draw = () => {
      clear();
      const sel = colliderUi.selected;
      for (const c of collidersFor(sceneId)) {
        const g = new THREE.Group();
        g.position.fromArray(c.position);
        g.rotation.set(0, c.yaw * DEG, 0);
        g.scale.fromArray(c.size);
        const fill = new THREE.Mesh(box, new THREE.MeshBasicMaterial({
          color: c.color, transparent: true, opacity: c.id === sel ? 0.35 : 0.18, depthWrite: false
        }));
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: c.color, depthTest: false, transparent: true }));
        fill.renderOrder = line.renderOrder = 999;
        g.add(fill, line);
        group.add(g);
      }
      const c = collidersFor(sceneId).find((x) => x.id === sel);
      tc.visible = tc.enabled = !!c;
      if (c && !gizmo.dragging) pivot.position.fromArray(c.position);
    };
    draw();
    const off = subscribeDoc(draw);

    let moving: string | null = null;
    const onDragging = (e: { value: unknown }) => {
      gizmo.dragging = !!e.value; // the walker leaves this drag alone
      moving = gizmo.dragging ? colliderUi.selected : null;
    };
    const onChange = () => {
      if (!gizmo.dragging || !moving) return;
      const p = pivot.position;
      updateCollider(sceneId, moving, { position: [r3(p.x), r3(p.y), r3(p.z)] });
    };
    tc.addEventListener('dragging-changed', onDragging);
    tc.addEventListener('objectChange', onChange);

    return () => {
      off();
      tc.removeEventListener('dragging-changed', onDragging);
      tc.removeEventListener('objectChange', onChange);
      tc.detach();
      tc.dispose();
      clear();
      scene.remove(group, pivot, tc);
      box.dispose();
      edges.dispose();
      gizmo.dragging = false;
    };
  }, [camera, gl, scene, sceneId]);

  return null;
}
