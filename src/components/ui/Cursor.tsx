'use client';
/**
 * The marketing site's pointer, after prabhatbhusal.com.np: a ring that
 * follows the mouse on a spring and a dot exactly at it, drawn in difference
 * blend so it reads over any colour. Over links and buttons the ring grows;
 * over anything marked data-cursor="drag" (the home page's stupa) it grows
 * more; over a text field it steps aside for the normal caret. Only with a
 * mouse (a fine pointer that hovers): touch keeps the usual behaviour.
 * Mounted by app/(site)/layout.tsx. Styles: site.css .site-cursor.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

const FINE = '(hover: hover) and (pointer: fine)';
const onFineChange = (cb: () => void) => {
  const m = matchMedia(FINE);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
const ring = (d: number, opacity: number) => ({ width: d, height: d, marginLeft: -d / 2, marginTop: -d / 2, opacity });
const STATES = { idle: ring(30, 0.55), interactive: ring(52, 0.9), drag: ring(72, 0.9), hidden: ring(30, 0) };
type State = keyof typeof STATES;
const EASE = [0.22, 0.7, 0.25, 1] as const;
const SPRING = { stiffness: 420, damping: 34, mass: 0.4 };

export function Cursor() {
  const fine = useSyncExternalStore(onFineChange, () => matchMedia(FINE).matches, () => false);
  const [state, setState] = useState<State>('idle');
  const [inside, setInside] = useState(false);
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, SPRING), sy = useSpring(y, SPRING);

  useEffect(() => {
    if (!fine) return;
    document.documentElement.classList.add('has-custom-cursor');
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setInside(true);
      const t = e.target as Element | null;
      if (!t?.closest) return;
      if (t.closest("input, textarea, select, [contenteditable='true']")) { setState('hidden'); return; }
      const hit = t.closest("a, button, summary, label, [role='button'], [data-cursor]");
      setState(hit ? (hit.getAttribute('data-cursor') === 'drag' ? 'drag' : 'interactive') : 'idle');
    };
    const leave = () => setInside(false);
    const enter = () => setInside(true);
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    document.addEventListener('pointerenter', enter);
    return () => {
      document.documentElement.classList.remove('has-custom-cursor');
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
      document.removeEventListener('pointerenter', enter);
    };
  }, [fine, x, y]);

  if (!fine) return null;
  const shown = inside && state !== 'hidden';
  return (
    <div className="site-cursor" aria-hidden>
      <motion.span className="site-cursor-ring" style={{ x: sx, y: sy }}
        animate={{ ...STATES[state], opacity: shown ? STATES[state].opacity : 0 }} transition={{ duration: 0.22, ease: EASE }} />
      <motion.span className="site-cursor-dot" style={{ x, y }}
        animate={{ scale: shown && state === 'idle' ? 1 : 0 }} transition={{ duration: 0.18, ease: EASE }} />
    </div>
  );
}
