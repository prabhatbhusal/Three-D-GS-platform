/**
 * 3D models on upload: FBX, OBJ (+MTL), PLY, glTF/GLB -> one compressed .glb.
 *
 * Runs in the studio, once, in the browser — where textures resolve against
 * the files the creator picked. The result is what visitors download, so the
 * work is done here and never on their phones:
 *
 *  - upright (auto, or the creator's choice) and in metres (FBX is usually
 *    centimetres), centred on the origin with its floor at y = 0;
 *  - scanned colour (OBJ/PLY textures, vertex colours) drawn unlit, like the
 *    splats; authored FBX/glTF content keeps its lit PBR materials;
 *  - a point cloud gets a hidden floor mesh (rcaas-collision) so Walk works;
 *  - geometry meshopt-compressed (EXT_meshopt_compression, lossless for
 *    positions and UVs), then gzipped by the server on the way out.
 *
 * Nothing is simplified: every triangle and point reaches the visitor
 * (CLAUDE.md §3: never decimate a scan to hit a size).
 */
import * as THREE from 'three';
import type { StagedFile } from '../@types/upload.types';
import { guessUpAxis, pointCloudFloor, type Axis } from './modelPrep';

export type UpChoice = 'auto' | Axis;

export interface ConvertedModel {
  file: File;
  kind: 'mesh' | 'points';
  triangles: number;
  points: number;
  up: Axis;
  /** Scale applied to reach metres (0.01 for a centimetre FBX). */
  toMetres: number;
  /** Texture or material files the model named that weren't picked. */
  missing: string[];
}

/** What counts as a 3D model in a picked folder, most specific first. */
const MODEL_ORDER = ['fbx', 'glb', 'gltf', 'obj', 'ply'];
export const isModelFile = (p: string) => new RegExp(`\\.(${MODEL_ORDER.join('|')})$`, 'i').test(p);

/** The model file to convert: the shallowest, and FBX before OBJ before PLY. */
export function findModel(files: StagedFile[]): StagedFile | null {
  const ext = (p: string) => MODEL_ORDER.indexOf(p.split('.').pop()!.toLowerCase());
  return files
    .filter((f) => isModelFile(f.relPath))
    .sort((a, b) => a.relPath.split('/').length - b.relPath.split('/').length || ext(a.relPath) - ext(b.relPath))[0] ?? null;
}

// Loaders resolve relative paths against this made-up origin; the URL
// modifier below maps every such URL onto a picked file.
const BASE = 'https://model.local/';
const WHITE_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

