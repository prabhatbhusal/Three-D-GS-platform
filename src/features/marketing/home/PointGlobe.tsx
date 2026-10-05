'use client';
/**
 * The home page's globe, drawn the way a LiDAR scan is: out of points
 * (public/media/globe-land.bin, built by scripts/build-globe.mjs). On load the
 * points arrive from a scattered cloud and settle into the continents, like a
 * scan resolving. Kathmandu, where every capture starts, is pinned with its
 * coordinates, and arcs run from it to cities a tour can be walked from.
 * Drag to turn it; let go and it settles back. Reduced motion: it appears
 * resolved and still, arcs without their moving light. No WebGL: nothing is
 * drawn, and the headline below carries the page.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { afterIntro } from '../layout/Loader';

const KTM: [number, number] = [27.7172, 85.324];
// where tours are walked from: an illustration of reach, not visitor numbers
const CITIES: [number, number][] = [
  [51.507, -0.128], [40.713, -74.006], [-33.869, 151.209], [35.676, 139.65],
  [25.205, 55.271], [1.352, 103.82], [43.653, -79.383], [52.52, 13.405]
];
const RAD = Math.PI / 180;
const INK = new THREE.Color('#F0F0F0');
const SIGNAL = new THREE.Color('#FFFFFF');

/** Latitude/longitude → a point on the unit sphere (Y up, longitude 0 on +X). */
const toVec = (lat: number, lon: number, r = 1) =>
  new THREE.Vector3(Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.sin(lat * RAD), -Math.cos(lat * RAD) * Math.sin(lon * RAD)).multiplyScalar(r);

const POINTS_VS = /* glsl */ `
  attribute vec3 scatter; attribute float delay;
  uniform float uProgress; uniform float uSize; uniform float uDpr;
  varying float vFacing; varying float vT;
  void main() {
    float t = clamp((uProgress - delay) / 0.55, 0.0, 1.0);
    t = 1.0 - pow(1.0 - t, 3.0);
    vec4 mv = modelViewMatrix * vec4(mix(scatter, position, t), 1.0);
    vFacing = normalize(mat3(modelViewMatrix) * position).z;
    vT = t;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uDpr * (3.2 / -mv.z);
  }`;
const POINTS_FS = /* glsl */ `
  uniform vec3 uColor; varying float vFacing; varying float vT;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    float edge = smoothstep(-0.05, 0.55, vFacing);
    gl_FragColor = vec4(uColor, mix(0.18, 0.92, edge) * (0.25 + 0.75 * vT));
  }`;
const SPHERE_FS = /* glsl */ `
  uniform vec3 uBase; uniform vec3 uRim; varying vec3 vN;
  void main() { float f = pow(1.0 - max(vN.z, 0.0), 3.0); gl_FragColor = vec4(mix(uBase, uRim, f * 0.22), 1.0); }`;
const SPHERE_VS = /* glsl */ `
  varying vec3 vN;
  void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ARC_VS = /* glsl */ `
  attribute float aT; varying float vT;
  void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ARC_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uHead; uniform float uMoving; varying float vT;
  void main() {
    float x = vT - uHead;
    float trail = uMoving * step(-0.22, x) * step(x, 0.0) * (1.0 + x / 0.22);
    gl_FragColor = vec4(uColor, 0.16 + 0.84 * trail);
  }`;
const PIN_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uMoving;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = 1.0 - smoothstep(0.13, 0.17, d);
    float r = fract(uTime * 0.5);
    float ring = uMoving * (1.0 - r) * (1.0 - smoothstep(0.0, 0.07, abs(d - r)));
    float a = max(core, ring * 0.8);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }`;
const PIN_VS = /* glsl */ `
  uniform float uDpr;
  void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = 64.0 * uDpr; }`;

