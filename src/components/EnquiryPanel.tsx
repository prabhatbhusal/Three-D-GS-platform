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
 */
const REQUIRED = ['name', 'phone'] as const;
const LABEL: Record<string, string> = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email (optional)',
  requirement: 'What are you looking for',
  dates: 'Dates (optional)',
  message: 'Message (optional)'
};

type Status = 'idle' | 'sending' | 'done' | 'error';

export function EnquiryPanel({ sceneId, sceneName }: { sceneId: string; sceneName?: string }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [renderedAt] = useState(() => Date.now());

  const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const f of REQUIRED) {
      if (!values[f]?.trim()) {
        setError(`${LABEL[f]} is required.`);
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
      <button className="vw-cta-btn" onClick={() => setOpen(true)}>
        <span>Ask about this space</span>
      </button>

      {open && (
        <>
          <div className="vw-cta-scrim" onClick={() => setOpen(false)} />
          <div className="vw-cta-panel" role="dialog" aria-label="Enquire about this space">
            <button className="vw-cta-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>

            {status === 'done' ? (
              <div className="vw-cta-done">
                <h2>Thanks — we&apos;ve got it</h2>
                <p>Someone from the team will get back to you about {sceneName || 'this space'} shortly.</p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h2>Ask about this space</h2>
                <p className="vw-cta-sub">
                  {sceneName ? `Enquiring about ${sceneName}` : 'Send an enquiry'}
                </p>

                {error && <p className="vw-cta-error">{error}</p>}

                <label className="vw-cta-field">
                  <span>{LABEL.name}</span>
                  <input value={values.name || ''} onChange={(e) => set('name', e.target.value)} autoComplete="name" />
                </label>
                <label className="vw-cta-field">
                  <span>{LABEL.phone}</span>
                  <input type="tel" value={values.phone || ''} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" />
                </label>
                <label className="vw-cta-field">
                  <span>{LABEL.email}</span>
                  <input type="email" value={values.email || ''} onChange={(e) => set('email', e.target.value)} autoComplete="email" />
                </label>
                <label className="vw-cta-field">
                  <span>{LABEL.requirement}</span>
                  <select value={values.requirement || ''} onChange={(e) => set('requirement', e.target.value)}>
                    <option value="">Select one</option>
                    <option>General enquiry</option>
                    <option>Room booking</option>
                    <option>Meeting or event space</option>
                    <option>Something else</option>
                  </select>
                </label>
                <label className="vw-cta-field">
                  <span>{LABEL.dates}</span>
                  <input value={values.dates || ''} onChange={(e) => set('dates', e.target.value)} />
                </label>
                <label className="vw-cta-field">
                  <span>{LABEL.message}</span>
                  <textarea rows={3} value={values.message || ''} onChange={(e) => set('message', e.target.value)} />
                </label>

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

                <button className="vw-cta-submit" type="submit" disabled={status === 'sending'}>
                  {status === 'sending' ? 'Sending…' : 'Send enquiry'}
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </>
  );
}
