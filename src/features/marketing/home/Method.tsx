'use client';
/**
 * "From one walk to a live tour" (2026-10-05, after weevolveit.com's method,
 * our own): right under the hero, the dark page breaks into halftone dots
 * that shrink away to light paper, then the section pins and one cloud of
 * points re-forms for each step as you scroll:
 *   the globe → Capture, a scanned room → Process, the room as Gaussian
 *   splats → Author, a floor plan with hotspot pins → Publish, a phone.
 * Every shape has the same number of points, so each flows into the next
 * (three.js, one Points mesh, the shapes as attributes, mixed in the shader
 * with a little stagger and lift so the cloud pours rather than snaps). The
 * words for each step slide in beside it; ticks along the foot show where you
 * are. Reduced motion: no pin, the steps stacked, the globe still.
 * Styles: home.css .hp-mm.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Button } from '../../../components/ui/Button';
import { STEPS } from '../siteContent';
import { withBase } from '../../../lib/basePath';

const N = 4200;
const INK = '#141414';
// a line or two under each step, from what the rest of the site already states
const MORE = [
  ['One walk on site', '±1.2 cm relative accuracy'],
  ['Full fidelity, never shrunk', 'Streams as the camera moves'],
  ['Start view and hotspots', 'Narration and a guided flight'],
  ['One link and one embed code', 'Opens on an ordinary phone']
];

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** Turn a shape about X then Y (radians), in place. */
function turn(p: Float32Array, rx: number, ry: number) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
    p[i] = x * cy + z1 * sy; p[i + 1] = y1; p[i + 2] = -x * sy + z1 * cy;
  }
  return p;
}

/** The globe: the hero's land points (lat/lon ×100 as Int16), or an even sphere without them. */
function globe(ll: Int16Array | null) {
  const p = new Float32Array(N * 3), R = 1.75, rad = Math.PI / 180;
  const count = ll ? ll.length / 2 : 0;
  for (let i = 0; i < N; i++) {
    let lat: number, lon: number;
    if (count) { const j = Math.floor((i * count) / N); lat = ll![j * 2] / 100; lon = ll![j * 2 + 1] / 100; }
    else { lat = Math.asin(1 - (2 * (i + 0.5)) / N) / rad; lon = (i * 137.508) % 360; }
    p[i * 3] = R * Math.cos(lat * rad) * Math.cos(lon * rad);
    p[i * 3 + 1] = R * Math.sin(lat * rad);
    p[i * 3 + 2] = -R * Math.cos(lat * rad) * Math.sin(lon * rad);
  }
  return p;
}

/** Capture: a room as LiDAR sees it: floor, two walls with a doorway, a counter, a table. */
function room() {
  const r = seeded(11), p = new Float32Array(N * 3);
  const W = 2.2, D = 1.5, H = 1.35;
  for (let i = 0; i < N; i++) {
    const k = i / N, u = r(), v = r();
    let x: number, y: number, z: number;
    if (k < 0.36) { x = (u * 2 - 1) * W; y = 0; z = (v * 2 - 1) * D; } // floor
    else if (k < 0.66) { x = (u * 2 - 1) * W; y = v * H; z = -D; if (x > 0.5 && x < 1.1 && y < 0.95) y += 0.95; } // back wall, a doorway
    else if (k < 0.84) { x = -W; y = v * H; z = (u * 2 - 1) * D; } // side wall
    else if (k < 0.93) { x = -1.2 + u * 1.5; y = v < 0.4 ? 0.5 : v * 0.5; z = -1.05 + (r() - 0.5) * 0.4; } // counter
    else { const a = u * Math.PI * 2, rr = Math.sqrt(v) * 0.45; x = 0.8 + Math.cos(a) * rr; z = 0.4 + Math.sin(a) * rr; y = r() < 0.7 ? 0.38 : r() * 0.38; } // a round table
    p[i * 3] = x; p[i * 3 + 1] = y - H / 2; p[i * 3 + 2] = z;
  }
  return turn(p, 0.42, -0.62);
}

