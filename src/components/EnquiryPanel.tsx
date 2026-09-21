'use client';

import { useState } from 'react';
import { submitLead } from '../lib/api';

/**
 * The persistent CTA + enquiry panel (CLAUDE.md §6.4) — this is the product,
 * not an add-on. Mounted independent of whether the 3D ever loads
 * (constraint 5: "the CTA is never blocked by the 3D"), so it only needs a
 * scene id and name, never `state.ready`.
 *
 * Field/required defaults match the CTA default in CLAUDE.md §5.1 until a
 * real property document (with its own `cta.fields`) exists — see §13's
 * "to add" list. `formRenderedAt` and the hidden `website` field are the
 * bot-timing check and honeypot the backend (server/src/routes/leads.js)
 * actually enforces; everything else is just a nicer form.
 *
 * Open state can be owned by the caller (the Viewer keeps this and the Book
 * now card to one at a time) or left to the panel (the no-WebGL fallback).
 */
// maxLength on each input mirrors FIELD_LIMITS in server/src/routes/leads.js.
const REQUIRED = ['name', 'phone'] as const;
const LABEL: Record<string, string> = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  requirement: 'What are you looking for?',
  dates: 'Dates',
  message: 'Message'
};

type Status = 'idle' | 'sending' | 'done' | 'error';

const Chat = () => (
  <svg viewBox="0 0 24 24" aria-hidden><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 10h8M8 13h5" /></svg>
);

interface EnquiryPanelProps {
  sceneId: string;
  sceneName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EnquiryPanel({ sceneId, sceneName, open: openProp, onOpenChange }: EnquiryPanelProps) {
  const [openSelf, setOpenSelf] = useState(false);
  const open = openProp ?? openSelf;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setOpenSelf(o));
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [renderedAt] = useState(() => Date.now());

  const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const f of REQUIRED) {
      if (!values[f]?.trim()) {
        setError(`Add your ${LABEL[f].toLowerCase()} so the team can reach you.`);
        return;
      }
    }
    setStatus('sending');
    setError('');
    try {
      await submitLead({ ...values, sceneId, sceneName, formRenderedAt: renderedAt });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : "That didn't go through — check your connection and try again.");
    }
  };

  return (
    <>
      <button className={`vw-cta-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <Chat />
        <span>Ask about this space</span>
      </button>

      {open && (
        <>
          <div className="vw-sheet-scrim" onClick={() => setOpen(false)} />
          <div className="vw-sheet vw-sheet-ask" role="dialog" aria-label="Ask about this space">
            <button className="vw-sheet-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>

            {status === 'done' ? (
              <div className="vw-sheet-done">
                <span className="vw-sheet-tick" aria-hidden>✓</span>
                <h2>Thanks, we&apos;ve got it</h2>
                <p className="vw-sheet-sub">Someone from the team will get back to you about {sceneName || 'this space'} soon.</p>
                <button className="vw-sheet-go vw-sheet-go-quiet" onClick={() => setOpen(false)}>Keep exploring</button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <h2>Ask about this space</h2>
                <p className="vw-sheet-sub">{sceneName ? `About ${sceneName}` : 'Send an enquiry'}</p>

                <div className="vw-sheet-grid">
                  <label className="vw-sheet-input vw-span-2">
                    <span>{LABEL.name}</span>
                    <input value={values.name || ''} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={100} />
                  </label>
                  <label className="vw-sheet-input">
                    <span>{LABEL.phone}</span>
                    <input type="tel" value={values.phone || ''} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" maxLength={30} />
                  </label>
                  <label className="vw-sheet-input">
                    <span>{LABEL.email} <em>optional</em></span>
                    <input type="email" value={values.email || ''} onChange={(e) => set('email', e.target.value)} autoComplete="email" maxLength={200} />
                  </label>
                  <label className="vw-sheet-input vw-span-2">
                    <span>{LABEL.requirement}</span>
                    <select value={values.requirement || ''} onChange={(e) => set('requirement', e.target.value)}>
                      <option value="">Choose one</option>
                      <option>General enquiry</option>
                      <option>Room booking</option>
                      <option>Meeting or event space</option>
                      <option>Something else</option>
                    </select>
                  </label>
                  <label className="vw-sheet-input vw-span-2">
                    <span>{LABEL.dates} <em>optional</em></span>
                    <input value={values.dates || ''} onChange={(e) => set('dates', e.target.value)} placeholder="e.g. 12–14 October" maxLength={100} />
                  </label>
                  <label className="vw-sheet-input vw-span-2">
                    <span>{LABEL.message} <em>optional</em></span>
                    <textarea rows={3} value={values.message || ''} onChange={(e) => set('message', e.target.value)} maxLength={2000} />
                  </label>
                </div>

                {/* Honeypot — invisible and unreachable by tab order for a
                 *  real visitor; a bot that fills every field trips it. */}
                <label className="vw-cta-hp" aria-hidden="true">
                  <span>Leave this field empty</span>
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={values.website || ''}
                    onChange={(e) => set('website', e.target.value)}
                  />
                </label>

                {error && <p className="vw-sheet-err">{error}</p>}
                <button className="vw-sheet-go" type="submit" disabled={status === 'sending'}>
                  {status === 'sending' ? 'Sending…' : 'Send enquiry'}
                </button>
                <p className="vw-sheet-fine vw-sheet-center">Name and phone are all we need.</p>
              </form>
            )}
          </div>
        </>
      )}
    </>
  );
}
