'use client';
/**
 * The home page's hero object (2026-10-07): a Newar stupa in the manner of the
 * Chilancho Stupa in our hero film, drawn the way the globe was: out of round
 * points that arrive from a scattered cloud and settle, dimmer where their
 * surface turns away. It is a stand-in modelled in code, not a scan of that
 * temple: stepped brick terraces, a shrine on each side, four corner
 * chaityas, the dome, the harmika with its eyes, a thirteen-ring spire and its
 * umbrella, sampled into points with each surface's normal. Nothing is
 * downloaded. (Replaced the Gaussian-splat pagoda and stupa of 2026-10-06/07;
 * swap in the real scan's points when the .lcc is on hand.)
 *
 * Drag to turn it; left alone it turns slowly. Reduced motion: it appears
 * settled and still. No WebGL: nothing is drawn, the headline carries the
 * page. Styles: home.css .hp-scan (the canvas box) and .hp-pin (its tag).
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { afterIntro } from '../layout/Loader';
import { onTheme } from '../siteTheme';

const N = 13000;
const TOP = 2.8; // the finial's height; the scan ring rises past it
type V = [number, number, number];
type Quad = [V, V, V, V]; // p00, p10, p11, p01
/** A piece of the model: its surface area (how many splats it gets), how bright it is, how big its splats are, and a way to pick a point on it with the surface's normal. */
type Part = { area: number; tone: number; size: number; at: (r: () => number) => [V, V] };

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);

/** A box (no underside) as five quads. */
function box(cx: number, y0: number, cz: number, w: number, h: number, d: number): Quad[] {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
  return [
    [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]]
  ];
}

/** A pyramid roof: a square frustum with an underside (the eave), centred on (cx, cz). */
function roof(y0: number, h: number, a: number, b: number, cx = 0, cz = 0): Quad[] {
  const lo: V[] = [[cx - a, y0, cz - a], [cx + a, y0, cz - a], [cx + a, y0, cz + a], [cx - a, y0, cz + a]];
  const hi: V[] = [[cx - b, y0 + h, cz - b], [cx + b, y0 + h, cz - b], [cx + b, y0 + h, cz + b], [cx - b, y0 + h, cz + b]];
  const sides = [0, 1, 2, 3].map((i): Quad => [lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]]);
  return [...sides, [lo[0], lo[1], lo[2], lo[3]]];
}

/** Turn quads about the vertical axis. */
const turnY = (qs: Quad[], a: number): Quad[] => {
  const c = Math.cos(a), s = Math.sin(a);
  return qs.map((q) => q.map(([x, y, z]) => [x * c + z * s, y, -x * s + z * c] as V) as Quad);
};

const quadPart = (p: Quad, tone: number, weight = 1, size = 1): Part => {
  const n = cross(sub(p[2], p[0]), sub(p[3], p[1]));
  return {
    area: (len(n) / 2) * weight, tone, size,
    at: (r) => {
      const s = r(), t = r();
      return [[0, 1, 2].map((c) => (1 - s) * (1 - t) * p[0][c] + s * (1 - t) * p[1][c] + s * t * p[2][c] + (1 - s) * t * p[3][c]) as V, n];
    }
  };
};

/** The sloped side of a round cone (a ring of the spire, the umbrella, the finial). */
const cone = (y0: number, h: number, r1: number, r2: number, tone: number, weight = 1): Part => {
  const slant = Math.hypot(h, r1 - r2);
  return {
    area: Math.PI * (r1 + r2) * slant * weight, tone, size: 1,
    at: (r) => {
      const a = r() * Math.PI * 2, t = r(), rr = r1 + (r2 - r1) * t;
      return [[Math.cos(a) * rr, y0 + h * t, Math.sin(a) * rr], [Math.cos(a) * h, r1 - r2, Math.sin(a) * h]];
    }
  };
};

/** The drum under the dome (the side of a cylinder). */
const drum = (y0: number, h: number, rad: number, tone: number): Part => ({
  area: 2 * Math.PI * rad * h, tone, size: 1,
  at: (r) => { const a = r() * Math.PI * 2; return [[Math.cos(a) * rad, y0 + h * r(), Math.sin(a) * rad], [Math.cos(a), 0, Math.sin(a)]]; }
});

/** The dome: half a sphere, its normals pointing out from the centre. */
const dome = (cy: number, rad: number, tone: number, weight: number): Part => ({
  area: 2 * Math.PI * rad * rad * weight, tone, size: 1,
  at: (r) => {
    const up = r(), a = r() * Math.PI * 2, s = Math.sqrt(1 - up * up);
    const n: V = [s * Math.cos(a), up, s * Math.sin(a)];
    return [[n[0] * rad, cy + n[1] * rad, n[2] * rad], n];
  }
});