/** Process: the same room as Gaussian splats: soft clusters round the scan's points. */
function splats(roomPts: Float32Array) {
  const r = seeded(23), p = new Float32Array(N * 3), K = 70;
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-6)) * Math.cos(2 * Math.PI * r());
  const centres = Array.from({ length: K }, () => Math.floor(r() * N) * 3);
  const sizes = centres.map(() => [0.05 + r() * 0.2, 0.04 + r() * 0.12, 0.05 + r() * 0.2]);
  for (let i = 0; i < N; i++) {
    const k = i % K, c = centres[k], s = sizes[k];
    p[i * 3] = roomPts[c] + gauss() * s[0];
    p[i * 3 + 1] = roomPts[c + 1] + gauss() * s[1];
    p[i * 3 + 2] = roomPts[c + 2] + gauss() * s[2];
  }
  return p;
}

/** Points spread along a polyline (closed when the first and last points match). */
function along(out: Float32Array, from: number, to: number, pts: [number, number][], jitter: number, r: () => number) {
  const segs = pts.slice(1).map((q, i) => [pts[i], q, Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1])] as const);
  const total = segs.reduce((a, s) => a + s[2], 0);
  for (let i = from; i < to; i++) {
    let d = ((i - from) / (to - from)) * total, j = 0;
    while (j < segs.length - 1 && d > segs[j][2]) d -= segs[j++][2];
    const [a, b, len] = segs[j], t = len ? d / len : 0;
    out[i * 3] = a[0] + (b[0] - a[0]) * t + (r() - 0.5) * jitter;
    out[i * 3 + 1] = a[1] + (b[1] - a[1]) * t + (r() - 0.5) * jitter;
    out[i * 3 + 2] = (r() - 0.5) * 0.04;
  }
}
const ring = (cx: number, cy: number, rr: number, n = 24): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rr, cy + Math.sin((i / n) * Math.PI * 2) * rr]);

/** Author: the room drawn as a plan, with three hotspot pins and the camera's path between them. */
function plan() {
  const r = seeded(37), p = new Float32Array(N * 3), n = (f: number) => Math.floor(N * f);
  along(p, 0, n(0.34), [[-2, -1.3], [2, -1.3], [2, 1.3], [-2, 1.3], [-2, -1.3]], 0.03, r); // outline
  along(p, n(0.34), n(0.46), [[0.4, -1.3], [0.4, 0.2]], 0.03, r); // a wall
  along(p, n(0.46), n(0.54), [[0.4, 0.75], [0.4, 1.3]], 0.03, r); // and its doorway
  along(p, n(0.54), n(0.62), [[-2, 0.1], [-0.9, 0.1]], 0.03, r);
  const pins: [number, number][] = [[-1.2, -0.6], [1.2, -0.5], [-0.5, 0.75]];
  pins.forEach(([x, y], k) => along(p, n(0.62 + k * 0.07), n(0.69 + k * 0.07), ring(x, y, 0.2), 0.02, r)); // pins
  along(p, n(0.83), N, [[-1.2, -0.6], [-0.3, -0.85], [1.2, -0.5], [0.6, 0.45], [-0.5, 0.75]], 0.05, r); // the track
  return turn(p, -0.55, 0.25);
}

/** Publish: a phone with the room on its screen and a link under it. */
function phone(roomPts: Float32Array) {
  const r = seeded(41), p = new Float32Array(N * 3), n = (f: number) => Math.floor(N * f);
  const w = 0.85, h = 1.7, c = 0.22, corner: [number, number][] = [];
  for (const [cx, cy, a0] of [[w - c, h - c, 0], [-w + c, h - c, 90], [-w + c, -h + c, 180], [w - c, -h + c, 270]] as const)
    for (let a = 0; a <= 90; a += 15) corner.push([cx + Math.cos(((a0 + a) * Math.PI) / 180) * c, cy + Math.sin(((a0 + a) * Math.PI) / 180) * c]);
  corner.push(corner[0]);
  along(p, 0, n(0.3), corner, 0.02, r); // the body
  along(p, n(0.3), n(0.34), [[-0.22, h - 0.14], [0.22, h - 0.14]], 0.02, r); // the speaker
  for (let i = n(0.34), j = 0; i < n(0.88); i++, j = (j + 7) % N) { // the room, small, on the screen
    p[i * 3] = roomPts[j * 3] * 0.33; p[i * 3 + 1] = roomPts[j * 3 + 1] * 0.33 + 0.25; p[i * 3 + 2] = roomPts[j * 3 + 2] * 0.12;
  }
  along(p, n(0.88), N, [[-0.5, -1.15], [0.5, -1.15], [0.5, -0.95], [-0.5, -0.95], [-0.5, -1.15]], 0.02, r); // the link
  return turn(p, 0.05, -0.32);
}

