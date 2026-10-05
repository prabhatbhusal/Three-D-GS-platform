/**
 * 3D-model spaces: one .glb, made from an FBX/OBJ/PLY/glTF on upload by
 * modelConvert.ts (upright, in metres, meshopt-compressed).
 *
 * The rest of the app talks to a loaded model through the handful of methods
 * the XGRIDS SDK's per-scene renderer has — `root`, `getBounds()`,
 * `intersectsCapsule()`, `hasCollision()`. This returns an object with exactly
 * those, so the walker, collision helpers, gizmo, hotspots, studio and tour
 * run unchanged on a model space. Only useSceneManager knows the difference.
 *
 * Unlike an LCC export nothing streams: the whole file is the bytes to first
 * frame (publish warns past 35 MB, server/src/store.js). The server sends it
 * gzipped.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MeshBVH } from 'three-mesh-bvh';

type XYZ = { x: number; y: number; z: number };

export interface MeshModel {
  /** What the author transform moves (transform.ts applyToRenderer). */
  root: THREE.Group;
  getBounds(): { min: XYZ; max: XYZ };
  /** Same contract as the SDK: the push-out that clears the capsule. */
  intersectsCapsule(q: { start: XYZ; end: XYZ; radius: number }): { hit: boolean; delta?: XYZ };
  hasCollision(): boolean;
  dispose(): void;
}

export async function loadMeshModel(url: string, onProgress: (p: number) => void): Promise<MeshModel> {
  const progress = (e: ProgressEvent) => { if (e.total) onProgress(Math.min(0.99, e.loaded / e.total)); };
  const object = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url, progress)).scene;

  object.traverse((o) => {
    if (o.name === 'rcaas-collision') o.visible = false; // a point cloud's walkable floor
    const p = o as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
    if (p.isPoints) {
      // glTF has no point size: the converter kept it in the node's extras.
      p.material.size = Number(p.userData.pointSize) || 0.02;
      p.material.sizeAttenuation = true;
    }
  });

  const root = new THREE.Group();
  root.name = 'mesh-model';
  root.add(object);
  // Only lights authored, lit (PBR) materials; scanned colour is unlit.
  root.add(new THREE.HemisphereLight(0xffffff, 0x2a2a2e, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(4, 10, 6);
  root.add(sun);

  // Measured in model space, before any author transform is on the root.
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);

  // Collision: every surface, the hidden floor included, as one geometry in
  // model space, so moving the model never means rebuilding it.
  let bvh: MeshBVH | null = null;
  let disposed = false;
  const surfaces = mergedSurfaces(object);
  if (surfaces) {
    buildBvh(surfaces).then((b) => { if (!disposed) bvh = b; }).catch((err) => console.warn('[mesh] no collision:', err));
  }

  const inv = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const push = new THREE.Vector3();
  const wb = new THREE.Box3();

  onProgress(1);
  return {
    root,
    getBounds() {
      wb.copy(box).applyMatrix4(root.matrixWorld);
      return { min: { x: wb.min.x, y: wb.min.y, z: wb.min.z }, max: { x: wb.max.x, y: wb.max.y, z: wb.max.z } };
    },
    intersectsCapsule({ start, end, radius }) {
      if (!bvh) return { hit: false };
      // Query in model space. The author transform is uniform-scale
      // (transform.ts), so the radius scales by one number.
      inv.copy(root.matrixWorld).invert();
      const s = root.matrixWorld.getMaxScaleOnAxis() || 1;
      a.set(start.x, start.y, start.z).applyMatrix4(inv);
      b.set(end.x, end.y, end.z).applyMatrix4(inv);
      if (!capsulePush(bvh, a, b, radius / s, push)) return { hit: false };
      // model-space push -> world: rotate and scale it, never translate it
      const len = push.length();
      push.transformDirection(root.matrixWorld).multiplyScalar(len * s);
      return { hit: true, delta: { x: push.x, y: push.y, z: push.z } };
    },
    hasCollision: () => !!bvh,
    dispose() {
      disposed = true;
      bvh = null;
      surfaces?.dispose();
      root.removeFromParent();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        for (const mat of [m.material].flat()) {
          if (!mat) continue;
          for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
          mat.dispose();
        }
      });
    }
  };
}

