'use client';

import { useState } from 'react';
import { submitLead, whatsappHref } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { countIntent } from '../../lib/stats';

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
  /** The project it's about — set by the hub page, whose enquiries aren't about one space. */
  propertyId?: string;
  /** The pill's words; the tour's default is about the space you're in. */
  label?: string;
  /** The last hotspot the visitor opened in this space, sent with the
   *  enquiry: what they were looking at when they decided to ask. */
  hotspot?: { id: string; label: string } | null;
  /** The project's WhatsApp number: a chat button above the form. Many
   *  visitors would rather message than fill one in. */
  whatsapp?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EnquiryPanel({ sceneId, sceneName, propertyId, label, hotspot, whatsapp, open: openProp, onOpenChange }: EnquiryPanelProps) {
  const t = useT();
  // Asked from inside a space, the enquiry is about that space unless they
  // say otherwise: it's chosen for them. (The project page's form isn't.)
  const spaceOption = sceneId !== 'hub' && sceneName ? `This space: ${sceneName}` : '';
  const REQ = ['General enquiry', 'Room booking', 'Meeting or event space', 'Something else'];
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
        setError(t(`Add your ${LABEL[f].toLowerCase()} so the team can reach you.`));
        return;
      }
    }
    setStatus('sending');
    setError('');
    try {
      await submitLead({
        ...values, requirement: values.requirement ?? spaceOption, sceneId, sceneName, propertyId,
        hotspotId: hotspot?.id, hotspotLabel: hotspot?.label, formRenderedAt: renderedAt
      });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : t('That didn’t go through — check your connection and try again.'));
    }
  };

  return (
    <>
      <button className={`vw-cta-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <Chat />
        <span>{label ?? t('Ask about this space')}</span>
      </button>

      {open && (
        <>
          <div className="vw-sheet-scrim" onClick={() => setOpen(false)} />
          <div className="vw-sheet vw-sheet-ask" role="dialog" aria-label={t('Ask about this space')}>
            <button className="vw-sheet-x" onClick={() => setOpen(false)} aria-label={t('Close')}>✕</button>

            {status === 'done' ? (
              <div className="vw-sheet-done">
                <span className="vw-sheet-tick" aria-hidden>✓</span>
                <h2>{t('Thanks, we’ve got it')}</h2>
                <p className="vw-sheet-sub">{t('Someone from the team will get back to you about {place} soon.', { place: sceneName || t('this space') })}</p>
                <button className="vw-sheet-go vw-sheet-go-quiet" onClick={() => setOpen(false)}>{t('Keep exploring')}</button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <h2>{label ?? t('Ask about this space')}</h2>
                <p className="vw-sheet-sub">{sceneName ? t('About {place}', { place: sceneName }) : t('Send an enquiry')}</p>

                {whatsapp && (
                  <a
                    className="vw-sheet-go vw-sheet-wa" target="_blank" rel="noopener noreferrer"
                    href={whatsappHref(whatsapp, sceneId !== 'hub' && sceneName
                      ? t('Hi! I’m looking at {place} in your virtual tour.', { place: sceneName })
                      : t('Hi! I found you through your virtual tour.'))}
                    onClick={() => countIntent(sceneId, 'whatsapp')}
                  >
                    {t('Chat on WhatsApp')}
                  </a>
                )}

                <div className="vw-sheet-grid">
                  <label className="vw-sheet-input vw-span-2">
                    <span>{t(LABEL.name)}</span>
                    <input value={values.name || ''} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={100} />
                  </label>
                  <label className="vw-sheet-input">
                    <span>{t(LABEL.phone)}</span>
                    <input type="tel" value={values.phone || ''} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" maxLength={30} />
                  </label>
                  <label className="vw-sheet-input">
                    <span>{t(LABEL.email)} <em>{t('optional')}</em></span>
                    <input type="email" value={values.email || ''} onChange={(e) => set('email', e.target.value)} autoComplete="email" maxLength={200} />
                  </label>
                  <label className="vw-sheet-input vw-span-2">
                    <span>{t(LABEL.requirement)}</span>
                    <select value={values.requirement ?? spaceOption} onChange={(e) => set('requirement', e.target.value)}>
                      <option value="">{t('Choose one')}</option>
                      {spaceOption && <option value={spaceOption}>{t('This space: {name}', { name: sceneName ?? '' })}</option>}
                      {REQ.map((r) => <option key={r} value={r}>{t(r)}</option>)}
                    </select>
                  </label>
                  <label className="vw-sheet-input vw-span-2">
                    <span>{t(LABEL.dates)} <em>{t('optional')}</em></span>
                    <input value={values.dates || ''} onChange={(e) => set('dates', e.target.value)} placeholder={t('e.g. 12–14 October')} maxLength={100} />
                  </label>
                  <label className="vw-sheet-input vw-span-2">
                    <span>{t(LABEL.message)} <em>{t('optional')}</em></span>
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
                  {status === 'sending' ? t('Sending…') : t('Send enquiry')}
                </button>
                <p className="vw-sheet-fine vw-sheet-center">{t('Name and phone are all we need.')}</p>
              </form>
            )}
          </div>
        </>
      )}
    </>
  );
}