const VERT = `
  attribute vec3 a0; attribute vec3 a1; attribute vec3 a2; attribute vec3 a3; attribute vec3 a4; attribute float aRnd;
  uniform float uS; uniform float uSize; uniform float uDpr; varying float vA;
  vec3 pick(float i) { return i < 0.5 ? a0 : i < 1.5 ? a1 : i < 2.5 ? a2 : i < 3.5 ? a3 : a4; }
  void main() {
    float s = clamp(uS, 0.0, 4.0), i = min(floor(s), 3.0), f = s - i;
    float t = smoothstep(0.0, 1.0, clamp((f - aRnd * 0.4) / 0.6, 0.0, 1.0));
    vec3 p = mix(pick(i), pick(i + 1.0), t);
    p += vec3(aRnd - 0.5, 0.8, fract(aRnd * 7.31) - 0.5) * sin(t * 3.14159) * 0.55; // a lift mid-flight
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uDpr * (9.0 / -mv.z);
    vA = clamp(1.3 - (-mv.z - 7.5) * 0.3, 0.3, 0.95);
  }`;
const FRAG = `
  uniform vec3 uColor; varying float vA;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor, vA * smoothstep(0.5, 0.3, d)); }`;

/** The halftone edge: the dark page as dots that shrink away to paper (or grow back, `flip`) as it scrolls past. */
function Halftone({ flip = false }: { flip?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext('2d')!;
    const scroller = cv.closest('.site');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cell = 22;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const b = cv.getBoundingClientRect();
      // 0 while the edge is below the screen, 1 once it has passed the top
      const p = still ? 0.5 : Math.min(1, Math.max(0, (innerHeight - b.top) / (innerHeight + b.height)));
      ctx.fillStyle = '#161616';
      for (let y = cell / 2; y < h + cell; y += cell) {
        const v = flip ? 1 - y / h : y / h;
        for (let x = (Math.floor(y / cell) % 2) * (cell / 2); x < w + cell; x += cell) {
          const wobble = Math.sin(x * 0.013 + y * 0.004) * 0.12;
          const cover = Math.min(1, Math.max(0, 1.15 - v * 1.6 - (p - 0.5) * (flip ? -0.6 : 0.6) + wobble));
          if (cover <= 0.02) continue;
          ctx.beginPath();
          ctx.arc(x, y, cover * cell * 0.74, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(draw); };
    draw();
    if (!still) scroller?.addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(raf); scroller?.removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); };
  }, [flip]);
  return <canvas ref={ref} className={flip ? 'hp-mm-tone is-flip' : 'hp-mm-tone'} aria-hidden />;
}