export function PointGlobe({ className }: { className?: string }) {
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
    // far back, so the globe keeps its round shape away from the canvas centre
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(0, 0, 8);
    const globe = new THREE.Group();
    scene.add(globe);
    // home: Kathmandu facing the viewer, the globe tipped so it sits a little above centre
    const home = { spin: -(Math.PI / 2 + KTM[1] * RAD), tilt: KTM[0] * RAD * 0.75 };
    const pose = { spin: home.spin + (still ? 0 : 0.9), tilt: home.tilt, vSpin: 0, vTilt: 0 };

    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.985, 64, 48), new THREE.ShaderMaterial({
      vertexShader: SPHERE_VS, fragmentShader: SPHERE_FS,
      uniforms: { uBase: { value: new THREE.Color('#1C1C1C') }, uRim: { value: new THREE.Color('#FFFFFF') } }
    }));
    globe.add(sphere);

    const pointsMat = new THREE.ShaderMaterial({
      vertexShader: POINTS_VS, fragmentShader: POINTS_FS, transparent: true, depthWrite: false,
      uniforms: { uProgress: { value: still ? 1 : 0 }, uSize: { value: 3.4 }, uDpr: { value: dpr }, uColor: { value: INK } }
    });

    // arcs from Kathmandu, raised in the middle by how far they go
    const from = toVec(...KTM);
    const arcMats: THREE.ShaderMaterial[] = [];
    for (const [i, [lat, lon]] of CITIES.entries()) {
      const to = toVec(lat, lon);
      const angle = from.angleTo(to);
      const lift = 0.08 + 0.32 * (angle / Math.PI);
      const pts: THREE.Vector3[] = [], ts: number[] = [];
      for (let s = 0; s <= 64; s++) {
        const t = s / 64;
        const p = new THREE.Vector3().copy(from).multiplyScalar(Math.sin((1 - t) * angle))
          .addScaledVector(to, Math.sin(t * angle)).divideScalar(Math.sin(angle)).normalize();
        pts.push(p.multiplyScalar(1 + lift * Math.sin(Math.PI * t)));
        ts.push(t);
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      geo.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
      const mat = new THREE.ShaderMaterial({
        vertexShader: ARC_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false,
        uniforms: { uColor: { value: SIGNAL }, uHead: { value: (i * 0.37) % 1 }, uMoving: { value: still ? 0 : 1 } }
      });
      arcMats.push(mat);
      globe.add(new THREE.Line(geo, mat));
      const end = new THREE.Points(new THREE.BufferGeometry().setFromPoints([to.clone().multiplyScalar(1.004)]),
        new THREE.PointsMaterial({ color: SIGNAL, size: 3.5 * dpr, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
      globe.add(end);
    }
    const pinMat = new THREE.ShaderMaterial({
      vertexShader: PIN_VS, fragmentShader: PIN_FS, transparent: true, depthWrite: false,
      uniforms: { uColor: { value: SIGNAL }, uTime: { value: 0 }, uMoving: { value: still ? 0 : 1 }, uDpr: { value: dpr } }
    });
    const pinAt = from.clone().multiplyScalar(1.006);
    globe.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints([pinAt]), pinMat));

    let alive = true;
    let loadedAt = 0;
    let undoIntro = () => {};
    fetch('/media/globe-land.bin').then((r) => r.arrayBuffer()).then((buf) => {
      if (!alive) return;
      const ll = new Int16Array(buf);
      const n = ll.length / 2;
      const pos = new Float32Array(n * 3), scatter = new Float32Array(n * 3), delay = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const v = toVec(ll[i * 2] / 100, ll[i * 2 + 1] / 100, 1.002);
        pos.set([v.x, v.y, v.z], i * 3);
        const out = 1.7 + Math.random() * 1.9; // the scattered cloud they arrive from
        const j = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.9);
        scatter.set([v.x * out + j.x, v.y * out + j.y, v.z * out + j.z], i * 3);
        delay[i] = Math.random() * 0.45;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('scatter', new THREE.BufferAttribute(scatter, 3));
      geo.setAttribute('delay', new THREE.BufferAttribute(delay, 1));
      globe.add(new THREE.Points(geo, pointsMat));
      // the points gather once the loading screen has lifted, not behind it
      undoIntro = afterIntro(() => { loadedAt = performance.now(); });
    }).catch(() => {});

    // drag to turn it, with a little momentum; idle, it eases home and sways
    let dragging = false, lastX = 0, lastY = 0;
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; el.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      pose.vSpin = (e.clientX - lastX) * 0.006; pose.vTilt = (e.clientY - lastY) * 0.004;
      pose.spin += pose.vSpin; pose.tilt = Math.max(-0.9, Math.min(1.2, pose.tilt + pose.vTilt));
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
      // The canvas fills the whole hero; the globe is placed on it: this wide
      // (the same sum as home.css --globe-d) and centred just under the nav.
      const navH = parseFloat(getComputedStyle(el).getPropertyValue('--nav-h')) || 66;
      const d = Math.min(window.innerHeight * 0.56, w * 0.9, 700);
      const tanHalf = h / (d * camera.position.z);
      camera.fov = (2 * Math.atan(tanHalf) * 180) / Math.PI;
      camera.aspect = w / h;
      globe.position.y = ((h / 2 - (navH + 24 + d / 2)) / h) * 2 * tanHalf * camera.position.z;
      camera.updateProjectionMatrix();
      // a smaller globe gets finer dots, so a phone shows continents, not a solid ball
      pointsMat.uniforms.uSize.value = 5.4 * Math.min(1, Math.max(0.55, d / 520));
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);

    const v = new THREE.Vector3(), n = new THREE.Vector3();
    let raf = 0, last = performance.now();
    const t0 = last;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      const time = (now - t0) / 1000;
      if (loadedAt && !still) pointsMat.uniforms.uProgress.value = Math.min(1, (now - loadedAt) / 2600);
      if (!dragging) {
        pose.spin += pose.vSpin; pose.tilt += pose.vTilt;
        pose.vSpin *= 0.92; pose.vTilt *= 0.92;
        const sway = still ? 0 : 0.28 * Math.sin(time * 0.11);
        pose.spin += (home.spin + sway - pose.spin) * Math.min(1, dt * 0.9);
        pose.tilt += (home.tilt - pose.tilt) * Math.min(1, dt * 0.9);
      }
      globe.rotation.set(pose.tilt, pose.spin, 0);
      pinMat.uniforms.uTime.value = time;
      for (const m of arcMats) m.uniforms.uHead.value = (m.uniforms.uHead.value + dt * 0.22) % 1.25;
      renderer.render(scene, camera);

      // the Kathmandu label follows its pin, and hides round the back
      const lb = label.current;
      if (lb) {
        globe.updateMatrixWorld();
        v.copy(pinAt).applyMatrix4(globe.matrixWorld);
        n.copy(v).normalize();
        const facing = n.dot(v.clone().sub(camera.position).normalize().negate());
        v.project(camera);
        lb.style.transform = `translate(${((v.x + 1) / 2) * el.clientWidth}px, ${((1 - v.y) / 2) * el.clientHeight}px)`;
        lb.style.opacity = String(Math.max(0, Math.min(1, (facing - 0.15) * 4)));
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      undoIntro();
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x?.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={className} ref={host} data-cursor="drag">
      <div className="hp-pin" ref={label} aria-hidden>
        <div className="hp-pin-tag">
          <span className="hp-pin-name">Kathmandu</span>
          <span className="hp-pin-coord">27.72° N, 85.32° E</span>
        </div>
      </div>
    </div>
  );
}
