'use client';

import { useState } from 'react';
import { Icon } from '../../components/ui/Icon';
import { COMPANY } from './siteContent';

const NEEDS = ['a tour for our website', '360 video', 'a point cloud or drawings'];

/**
 * The Contact page's enquiry, written as one sentence with blanks to fill
 * ("We have a … in …, about … big. We need … Call me on …"): what a crew
 * needs to know before a site visit. "Write the email" opens the visitor's
 * own email app with the answers filled in: no form backend, nothing stored
 * here. Styles: inner.css .ip-say.
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
  const blank = (k: keyof typeof a, label: string, placeholder: string, more?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input className="ip-blank" aria-label={label} value={a[k]} onChange={set(k)} placeholder={placeholder} maxLength={120}
      size={Math.max(placeholder.length, a[k].length)} {...more} />
  );

  return (
    <form className="ip-say" onSubmit={(e) => { e.preventDefault(); location.href = href; }}>
      <p className="ip-say-text">
        We have {blank('space', 'The space', 'a hotel floor')} in {blank('where', 'Where', 'street and town', { autoComplete: 'street-address' })},
        about {blank('size', 'How big', 'three floors')} big.
      </p>
      <fieldset className="ip-say-text ip-say-needs">
        <legend>We need</legend>
        {NEEDS.map((n) => (
          <label key={n} className="ip-need">
            <input type="checkbox" checked={needs.includes(n)} onChange={() => toggle(n)} />
            <Icon name="check" className="ip-need-ic" />{n}
          </label>
        ))}
      </fieldset>
      <p className="ip-say-text">
        Call me on {blank('phone', 'Your phone', 'your number', { type: 'tel', autoComplete: 'tel', maxLength: 40 })}.
      </p>
      <div className="ip-say-send">
        <button type="submit" className="site-btn site-btn-primary site-btn-lg">Write the email <Icon name="send" /></button>
        <p>Opens your email app with these answers filled in. A guess is fine for any of them.</p>
      </div>
    </form>
  );
}