export function Method() {
  const track = useRef<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const tr = track.current!, st = stage.current!, cv = canvas.current!;
    const scroller = tr.closest('.site');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const steps = [...st.querySelectorAll<HTMLElement>('.hp-mm-step')];
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch { return; } // no WebGL: the words stand alone
    const dpr = Math.min(2, devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 9);
    const group = new THREE.Group();
    scene.add(group);

    const geo = new THREE.BufferGeometry();
    const rnd = new Float32Array(N);
    const r = seeded(5);
    for (let i = 0; i < N; i++) rnd[i] = r();
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
    const roomPts = room();
    const shapes = [globe(null), roomPts, splats(roomPts), plan(), phone(roomPts)];
    shapes.forEach((s, i) => geo.setAttribute(`a${i}`, new THREE.BufferAttribute(s, 3)));
    geo.setAttribute('position', new THREE.BufferAttribute(shapes[0], 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      uniforms: { uS: { value: 0 }, uSize: { value: 2.4 }, uDpr: { value: dpr }, uColor: { value: new THREE.Color(INK) } }
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    // the globe in the hero's own land shapes, once they arrive
    fetch(withBase('/media/globe-land.bin')).then((res) => res.arrayBuffer()).then((buf) => {
      (geo.getAttribute('a0') as THREE.BufferAttribute).copyArray(globe(new Int16Array(buf))).needsUpdate = true;
    }).catch(() => {});

    const size = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = w / h < 0.9 ? 12 : 9; // narrow screens: step back so the shapes fit
      camera.updateProjectionMatrix();
    };
    size();

    let target = 0, s = 0, raf = 0, on = false, last = -1;
    const t0 = performance.now();
    const read = () => {
      const b = tr.getBoundingClientRect(), span = b.height - innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -b.top / span)) : 0;
      target = Math.min(4, Math.max(0, p * 4.4 - 0.2));
      st.style.setProperty('--p', p.toFixed(4));
    };
    const frame = (now: number) => {
      raf = 0;
      s = still ? target : s + (target - s) * 0.075; // the cloud eases after the scroll, so it always glides
      if (Math.abs(target - s) < 0.0005) s = target;
      const t = (now - t0) / 1000;
      mat.uniforms.uS.value = s;
      const spin = Math.max(0, 1 - s * 1.5); // the globe turns; the later shapes only sway
      group.rotation.y = spin * t * 0.25 + (1 - spin) * Math.sin(t * 0.35) * 0.3;
      group.rotation.x = Math.sin(t * 0.25) * 0.05;
      renderer.render(scene, camera);
      const active = Math.min(3, Math.max(0, Math.round(s) - 1));
      if (active !== last) { steps.forEach((el, i) => el.toggleAttribute('data-on', i === active)); last = active; }
      if (on && !still) raf = requestAnimationFrame(frame);
    };
    const onScroll = () => { read(); if (still) frame(performance.now()); };
    const io = new IntersectionObserver(([e]) => {
      on = e.isIntersecting;
      if (on && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(tr);
    const ro = new ResizeObserver(() => { size(); read(); frame(performance.now()); });
    ro.observe(cv);
    read();
    frame(performance.now());
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      scroller?.removeEventListener('scroll', onScroll);
      geo.dispose(); mat.dispose(); renderer.dispose();
    };
  }, []);

  return (
    <section className="hp-mm" aria-labelledby="hp-mm-title">
      <Halftone />
      <header className="hp-mm-head">
        <p className="hp-mm-kicker">rcaas.tech / method</p>
        <h2 id="hp-mm-title">From one walk to a live tour.</h2>
        <p>Days, not months, from the first walk-through to a link on your website.</p>
        <ol className="hp-mm-seq" aria-label="The steps">{STEPS.map((s) => <li key={s.t}>{s.t}</li>)}</ol>
      </header>
      <div className="hp-mm-track" ref={track}>
        <div className="hp-mm-stage" ref={stage}>
          <canvas className="hp-mm-gl" ref={canvas} aria-hidden />
          <ol className="hp-mm-steps">
            {STEPS.map((s, i) => (
              <li key={s.t} className="hp-mm-step" data-on={i === 0 ? '' : undefined}>
                <span className="hp-mm-n" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.t}.</h3>
                <p>{s.b}</p>
                <ul>{MORE[i].map((m) => <li key={m}>{m}</li>)}</ul>
              </li>
            ))}
          </ol>
          <ol className="hp-mm-ticks" aria-hidden>
            {STEPS.map((s) => <li key={s.t}>{s.t}</li>)}
          </ol>
        </div>
      </div>
      <div className="hp-mm-end">
        <Button href="/contact" variant="primary" large transitionTypes={['nav-forward']}>Book a capture</Button>
      </div>
      <Halftone flip />
    </section>
  );
}
