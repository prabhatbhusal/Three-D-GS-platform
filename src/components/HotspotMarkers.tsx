'use client';

import { useEffect, useReducer, useState } from 'react';
import { projected } from '../lib/hotspotProjector';
import { hotspotsFor, subscribeDoc } from '../lib/sceneDoc';
import type { HotspotType, ProjectedHotspot } from '../@types/hotspot.types';
import './hotspots.css';

const ICON: Record<HotspotType, string> = { image: '▣', video: '▶', text: 'i', link: '↗', portal: '⤢' };

/**
 * DOM markers for the active scene's hotspots, positioned from the per-frame
 * projection in hotspotProjector.js. Shared by the viewer (tap = open panel)
 * and the editor (tap = select).
 */
const sig = (list: ProjectedHotspot[]) =>
  list.map((m) => `${m.id}:${m.x | 0}:${m.y | 0}`).join('|');

interface HotspotMarkersProps {
  mode?: 'view' | 'edit';
  selId?: string;
  onSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
}

export function HotspotMarkers({ mode = 'view', selId, onSelect, onOpen }: HotspotMarkersProps) {
  const [marks, setMarks] = useState<ProjectedHotspot[]>([]);

  useEffect(() => {
    let raf: number, last = 0, prevSig = '';
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;
      last = t;
      const next = projected.list.filter((m) => m.onScreen);
      const s = sig(next);
      if (s === prevSig) return; // nothing moved -> no re-render
      prevSig = s;
      setMarks(next);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="hs-layer">
      {marks.map((m) => (
        <button
          key={m.id}
          className={`hs-dot hs-${m.type} ${mode === 'edit' && m.id === selId ? 'hs-sel' : ''}`}
          style={{ transform: `translate(-50%,-50%) translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)` }}
          onClick={() => (mode === 'edit' ? onSelect?.(m.id) : onOpen?.(m.id))}
          title={m.label}
        >
          <span className="hs-ic">{ICON[m.type] || '•'}</span>
          <span className="hs-lbl">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Slide-up panel shown when a viewer taps a hotspot.
 */
interface HotspotPanelProps {
  sceneId: string;
  id: string;
  onClose: () => void;
  onPortal?: (sceneId: string) => void;
}

export function HotspotPanel({ sceneId, id, onClose, onPortal }: HotspotPanelProps) {
  const [, bump] = useReducer((n) => n + 1, 0);
  useEffect(() => subscribeDoc(bump), []);

  const hs = hotspotsFor(sceneId).find((h) => h.id === id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!hs) return null;
  const pl = hs.payload || {};

  return (
    <>
      <div className="hs-scrim" onClick={onClose} />
      <div className="hs-panel" role="dialog" aria-label={hs.label}>
        <button className="hs-panel-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="hs-panel-title">{hs.label}</div>

        {hs.type === 'image' && pl.url && (
          <img className="hs-panel-img" src={pl.url} alt={pl.caption || hs.label} />
        )}
        {hs.type === 'image' && pl.caption && <p className="hs-panel-body">{pl.caption}</p>}

        {hs.type === 'video' && pl.url && (
          <video className="hs-panel-img" src={pl.url} controls playsInline />
        )}

        {hs.type === 'text' && <p className="hs-panel-body">{pl.text || 'No text yet.'}</p>}

        {hs.type === 'link' && pl.url && (
          <a className="hs-panel-link" href={pl.url} target="_blank" rel="noreferrer">
            {pl.text || 'Open'} ↗
          </a>
        )}

        {hs.type === 'portal' && (
          <button
            className="hs-panel-link"
            onClick={() => { if (pl.sceneId) onPortal?.(pl.sceneId); onClose(); }}
          >
            Go to {pl.sceneId || '…'}
          </button>
        )}
      </div>
    </>
  );
}
