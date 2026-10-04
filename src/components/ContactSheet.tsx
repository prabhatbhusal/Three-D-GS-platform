'use client';

import { useState } from 'react';
import { COMPANY } from '../lib/siteContent';

const NEEDS = ['A tour for our website', '360 video', 'Point cloud or drawings'];

/**
 * The Contact page's field sheet: what a crew needs to know before a site
 * visit, on ruled lines. "Write the email" opens the visitor's own email app
 * with the answers filled in: no form backend, nothing stored here.
 */
export function ContactSheet() {
  const [a, setA] = useState({ space: '', where: '', size: '', phone: '' });
  const [needs, setNeeds] = useState<string[]>([]);
  const set = (k: keyof typeof a) => (e: React.ChangeEvent<HTMLInputElement>) => setA((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (n: string) => setNeeds((x) => (x.includes(n) ? x.filter((y) => y !== n) : [...x, n]));

  const line = (label: string, v: string) => `${label}: ${v.trim() || '(not given)'}`;
  const body = [
    line('The space', a.space), line('Where', a.where), line('How big', a.size),
    line('We need', needs.join(', ')), line('Phone', a.phone), '', 'Sent from the RCAAS.tech contact page'
  ].join('\n');
  const subject = `Capture enquiry${a.space.trim() ? `: ${a.space.trim().slice(0, 60)}` : ''}`;
  const href = `mailto:${COMPANY.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <form className="lp-sheet" onSubmit={(e) => { e.preventDefault(); location.href = href; }}>
      <label className="lp-sheet-row">
        <span>The space</span>
        <input value={a.space} onChange={set('space')} placeholder="Hotel floor, banquet hall, courtyard" maxLength={120} />
      </label>
      <label className="lp-sheet-row">
        <span>Where</span>
        <input value={a.where} onChange={set('where')} placeholder="Street and town" maxLength={120} autoComplete="street-address" />
      </label>
      <label className="lp-sheet-row">
        <span>How big</span>
        <input value={a.size} onChange={set('size')} placeholder="Rooms, floors or m². A guess is fine." maxLength={120} />
      </label>
      <div className="lp-sheet-row" role="group" aria-labelledby="lp-sheet-needs-label">
        <span id="lp-sheet-needs-label">You need</span>
        <div className="lp-sheet-needs">
          {NEEDS.map((n) => (
            <label key={n} className="lp-sheet-need">
              <input type="checkbox" checked={needs.includes(n)} onChange={() => toggle(n)} />
              <span>{n}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="lp-sheet-row">
        <span>Your phone</span>
        <input type="tel" value={a.phone} onChange={set('phone')} placeholder="For a call back (optional)" maxLength={40} autoComplete="tel" />
      </label>
      <div className="lp-sheet-send">
        <button type="submit" className="site-btn site-btn-primary site-btn-lg">Write the email</button>
        <p>Opens your email app with these answers filled in, addressed to {COMPANY.email}.</p>
      </div>
    </form>
  );
}