/* ---------------------------------------------------------------- */

/** Every mesh's triangles as one position-only indexed geometry, in the
 *  object's own space. Null when there is nothing to stand on. */
function mergedSurfaces(object: THREE.Object3D): THREE.BufferGeometry | null {
  const meshes: THREE.Mesh[] = [];
  object.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  let verts = 0, idx = 0;
  for (const m of meshes) {
    const p = m.geometry.getAttribute('position');
    verts += p.count;
    idx += m.geometry.index ? m.geometry.index.count : p.count;
  }
  if (!idx) return null;
  const pos = new Float32Array(verts * 3);
  const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  const v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const m of meshes) {
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      const k = (vo + i) * 3;
      pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
    }
    const src = m.geometry.index;
    const n = src ? src.count : p.count;
    for (let i = 0; i < n; i++) index[io + i] = vo + (src ? src.getX(i) : i);
    vo += p.count;
    io += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

/** Built in a worker when the browser has them, so a multi-million-triangle
 *  model never freezes the tour; on the main thread otherwise (and in tests). */
async function buildBvh(geo: THREE.BufferGeometry): Promise<MeshBVH> {
  if (typeof Worker !== 'undefined') {
    try {
      // The one worker, not 'three-mesh-bvh/worker': that index also pulls in
      // the parallel builder, whose nested workers webpack flags as circular.
      const { GenerateMeshBVHWorker } = await import('three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js');
      const worker = new GenerateMeshBVHWorker();
      // A copy: the worker takes the arrays it's given, which would leave
      // nothing for the fallback below if it fails partway.
      try { return await worker.generate(geo.clone()); } finally { worker.dispose(); }
    } catch (err) {
      console.warn('[mesh] BVH worker unavailable, building on the main thread:', err);
    }
  }
  await new Promise((r) => setTimeout(r, 300)); // after the first frame
  return new MeshBVH(geo);
}

const _seg = new THREE.Line3();
const _box = new THREE.Box3();
const _onTri = new THREE.Vector3();
const _onSeg = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _before = new THREE.Vector3();

/**
 * Capsule (segment a-b, radius r) against the model, as in three-mesh-bvh's
 * character example: find each triangle's closest point to the segment and
 * push the segment out along it. Closest points don't care which way a
 * triangle faces, so it holds whatever winding the export used. Writes the
 * total push to `out`; true when anything overlapped. Touching isn't overlap:
 * a body just pushed clear rests exactly on the floor (collision.ts).
 */
function capsulePush(bvh: MeshBVH, a: THREE.Vector3, b: THREE.Vector3, r: number, out: THREE.Vector3): boolean {
  _seg.set(a, b);
  _seg.getCenter(_before);
  _box.makeEmpty().expandByPoint(a).expandByPoint(b);
  _box.min.addScalar(-r);
  _box.max.addScalar(r);
  let hit = false;
  bvh.shapecast({
    intersectsBounds: (bounds) => bounds.intersectsBox(_box),
    intersectsTriangle: (tri) => {
      const d = tri.closestPointToSegment(_seg, _onTri, _onSeg);
      if (d >= r - 1e-5) return false;
      let depth = r - d;
      if (d > 1e-9) _dir.subVectors(_onSeg, _onTri).divideScalar(d);
      else {
        // The segment passes through the triangle: out along its normal, on
        // the side the capsule's middle is, far enough to lift the end that
        // is through the surface clear of it too.
        tri.getNormal(_dir);
        if (_dir.dot(_seg.getCenter(_mid).sub(_onTri)) < 0) _dir.negate();
        const sunk = Math.min(_dir.dot(_mid.copy(_seg.start).sub(_onTri)), _dir.dot(_mid.copy(_seg.end).sub(_onTri)));
        depth = r - sunk;
      }
      _seg.start.addScaledVector(_dir, depth);
      _seg.end.addScaledVector(_dir, depth);
      hit = true;
      return false;
    }
  });
  if (hit) out.copy(_seg.getCenter(_mid)).sub(_before);
  return hit;
}
