'use client';
/** Calls `onOutside` on a mouse press outside every element in `refs`: how a
 *  menu or drawer closes when you click elsewhere (AccountMenu, EditorShell). */
import { useEffect, useRef, type RefObject } from 'react';

export function useClickOutside(refs: RefObject<Element | null>[], onOutside: () => void) {
  // the latest refs and callback, so the listener is added once
  const latest = useRef({ refs, onOutside });
  useEffect(() => { latest.current = { refs, onOutside }; });
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (latest.current.refs.every((r) => !r.current?.contains(t))) latest.current.onOutside();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
}
