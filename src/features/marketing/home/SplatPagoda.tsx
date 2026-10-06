'use client';
/**
 * The home page's hero object (2026-10-06): a
 * three-tier pagoda drawn the way a Gaussian-splat scan is: thousands of soft
 * elliptical splats, each a small disc lying on a surface and fading out
 * towards its edge (the same bell curve a real splat uses). Nothing is
 * downloaded: the pagoda is built here from a few boxes and sloped roofs,
 * sampled into splats with the surface's normal.
 *
 * It "scans in": a ring rises from the ground, and each splat appears as a
 * crisp LiDAR point as the ring passes, then swells into its soft splat just
 * behind it. Drag to turn it; left alone it turns slowly. Reduced motion: it
 * appears whole and still. No WebGL: nothing is drawn, the headline carries
 * the page. Styles: home.css .hp-scan (the canvas box) and .hp-pin (its tag).
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { afterIntro } from '../layout/Loader';
import { onTheme } from '../siteTheme';

const N = 15000;
const TOP = 2.35; // the finial's height; the scan ring rises past it
type V = [number, number, number];
type Quad = [V, V, V, V]; // p00, p10, p11, p01

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

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

/** A hipped roof: a square frustum with an underside (the eave). */
function roof(y0: number, h: number, a: number, b: number): Quad[] {
  const lo: V[] = [[-a, y0, -a], [a, y0, -a], [a, y0, a], [-a, y0, a]];
  const hi: V[] = [[-b, y0 + h, -b], [b, y0 + h, -b], [b, y0 + h, b], [-b, y0 + h, b]];
  const sides = [0, 1, 2, 3].map((i): Quad => [lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]]);
  return [...sides, [lo[0], lo[1], lo[2], lo[3]]];
}

/** The pagoda: stepped plinth, then three walls each under a roof, and a spire. */
function pagoda(): Quad[] {
  const q: Quad[] = [];
  q.push(...box(0, 0, 0, 2.1, 0.1, 2.1), ...box(0, 0.1, 0, 1.8, 0.1, 1.8), ...box(0, 0.2, 0, 1.5, 0.1, 1.5));
  let y = 0.3;
  [[0.78, 0.46, 0.34], [0.62, 0.4, 0.3], [0.48, 0.34, 0.26]].forEach(([wall, rw, rh], i) => {
    const wh = 0.36 - i * 0.04;
    q.push(...box(0, y, 0, wall, wh, wall));
    y += wh;
    q.push(...roof(y, rh, rw * 1.35 + 0.18, rw * 0.46));
    y += rh;
  });
  q.push(...box(0, y, 0, 0.17, 0.5, 0.17), ...box(0, y + 0.5, 0, 0.08, 0.3, 0.08)); // the spire
  return q;
}

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);