/** The stupa, bottom to top. */
function stupa(): Part[] {
  const brick = 0.6, white = 1, gold = 0.92;
  const P: Part[] = [];
  const add = (qs: Quad[], tone: number, weight = 1, size = 1) => P.push(...qs.map((q) => quadPart(q, tone, weight, size)));
  add(box(0, 0, 0, 2.5, 0.1, 2.5), brick);
  add(box(0, 0.1, 0, 2.2, 0.1, 2.2), brick);
  add(box(0, 0.2, 0, 1.9, 0.1, 1.9), brick);
  // a shrine on each side, against the drum
  for (let k = 0; k < 4; k++) {
    add(turnY([...box(0, 0.3, 0.8, 0.54, 0.28, 0.26), ...roof(0.58, 0.14, 0.34, 0.07, 0, 0.8)], (k * Math.PI) / 2), brick, 1.3);
  }
  // a chaitya at each corner
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const cx = sx * 1.03, cz = sz * 1.03;
    add([...box(cx, 0.2, cz, 0.22, 0.14, 0.22), ...roof(0.34, 0.14, 0.16, 0.03, cx, cz), ...box(cx, 0.48, cz, 0.025, 0.14, 0.025)], brick, 1.5);
  }
  P.push(drum(0.3, 0.14, 0.78, 0.85), dome(0.44, 0.78, white, 1.6));
  // the harmika, and the eyes looking out of each of its four faces
  add(box(0, 1.22, 0, 0.44, 0.3, 0.44), gold);
  for (let k = 0; k < 4; k++) {
    for (const x of [-0.1, 0.1]) {
      add(turnY([[[x - 0.05, 1.39, 0.222], [x + 0.05, 1.39, 0.222], [x + 0.05, 1.42, 0.222], [x - 0.05, 1.42, 0.222]]], (k * Math.PI) / 2), 1, 16, 0.45);
    }
  }
  // thirteen rings of spire, the umbrella, the finial
  let y = 1.52;
  for (let i = 0; i < 13; i++) { const r1 = 0.2 - i * 0.011; P.push(cone(y, 0.075, r1, r1 * 0.9, gold, 1.25)); y += 0.075; }
  P.push(cone(y, 0.04, 0.23, 0.1, white, 1.3), cone(y + 0.04, 0.22, 0.07, 0.008, gold, 1.5));
  return P;
}

/** Sample the parts into N points: where each sits, which way its surface faces, how bright, how big, and the scattered place it arrives from. */
function build() {
  const r = seeded(7);
  const parts = stupa();
  const total = parts.reduce((a, p) => a + p.area, 0);
  const ground = 1100;
  const surf = N - ground;
  const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), scatter = new Float32Array(N * 3);
  const shade = new Float32Array(N), delay = new Float32Array(N), size = new Float32Array(N);
  const L: V = [0.45, 0.8, 0.4];
  let k = 0;
  const put = (p: V, n: V, sz: number, lit: number) => {
    const nl = len(n) || 1;
    pos.set(p, k * 3);
    nor.set([n[0] / nl, n[1] / nl, n[2] / nl], k * 3);
    // arrives from a scattered cloud round the model's middle, as the globe's points did
    const out = 1.7 + r() * 1.9;
    scatter.set([p[0] * out + (r() - 0.5) * 0.9, (p[1] - 1.3) * out + 1.3 + (r() - 0.5) * 0.9, p[2] * out + (r() - 0.5) * 0.9], k * 3);
    delay[k] = r() * 0.45;
    shade[k] = lit;
    size[k] = sz;
    k++;
  };
  const from = (part: Part) => {
    const [p, n] = part.at(r);
    put(p, n, part.size, part.tone * (0.35 + 0.65 * Math.abs((n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (len(n) || 1))));
  };
  for (const part of parts) {
    const count = Math.max(1, Math.round((part.area / total) * surf));
    for (let i = 0; i < count && k < surf; i++) from(part);
  }
  while (k < surf) from(parts[Math.floor(r() * parts.length)]); // rounding left a few
  for (let i = 0; i < ground; i++) { // sparse ground returns round it, like a scanner's floor
    const a = r() * Math.PI * 2, d = 1.35 + Math.sqrt(r()) * 0.7;
    put([Math.cos(a) * d, 0, Math.sin(a) * d], [0, 1, 0], 0.7, 0.55);
  }
  return { pos, nor, scatter, shade, delay, size };
}

// The globe's own material: round points that arrive from a scattered cloud and settle,
// dimming where their surface turns away from the viewer.
const VS = /* glsl */ `
  attribute vec3 scatter; attribute float delay; attribute float aShade; attribute float aSize;
  uniform float uProgress; uniform float uSize; uniform float uDpr;
  varying float vFacing; varying float vT; varying float vShade;
  void main() {
    float t = clamp((uProgress - delay) / 0.55, 0.0, 1.0);
    t = 1.0 - pow(1.0 - t, 3.0);
    vec4 mv = modelViewMatrix * vec4(mix(scatter, position, t), 1.0);
    vFacing = normalize(mat3(modelViewMatrix) * normal).z;
    vT = t;
    vShade = aShade;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aSize * uDpr * (3.2 / -mv.z);
  }`;