export async function convertModel(
  files: StagedFile[],
  { up = 'auto', onStage = () => {} }: { up?: UpChoice; onStage?: (s: string) => void } = {}
): Promise<ConvertedModel> {
  const primary = findModel(files);
  if (!primary) throw new Error('No .fbx, .obj, .ply or .glb in what you picked.');
  const ext = primary.relPath.split('.').pop()!.toLowerCase();

  /* ---- resolve every file the model asks for against the picked files */
  const byPath = new Map(files.map((f) => [f.relPath.toLowerCase(), f.file]));
  const byName = new Map(files.map((f) => [f.relPath.split('/').pop()!.toLowerCase(), f.file]));
  // Re-saved textures often change extension (.jpg -> .jpeg); images are
  // decoded by content, so the name without extension is enough.
  const stem = (n: string) => n.toLowerCase().replace(/\.[^.]*$/, '');
  const byStem = new Map(files.filter((f) => /\.(jpe?g|png|webp|bmp|gif|tga|dds)$/i.test(f.relPath))
    .map((f) => [stem(f.relPath.split('/').pop()!), f.file]));
  const blobs = new Map<File, string>();
  const missing = new Set<string>();
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (!url.startsWith(BASE)) return url; // blob:/data: made by the loaders themselves
    const rel = decodeURIComponent(url.slice(BASE.length)).replace(/\\/g, '/');
    const parts: string[] = [];
    for (const p of rel.split('/')) p === '..' ? parts.pop() : p && p !== '.' && parts.push(p);
    // exact relative path, else the bare file name: FBX often stores the
    // artist's absolute path, e.g. C:/Users/artist/tex/wood.jpg
    const last = parts[parts.length - 1] ?? '';
    const file = byPath.get(parts.join('/').toLowerCase()) ?? byName.get(last.toLowerCase()) ?? byStem.get(stem(last));
    if (!file) {
      const name = parts[parts.length - 1];
      if (name && name !== 'undefined') missing.add(name);
      return WHITE_PIXEL; // the material's own colour shows instead
    }
    if (!blobs.has(file)) blobs.set(file, URL.createObjectURL(file));
    return blobs.get(file)!;
  });
  // Textures keep loading after a loader resolves; wait until they finish.
  let idle = true;
  let settle = () => {};
  manager.onStart = () => { idle = false; };
  manager.onLoad = () => { idle = true; settle(); };
  const allLoaded = () => new Promise<void>((r) => { if (idle) r(); else settle = r; });

  const url = BASE + primary.relPath.split('/').map(encodeURIComponent).join('/');
  onStage(`Reading ${primary.relPath.split('/').pop()}`);
  let object: THREE.Object3D;
  let toMetres = 1;
  let scanned = false; // OBJ/PLY colour is captured light: draw it unlit
  try {
    if (ext === 'fbx') {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      const { TGALoader } = await import('three/examples/jsm/loaders/TGALoader.js');
      const { DDSLoader } = await import('three/examples/jsm/loaders/DDSLoader.js');
      manager.addHandler(/\.tga$/i, new TGALoader(manager));
      manager.addHandler(/\.dds$/i, new DDSLoader(manager));
      object = await new FBXLoader(manager).loadAsync(url);
      // FBX UnitScaleFactor: centimetres per unit (1 = cm, 100 = m).
      toMetres = (Number(object.userData.unitScaleFactor) || 1) / 100;
    } else if (ext === 'glb' || ext === 'gltf') {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
      object = (await new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder).loadAsync(url)).scene;
    } else if (ext === 'obj') {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      const text = await primary.file.text();
      const loader = new OBJLoader(manager);
      const lib = /^mtllib\s+(.+?)\s*$/m.exec(text.slice(0, 1 << 20))?.[1];
      if (lib) {
        const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js');
        const materials = await new MTLLoader(manager).loadAsync(new URL(lib.replace(/\\/g, '/'), url).href).catch(() => null);
        if (materials) { materials.preload(); loader.setMaterials(materials); }
      }
      object = loader.parse(text);
      scanned = true;
    } else {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
      const buf = await primary.file.arrayBuffer();
      const head = new TextDecoder().decode(buf.slice(0, 4096));
      if (/\bf_dc_0\b/.test(head) && /\bopacity\b/.test(head)) {
        throw new Error(`${primary.relPath} is a Gaussian-splat PLY. Upload splats as a Lixel Studio LCC export.`);
      }
      object = plyObject(new PLYLoader().parse(buf));
      scanned = true;
    }
    await allLoaded();
  } finally {
    for (const b of blobs.values()) URL.revokeObjectURL(b);
  }

  /* ---- clean up what the file carried besides geometry */
  onStage('Preparing the model');
  const strip: THREE.Object3D[] = [];
  object.traverse((o) => { if ((o as THREE.Light).isLight || (o as THREE.Camera).isCamera) strip.push(o); });
  strip.forEach((o) => o.removeFromParent());
  object.animations = [];
  normaliseMaterials(object, scanned);
  // glTF has no point size; the node's extras carry it (meshModel.ts reads it).
  object.traverse((o) => {
    const p = o as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
    if (p.isPoints) p.userData.pointSize = (p.material.sizeAttenuation ? p.material.size : 0.02 / toMetres) * toMetres;
  });

  /* ---- upright, metres, centred with the floor at y = 0 */
  const turn = new THREE.Group();
  turn.add(object);
  turn.scale.setScalar(toMetres);
  turn.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(turn).getSize(new THREE.Vector3());
  const axis: Axis = up === 'auto' ? guessUpAxis(size) : up;
  if (axis === 'z') turn.rotation.x = -Math.PI / 2; // +Z up -> +Y up
  const root = new THREE.Group();
  root.add(turn);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  turn.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  root.updateMatrixWorld(true);

  /* ---- count, and give a point cloud something to stand on */
  let triangles = 0, points = 0;
  const cloud: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!g) return;
    const p = g.getAttribute('position');
    if ((o as THREE.Mesh).isMesh) triangles += (g.index ? g.index.count : p.count) / 3;
    if ((o as THREE.Points).isPoints) {
      points += p.count;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        cloud.push(v.x, v.y, v.z);
      }
    }
  });
  if (!triangles && !points) throw new Error(`${primary.relPath} has no geometry in it.`);
  if (points) {
    const floor = new THREE.BufferGeometry();
    floor.setAttribute('position', new THREE.BufferAttribute(pointCloudFloor(cloud), 3));
    const hidden = new THREE.Mesh(floor, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hidden.name = 'rcaas-collision'; // meshModel.ts hides it, and collides with it
    root.add(hidden);
  }

  /* ---- export, then meshopt-compress */
  onStage('Compressing');
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const glb = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer;
  const [{ WebIO }, { ALL_EXTENSIONS, EXTMeshoptCompression }, { MeshoptEncoder }] = await Promise.all([
    import('@gltf-transform/core'), import('@gltf-transform/extensions'), import('meshoptimizer')
  ]);
  await MeshoptEncoder.ready;
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.readBinary(new Uint8Array(glb));
  doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const out = await io.writeBinary(doc);

  const name = primary.relPath.split('/').pop()!.replace(/\.[^.]+$/, '') || 'model';
  return {
    file: new File([out], `${name}.glb`, { type: 'model/gltf-binary' }),
    kind: triangles ? 'mesh' : 'points',
    triangles: Math.round(triangles),
    points,
    up: axis,
    toMetres,
    missing: [...missing]
  };
}

