'use client';
/**
 * The footer's backdrop (2026-10-05): a room as a LiDAR point cloud (floor
 * grid, two walls with a doorway, a counter and a table) turning slowly,
 * with a scan line passing through it that brightens the points it crosses.
 * Plain canvas 2D, about 1,600 points; it draws only while on screen, and
 * with reduced motion it draws one still frame. Decorative (aria-hidden).
 * Styles: inner.css .ft-cloud.
 */
import { useEffect, useRef } from 'react';

type P = [number, number, number];

/** The room, centred on the origin: 10 wide, 3 high, 7 deep. Seeded, so every visit draws the same room. */
function room(): P[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts: P[] = [];
  for (let x = -5; x <= 5.001; x += 0.42) for (let z = -3.5; z <= 3.501; z += 0.42) pts.push([x, 0, z]);
  for (let i = 0; i < 520; i++) {
    const x = -5 + rnd() * 10, y = rnd() * 3;
    if (!(x > 1.2 && x < 2.4 && y < 2.1)) pts.push([x, y, -3.5]); // back wall, with a doorway
  }
  for (let i = 0; i < 380; i++) pts.push([-5, rnd() * 3, -3.5 + rnd() * 7]); // side wall
  const box = (cx: number, cz: number, w: number, h: number, d: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const f = Math.floor(rnd() * 3), u = rnd() - 0.5, v = rnd() - 0.5;
      pts.push(f === 0 ? [cx + u * w, h, cz + v * d] : f === 1 ? [cx + u * w, rnd() * h, cz + (v < 0 ? -d : d) / 2] : [cx + (u < 0 ? -w : w) / 2, rnd() * h, cz + v * d]);
    }
  };
  box(-2.8, -2.4, 3.2, 1.05, 1.1, 260); // the counter
  box(1.6, 1, 1.8, 0.75, 1.8, 170); // a table
  return pts;
}

export function RoomCloud() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const pts = room();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, visible = false;
    const t0 = performance.now();

    const size = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (now: number) => {
      const t = (now - t0) / 1000;
      const a = -0.6 + (still ? 0 : t * 0.12), tilt = 0.42;
      const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(tilt), st = Math.sin(tilt);
      const scan = still ? 99 : ((t * 0.35) % 1.6) * 14 - 7; // the scan line's position across the room
      const f = Math.min(w, h * 1.33) * 1.05;
      ctx.clearRect(0, 0, w, h);
      for (const [x, y0, z] of pts) {
        const y = y0 - 1.3;
        const rx = x * ca - z * sa, rz = x * sa + z * ca;
        const ry = y * ct - rz * st, rz2 = y * st + rz * ct;
        const d = 16 - rz2;
        const sx = w / 2 + (rx * f) / d, sy = h / 2 - (ry * f) / d;
        const lit = Math.max(0, 1 - Math.abs(x - scan) / 0.9);
        const far = Math.min(1, Math.max(0, (d - 10) / 12)); // 0 near, 1 far
        ctx.globalAlpha = Math.min(1, 0.32 + (1 - far) * 0.45 + lit * 0.5);
        ctx.fillStyle = lit > 0.2 ? '#FFFFFF' : '#CFCFCF';
        const r = lit > 0.2 ? 1.8 : 1.3;
        ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
      }
      ctx.globalAlpha = 1;
      if (visible && !still) raf = requestAnimationFrame(draw);
    };

    size();
    const ro = new ResizeObserver(() => { size(); if (still || !visible) draw(performance.now()); });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    });
    io.observe(cv);
    draw(performance.now());
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  return <canvas ref={ref} className="ft-cloud" aria-hidden />;
}