/** Sample the quads into N splats: position, two axes (tangent, bitangent, in the splat's own size), a shade, a random. */
function build() {
  const r = seeded(7);
  const quads = pagoda();
  const info = quads.map((p) => {
    const n = cross(sub(p[2], p[0]), sub(p[3], p[1]));
    return { p, n, area: len(n) / 2 };
  });
  const total = info.reduce((a, q) => a + q.area, 0);
  const ground = 1300;
  const surf = N - ground;
  const base = Math.sqrt(total / surf) * 0.95; // a splat's radius so neighbours overlap
  const pos = new Float32Array(N * 3), ax = new Float32Array(N * 3), bx = new Float32Array(N * 3);
  const shade = new Float32Array(N), rnd = new Float32Array(N);
  const L: V = [0.45, 0.8, 0.4];
  let k = 0;
  const put = (p: V, n: V, rad: number, lit: number) => {
    const nl = len(n) || 1;
    const nn: V = [n[0] / nl, n[1] / nl, n[2] / nl];
    // a tangent that isn't parallel to the normal
    const up: V = Math.abs(nn[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let t = cross(nn, up);
    const tl = len(t);
    t = [t[0] / tl, t[1] / tl, t[2] / tl];
    const bt = cross(nn, t);
    const sx = rad * (0.8 + r() * 0.7), sy = rad * (0.8 + r() * 0.7); // each splat a slightly different ellipse
    pos.set(p, k * 3);
    ax.set([t[0] * sx, t[1] * sx, t[2] * sx], k * 3);
    bx.set([bt[0] * sy, bt[1] * sy, bt[2] * sy], k * 3);
    shade[k] = lit;
    rnd[k] = r();
    k++;
  };
  for (const { p, n, area } of info) {
    const count = Math.max(1, Math.round((area / total) * surf));
    const lit = 0.38 + 0.62 * Math.abs((n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (len(n) || 1));
    for (let i = 0; i < count && k < surf; i++) {
      const s = r(), t = r();
      const pt = [0, 1, 2].map((c) => (1 - s) * (1 - t) * p[0][c] + s * (1 - t) * p[1][c] + s * t * p[2][c] + (1 - s) * t * p[3][c]) as V;
      put(pt, n, base, lit);
    }
  }
  while (k < surf) { // rounding left a few: spread them on the first quad
    const { p, n } = info[0];
    put([p[0][0] + r() * 2 - 1, p[0][1], p[0][2] + r() * 2 - 1], n, base, 0.8);
  }
  for (let i = 0; i < ground; i++) { // sparse ground returns round it, like a scanner's floor
    const a = r() * Math.PI * 2, d = 1.2 + Math.sqrt(r()) * 0.7;
    put([Math.cos(a) * d, 0, Math.sin(a) * d], [0, 1, 0], 0.03 + r() * 0.03, 0.55);
  }
  return { pos, ax, bx, shade, rnd };
}

const VS = /* glsl */ `
  attribute vec3 iPos; attribute vec3 iA; attribute vec3 iB; attribute float iShade; attribute float iRnd;
  uniform float uScan; varying vec2 vQ; varying float vShade; varying float vVis; varying float vGlow;
  void main() {
    float behind = uScan - iPos.y - iRnd * 0.1;           // how far the scan ring has passed this splat
    float grow = smoothstep(0.0, 0.55, behind);           // a crisp point first, then the soft splat
    vVis = step(0.0, behind);
    vGlow = exp(-pow(behind * 9.0, 2.0));                 // bright just as the ring passes
    float size = mix(0.14, 1.0, grow);
    vQ = position.xy;
    vShade = iShade;
    vec3 p = iPos + (iA * position.x + iB * position.y) * size;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const FS = /* glsl */ `
  uniform vec3 uColor; uniform float uAlpha; varying vec2 vQ; varying float vShade; varying float vVis; varying float vGlow;
  void main() {
    float d = dot(vQ, vQ);
    if (d > 1.0 || vVis < 0.5) discard;
    float g = exp(-4.2 * d);                               // the splat's bell curve
    float a = g * uAlpha * (0.4 + 0.6 * vShade) + vGlow * g * 0.5;
    gl_FragColor = vec4(uColor, a);
  }`;

export function SplatPagoda({ className }: { className?: string }) {
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
    model.scale.setScalar(0.78);
    model.position.y = -1.15 * 0.78;

    const { pos, ax, bx, shade, rnd } = build();
    const quad = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(ax, 3));
    geo.setAttribute('iB', new THREE.InstancedBufferAttribute(bx, 3));
    geo.setAttribute('iShade', new THREE.InstancedBufferAttribute(shade, 1));
    geo.setAttribute('iRnd', new THREE.InstancedBufferAttribute(rnd, 1));
    geo.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false,
      uniforms: { uScan: { value: still ? 9 : -0.2 }, uColor: { value: new THREE.Color('#F0F0F0') }, uAlpha: { value: 0.3 } }
    });
    const splats = new THREE.Mesh(geo, mat);
    splats.frustumCulled = false;
    model.add(splats);

    // the scan ring: a thin circle that rises through the model
    const ringGeo = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 97 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2) * 2.0, 0, Math.sin((i / 96) * Math.PI * 2) * 2.0))
    );
    const ringMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: still ? 0 : 0.7, depthTest: false });
    const ring = new THREE.LineLoop(ringGeo, ringMat);
    model.add(ring);

    // light theme: ink splats blended normally; dark: light splats that add up
    const offTheme = onTheme((light) => {
      (mat.uniforms.uColor.value as THREE.Color).set(light ? '#1B1C20' : '#F0F0F0');
      mat.uniforms.uAlpha.value = light ? 0.34 : 0.3;
      mat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      mat.needsUpdate = true;
      ringMat.color.set(light ? '#0E0F11' : '#FFFFFF');
    });

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

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      // The canvas fills the whole hero; the pagoda sits on it as wide as home.css --scan-d
      // (the same sum) and centred just under the nav.
      const navH = parseFloat(getComputedStyle(el).getPropertyValue('--nav-h')) || 66;
      const d = Math.min(window.innerHeight * 0.56, w * 0.9, 700);
      const tanHalf = h / (d * camera.position.z);
      camera.fov = (2 * Math.atan(tanHalf) * 180) / Math.PI;
      camera.aspect = w / h;
      turn.position.y = ((h / 2 - (navH + 24 + d / 2)) / h) * 2 * tanHalf * camera.position.z;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);

    const finial = new THREE.Vector3(0, TOP, 0), v = new THREE.Vector3();
    let raf = 0, last = performance.now();
    const t0 = last;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      let scan = 9;
      if (!still) {
        // 3.6 s, easing out, from below the ground to past the finial
        const p = startedAt ? Math.min(1, (now - startedAt) / 3600) : 0;
        scan = -0.2 + (TOP + 0.5) * (1 - Math.pow(1 - p, 2.2));
        ringMat.opacity = p >= 1 ? Math.max(0, ringMat.opacity - dt * 1.5) : 0.7;
        ring.position.y = scan;
        if (p >= 1 && ringMat.opacity <= 0) ring.visible = false;
      }
      mat.uniforms.uScan.value = scan;
      if (!dragging) {
        pose.spin += pose.vSpin + (still ? 0 : dt * 0.09);
        pose.tilt += pose.vTilt;
        pose.vSpin *= 0.92; pose.vTilt *= 0.92;
        pose.tilt += (0.14 - pose.tilt) * Math.min(1, dt * 0.8);
      }
      turn.rotation.set(pose.tilt, pose.spin, 0);
      renderer.render(scene, camera);

      // the tag follows the finial, once the scan has reached it
      const lb = label.current;
      if (lb) {
        turn.updateMatrixWorld();
        v.copy(finial).applyMatrix4(model.matrixWorld).project(camera);
        lb.style.transform = `translate(${((v.x + 1) / 2) * el.clientWidth}px, ${((1 - v.y) / 2) * el.clientHeight}px)`;
        lb.style.opacity = String(Math.max(0, Math.min(1, (scan - (TOP - 0.3)) * 2)));
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
      geo.dispose(); quad.dispose(); mat.dispose(); ringGeo.dispose(); ringMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={className} ref={host} data-cursor="drag">
      <div className="hp-pin" ref={label} aria-hidden>
        <div className="hp-pin-tag">
          <span className="hp-pin-name">{N.toLocaleString('en-US')} Gaussians</span>
          <span className="hp-pin-coord">drag to orbit</span>
        </div>
      </div>
    </div>
  );
}
