'use client';

import { useEffect, useRef } from 'react';

/**
 * The marketing illustration: a procedurally built lounge as a LiDAR point
 * cloud, with a scan plane sweeping across it and turning every point it
 * passes into a soft, coloured Gaussian splat. Plain 2D canvas — no WebGL,
 * no SDK, nothing that competes with a real tour for GPU or bytes.
 *
 * Motion: one sweep on load, then only pointer parallax. Reduced-motion gets
 * the finished frame. Rendering stops while the canvas is off-screen or the tab is hidden.
 */

type Pt = { x: number; y: number; z: number; c: [number, number, number]; s: number; d: number };

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CENTER = { x: 0, y: 1.4, z: 3 };
const CAM = { y: 1.55, dist: 7.2 };

function buildRoom(): Pt[] {
  const r = rng(7);
  const pts: Pt[] = [];
  const jit = (c: [number, number, number], k = 14): [number, number, number] =>
    c.map((v) => Math.max(0, Math.min(255, v + (r() - 0.5) * k * 2))) as [number, number, number];
  const add = (x: number, y: number, z: number, c: [number, number, number], s = 0.13) =>
    pts.push({ x, y, z, c: jit(c), s: s * (0.75 + r() * 0.5), d: 0 });

  // floor — oak planks
  for (let i = 0; i < 2090; i++) {
    const x = -3 + r() * 6, z = r() * 6;
    const plank = Math.floor((x + 3) * 2.2) % 2 ? [150, 104, 70] : [132, 90, 60];
    add(x, 0, z, plank as [number, number, number]);
  }
  // rug
  for (let i = 0; i < 836; i++) add(-1.9 + r() * 3.8, 0.02, 2.4 + r() * 2.6, [44, 64, 104]);
  // back wall with an arched window
  for (let i = 0; i < 2420; i++) {
    const x = -3 + r() * 6, y = r() * 3.2;
    const inArch = Math.abs(x) < 1.05 && y > 0.7 && (y < 2.1 || Math.hypot(x, y - 2.1) < 1.05);
    if (inArch) {
      const t = (y - 0.7) / 2.4;
      add(x, y, 6, [150 + t * 60, 196 + t * 30, 228 + t * 20], 0.15);
    } else {
      add(x, y, 6, [214, 204, 186]);
    }
  }
  // side walls — the right one warmed by a sconce
  for (let i = 0; i < 1540; i++) {
    const z = r() * 6, y = r() * 3.2;
    add(-3, y, z, [190, 180, 164]);
    const glow = Math.max(0, 1 - Math.hypot(z - 2.4, y - 2) / 1.4);
    add(3, y, z, [200 + glow * 55, 186 + glow * 50, 160 + glow * 20]);
  }
  // sofa
  for (let i = 0; i < 1144; i++) {
    const x = -1.6 + r() * 3.2;
    const face = r();
    if (face < 0.45) add(x, 0.45, 3.3 + r() * 0.9, [52, 94, 78]);
    else if (face < 0.8) add(x, 0.45 + r() * 0.55, 4.2, [46, 84, 70]);
    else add(x, r() * 0.45, 3.3, [38, 70, 58]);
  }
  // pendant lamp
  for (let i = 0; i < 374; i++) {
    const a = r() * Math.PI * 2, b = r() * Math.PI;
    add(0.2 + Math.cos(a) * Math.sin(b) * 0.26, 2.35 + Math.cos(b) * 0.26, 3.1 + Math.sin(a) * Math.sin(b) * 0.26, [255, 222, 168], 0.1);
  }
  for (let i = 0; i < 88; i++) add(0.2, 2.6 + r() * 0.6, 3.1, [120, 110, 100], 0.05);
  // plant
  for (let i = 0; i < 572; i++) {
    const h = r() * 1.6, rad = (1 - h / 1.6) * 0.45 * r();
    const a = r() * Math.PI * 2;
    add(-2.35 + Math.cos(a) * rad, h, 5.1 + Math.sin(a) * rad, h < 0.35 ? [120, 92, 70] : [58, 112, 64], 0.11);
  }
  return pts;
}

const spriteCache = new Map<string, HTMLCanvasElement>();
function sprite(c: [number, number, number]) {
  const q = c.map((v) => Math.round(v / 12) * 12);
  const key = q.join(',');
  let s = spriteCache.get(key);
  if (!s) {
    s = document.createElement('canvas');
    s.width = s.height = 32;
    const g = s.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, `rgba(${key},1)`);
    grad.addColorStop(0.45, `rgba(${key},0.55)`);
    grad.addColorStop(1, `rgba(${key},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    spriteCache.set(key, s);
  }
  return s;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function SplatField({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const pts = buildRoom();
    // Painter's order is set once: the parallax swing is small enough that
    // back-to-front barely changes.
    for (const p of pts) p.d = Math.hypot(p.x - CENTER.x, p.z - CENTER.z + CAM.dist);
    pts.sort((a, b) => b.d - a.d);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let yaw = 0, targetYaw = 0;
    const onPointer = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      targetYaw = ((e.clientX - b.left) / b.width - 0.5) * 0.35;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);

    const start = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || document.hidden || !w) return;
      const t = (now - start) / 1000;
      const sweep = reduced ? 9 : -3.6 + 7.2 * ease(Math.min(1, Math.max(0, (t - 0.5) / 5.5)));
      yaw += (targetYaw + (reduced ? 0 : Math.sin(t * 0.25) * 0.05) - yaw) * 0.05;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const f = Math.min(w, h * 1.4) * 0.95;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);

      for (const p of pts) {
        const dx = p.x - CENTER.x, dz = p.z - CENTER.z;
        const x = dx * cos - dz * sin;
        const zv = dx * sin + dz * cos + CAM.dist;
        if (zv < 0.5) continue;
        const sx = w / 2 + (x * f) / zv;
        const sy = h * 0.56 - ((p.y - CAM.y) * f) / zv;
        const edge = p.x - sweep;

        if (edge < 0) {
          const size = (p.s * f) / zv * 1.15;
          ctx.globalAlpha = Math.min(0.9, 0.25 - edge * 0.8);
          ctx.drawImage(sprite(p.c), sx - size / 2, sy - size / 2, size, size);
        } else if (edge < 0.18) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#DCE5FF';
          ctx.fillRect(sx - 1.2, sy - 1.2, 2.4, 2.4);
        } else {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#6F8FFF';
          ctx.fillRect(sx - 0.6, sy - 0.6, 1.2, 1.2);
        }
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onPointer);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={className}
      role="img"
      aria-label="Illustration: a LiDAR point cloud of a lounge turning into Gaussian splats as a scan passes over it"
    />
  );
}
