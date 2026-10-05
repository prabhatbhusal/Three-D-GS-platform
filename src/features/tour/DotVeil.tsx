'use client';
/**
 * The tour's opening in the marketing site's dot language (2026-10-05):
 * a halftone veil over the room as it streams in (heavy behind the start
 * screen's words on the left, light on the right, thinning as the space
 * loads) with a scan line passing through it that lights the dots it crosses,
 * as a LiDAR pass does. On Start (`leaving`) the dots shrink away while the
 * view glides in; with `arrive` (every later space) it plays only that
 * dissolve, from a full veil. Canvas 2D; phones draw every other frame, and
 * with reduced motion the dots stay still and the dissolve is instant.
 * Styles: viewer.css .vw-dots.
 */
import { useEffect, useRef } from 'react';

export function DotVeil({ progress = 1, ready = true, leaving = false, arrive = false }: {
  progress?: number; ready?: boolean; leaving?: boolean; arrive?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const live = useRef({ progress, ready, leaving });
  useEffect(() => { live.current = { progress, ready, leaving }; }, [progress, ready, leaving]);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = matchMedia('(pointer: coarse)').matches;
    const cell = touch ? 16 : 18;
    const t0 = performance.now();
    let raf = 0, out = -1, skip = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (touch && (skip = !skip)) return;
      const { progress, ready, leaving } = live.current;
      const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = (now - t0) / 1000;
      // how much veil is left: 1 standing, 0 gone
      let fade = 1;
      if (arrive) fade = still ? 0 : 1 - t / 1.3;
      else if (leaving) { if (out < 0) out = now; fade = still ? 0 : 1 - (now - out) / 650; }
      if (fade <= 0) { cancelAnimationFrame(raf); return; }
      fade = fade * fade * (3 - 2 * fade); // ease
      const thin = arrive ? 0 : (ready ? 1 : progress) * 0.3; // the room shows through more as it loads
      const scan = still || ready || arrive || leaving ? -1e4 : (((t * 0.32) % 1.25) - 0.1) * w;
      for (let y = cell / 2, row = 0; y < h + cell; y += cell, row++) {
        for (let x = (row % 2) * (cell / 2); x < w + cell; x += cell) {
          const u = x / w;
          const wobble = Math.sin(x * 0.021 + y * 0.013) * 0.12;
          const base = arrive ? 0.88 : 1.05 - u * 0.95 - thin;
          const cover = Math.min(1, Math.max(0, (base + wobble) * fade));
          const d = Math.abs(x - scan);
          if (cover > 0.04) {
            ctx.globalAlpha = 0.86;
            ctx.fillStyle = '#080605';
            ctx.beginPath();
            ctx.arc(x, y, cover * cell * 0.6, 0, Math.PI * 2);
            ctx.fill();
          }
          if (d < 70) { // the scan line lights the points it passes
            ctx.globalAlpha = 0.7 * (1 - d / 70);
            ctx.fillStyle = '#F6F1E7';
            ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
          }
        }
      }
      ctx.globalAlpha = 1;
      if (still && !leaving && !arrive) cancelAnimationFrame(raf); // reduced motion: one still frame
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [arrive]);

  return <canvas ref={ref} className="vw-dots" aria-hidden />;
}
