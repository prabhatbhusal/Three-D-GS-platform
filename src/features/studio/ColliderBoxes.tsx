'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { collidersFor, colliderUi, subscribeDoc, updateCollider } from '../scene/sceneDoc';
import { gizmo } from '../scene/transform';
import { SCENE_BY_ID, metaPath } from '../scene/scenes';

const DEG = Math.PI / 180;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The scan's own collision mesh (its .lcc2 lists the PLY files in
 * root.meshFiles) as an invisible shape that only writes depth, so the walls
 * and floor hide the part of a box behind them, as they would a real object.
 * Splats write no depth: without this a box drew over everything, and as the
 * camera moved it seemed to slide across the scan instead of staying put.
 * It draws after the splats (transparent pass, order 997; the SDK's are
 * negative), so it never hides any of the scan itself. A 3D model space
 * needs none: its mesh writes depth already.
 */
async function loadOccluder(sceneId: string): Promise<THREE.Group | null> {
  const format = SCENE_BY_ID[sceneId]?.format;
  if (format === 'glb' || format === 'video360') return null;
  const url = metaPath(sceneId);
  const files: unknown = (await (await fetch(url)).json())?.root?.meshFiles;
  if (!Array.isArray(files) || !files.length) return null;
  const loader = new PLYLoader();
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.name = 'collision-box-occluder';
  group.matrixAutoUpdate = false;
  for (const geo of await Promise.all(files.map((f) => loader.loadAsync(new URL(String(f), url).href).catch(() => null)))) {
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = 997;
    group.add(mesh);
  }
  return group;
}

/**
 * Studio only — App.tsx never mounts this in the tour or in Preview, so
 * visitors never see a box, they only bump into it (collision.ts
 * withColliders). Each box is drawn in its colour, hidden behind the scan's
 * walls and floor like a real object (loadOccluder), with a faint outline
 * through them so a box behind a wall can still be found. The selected one
 * gets move arrows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK renderer handle
export function ColliderBoxes({ sceneId, renderer }: { sceneId: string; renderer: any }) {
  const { camera, gl, scene } = useThree();
  const occluder = useRef<THREE.Group | null>(null);
  const rendererRef = useRef(renderer);
  rendererRef.current = renderer;

  // the occluder sits exactly where the scan does: its root's transform (LCC's Z-up fix and the author's placement)
  useFrame(() => {
    const o = occluder.current;
    const root: THREE.Object3D | undefined = rendererRef.current?.root;
    if (!o) return;
    o.visible = !!root;
    if (!root) return;
    root.updateWorldMatrix(true, false);
    o.matrix.copy(root.matrixWorld);
    o.matrixWorldNeedsUpdate = true;
  });

  useEffect(() => {
    let live = true;
    loadOccluder(sceneId).then((o) => {
      if (!live || !o) return;
      occluder.current = o;
      scene.add(o);
    }).catch((err) => console.warn('[collision boxes] scan mesh for hiding boxes:', err?.message ?? err));
    return () => {
      live = false;
      const o = occluder.current;
      if (!o) return;
      scene.remove(o);
      o.traverse((m) => { (m as THREE.Mesh).geometry?.dispose(); });
      ((o.children[0] as THREE.Mesh | undefined)?.material as THREE.Material | undefined)?.dispose();
      occluder.current = null;
    };
  }, [scene, sceneId]);

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
        // fill and edges are hidden by the scan in front of them (loadOccluder); the ghost
        // outline shows faintly through it, so a box behind a wall can still be found
        const fill = new THREE.Mesh(box, new THREE.MeshBasicMaterial({
          color: c.color, transparent: true, opacity: c.id === sel ? 0.35 : 0.18, depthWrite: false
        }));
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: c.color, transparent: true }));
        const ghost = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: c.color, depthTest: false, transparent: true, opacity: 0.3 }));
        fill.renderOrder = line.renderOrder = 999;
        ghost.renderOrder = 1000;
        g.add(fill, line, ghost);
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