/* ---------------------------------------------------------------- */

function plyObject(geo: THREE.BufferGeometry): THREE.Object3D {
  const hasColor = !!geo.getAttribute('color');
  if (geo.index) {
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: hasColor, color: hasColor ? 0xffffff : 0xb4b8bf }));
  }
  // Size each point from how densely the scan is sampled: roughly the
  // spacing between neighbours over a surface.
  geo.computeBoundingBox();
  const s = geo.boundingBox!.getSize(new THREE.Vector3());
  const spacing = Math.hypot(s.x, s.y, s.z) / Math.sqrt(Math.max(1, geo.getAttribute('position').count));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: Math.min(0.08, Math.max(0.004, spacing * 1.6)),
    vertexColors: hasColor,
    color: hasColor ? 0xffffff : 0xb8bcc4
  }));
}

/**
 * Materials glTF can carry. Scanned colour (a texture or vertex colours on an
 * OBJ/PLY) is drawn unlit (KHR_materials_unlit), because the capture already
 * has its light in it; everything else becomes PBR and is lit by the viewer.
 * Colour textures export as JPEG unless they need alpha, so a photo texture
 * doesn't come back as a PNG several times the size.
 */
function normaliseMaterials(object: THREE.Object3D, scanned: boolean) {
  object.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const hasColor = !!m.geometry.getAttribute('color');
    const next = [m.material].flat().map((src) => {
      const s = src as THREE.MeshPhongMaterial & THREE.MeshStandardMaterial;
      const common = {
        map: s.map ?? null, color: s.color ?? new THREE.Color(0xb4b8bf), vertexColors: hasColor,
        side: THREE.DoubleSide, transparent: !!s.transparent, opacity: s.opacity ?? 1, alphaMap: s.alphaMap ?? null
      };
      if (common.map) {
        common.map.colorSpace = THREE.SRGBColorSpace;
        common.map.userData.mimeType = common.transparent || common.alphaMap ? 'image/png' : 'image/jpeg';
      }
      if (scanned && (common.map || hasColor)) {
        return new THREE.MeshBasicMaterial({ ...common, color: common.map ? 0xffffff : common.color });
      }
      if (s.isMeshStandardMaterial) return s; // glTF input: already PBR
      return new THREE.MeshStandardMaterial({
        ...common,
        normalMap: s.normalMap ?? null,
        emissive: s.emissive ?? new THREE.Color(0),
        // FBX exporters often write a white emissive colour with factor 0;
        // dropping the factor makes every surface glow flat white.
        emissiveIntensity: s.emissiveIntensity ?? 1,
        emissiveMap: s.emissiveMap ?? null,
        // Phong shininess 0..~100 -> roughness 1..~0.3
        roughness: 1 - Math.min(0.7, (s.shininess ?? 30) / 150),
        metalness: 0
      });
    });
    m.material = Array.isArray(m.material) ? next : next[0];
  });
}