const FS = /* glsl */ `
  uniform vec3 uColor; varying float vFacing; varying float vT; varying float vShade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    float edge = smoothstep(-0.05, 0.55, vFacing);
    gl_FragColor = vec4(uColor, mix(0.16, 0.92, edge) * (0.25 + 0.75 * vT) * (0.55 + 0.45 * vShade));
  }`;

export function PointStupa({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement | null>(null);
  const label = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // no WebGL: the hero's words stand alone
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(0, 0, 8);
    const turn = new THREE.Group(); // dragged and turning
    const model = new THREE.Group(); // scaled and centred
    scene.add(turn);
    turn.add(model);
    model.scale.setScalar(0.62);
    model.position.y = -1.25 * 0.62;

    const { pos, nor, scatter, shade, delay, size: sz } = build();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('scatter', new THREE.BufferAttribute(scatter, 3));
    geo.setAttribute('delay', new THREE.BufferAttribute(delay, 1));
    geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const ink = new THREE.Color('#F0F0F0');
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      uniforms: { uProgress: { value: still ? 1 : 0 }, uSize: { value: 5.2 }, uDpr: { value: dpr }, uColor: { value: ink } }
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    model.add(points);

    // The theme, as the globe had it: pale points on graphite, ink on silver.
    const offTheme = onTheme((light) => { ink.set(light ? '#1B1C20' : '#F0F0F0'); });

    let startedAt = 0;
    const undoIntro = afterIntro(() => { startedAt = performance.now(); });

    // drag to turn it, with a little momentum; left alone it keeps turning slowly
    const pose = { spin: 0.6, tilt: 0.14, vSpin: 0, vTilt: 0 };
    let dragging = false, lastX = 0, lastY = 0;
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      pose.vSpin = (e.clientX - lastX) * 0.006; pose.vTilt = (e.clientY - lastY) * 0.004;
      pose.spin += pose.vSpin; pose.tilt = Math.max(-0.2, Math.min(0.9, pose.tilt + pose.vTilt));
      lastX = e.clientX; lastY = e.clientY;
    };
    const onUp = () => { dragging = false; };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      // The canvas fills the whole hero; the stupa sits on it as wide as home.css --scan-d
      // (the same sum) and centred just under the nav.
      const navH = parseFloat(getComputedStyle(el).getPropertyValue('--nav-h')) || 66;
      const d = Math.min(window.innerHeight * 0.56, w * 0.9, 700);
      const tanHalf = h / (d * camera.position.z);
      camera.fov = (2 * Math.atan(tanHalf) * 180) / Math.PI;
      camera.aspect = w / h;
      turn.position.y = ((h / 2 - (navH + 24 + d / 2)) / h) * 2 * tanHalf * camera.position.z;
      camera.updateProjectionMatrix();
      // a smaller stupa gets finer dots, so a phone shows its shape, not a solid lump
      mat.uniforms.uSize.value = 5.2 * Math.min(1, Math.max(0.55, d / 520));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);

    const finial = new THREE.Vector3(0, TOP, 0), v = new THREE.Vector3();
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      if (startedAt && !still) mat.uniforms.uProgress.value = Math.min(1, (now - startedAt) / 2600);
      if (!dragging) {
        pose.spin += pose.vSpin + (still ? 0 : dt * 0.09);
        pose.tilt += pose.vTilt;
        pose.vSpin *= 0.92; pose.vTilt *= 0.92;
        pose.tilt += (0.14 - pose.tilt) * Math.min(1, dt * 0.8);
      }
      turn.rotation.set(pose.tilt, pose.spin, 0);
      renderer.render(scene, camera);

      // the tag follows the finial, once the points have gathered
      const lb = label.current;
      if (lb) {
        turn.updateMatrixWorld();
        v.copy(finial).applyMatrix4(model.matrixWorld).project(camera);
        lb.style.transform = `translate(${((v.x + 1) / 2) * el.clientWidth}px, ${((1 - v.y) / 2) * el.clientHeight}px)`;
        lb.style.opacity = String(Math.max(0, Math.min(1, (mat.uniforms.uProgress.value - 0.7) * 4)));
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      undoIntro();
      offTheme();
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      geo.dispose(); mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={className} ref={host} data-cursor="drag">
      <div className="hp-pin" ref={label} aria-hidden>
        <div className="hp-pin-tag">
          <span className="hp-pin-name">{N.toLocaleString('en-US')} points</span>
          <span className="hp-pin-coord">drag to orbit</span>
        </div>
      </div>
    </div>
  );
}
