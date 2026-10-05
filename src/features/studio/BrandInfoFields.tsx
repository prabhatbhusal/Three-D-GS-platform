'use client';

import type { ProjectInfo } from '../../@types/config.types';

/** The brand information fields (server/src/store.js setPropertyInfo), for the
 *  New project dialog and the project's Branding. Its website shows them. */
const FIELDS: [keyof ProjectInfo, string, string, number, ('text' | 'email' | 'tel' | 'url' | 'area')][] = [
  ['tagline', 'Tagline', 'Boutique rooms in the heart of Patan', 120, 'text'],
  ['about', 'About the brand', 'A few lines about the place, its story and what makes it special.', 1200, 'area'],
  ['phone', 'Phone', '+977 1 5550000', 40, 'tel'],
  ['whatsapp', 'WhatsApp', '+977 98XXXXXXXX: adds Chat on WhatsApp to the tour', 40, 'tel'],
  ['email', 'Email', 'hello@example.com', 200, 'email'],
  ['website', 'Website', 'example.com', 300, 'url'],
  ['address', 'Address', 'Mangal Bazar, Lalitpur', 300, 'text'],
  ['instagram', 'Instagram', 'instagram.com/yourbrand', 300, 'url'],
  ['facebook', 'Facebook', 'facebook.com/yourbrand', 300, 'url']
];

/** A quick check before the server's own, so a typo is caught where it's typed. */
export function infoProblem(info: ProjectInfo): string {
  if (info.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email)) return 'That email address doesn’t look right.';
  for (const k of ['website', 'instagram', 'facebook'] as const) {
    const v = info[k]?.trim();
    if (v && !/^(https?:\/\/)?[^\s/]+\.[^\s]+$/i.test(v)) return `The ${k} link must be a web address, like example.com.`;
  }
  return '';
}

export function BrandInfoFields({ value, onChange, className = 'np-field' }: {
  value: ProjectInfo; onChange: (v: ProjectInfo) => void; className?: string;
}) {
  return (
    <div className="brand-info">
      {FIELDS.map(([k, label, hint, max, kind]) => (
        <label key={k} className={`${className}${kind === 'area' ? ' brand-info-wide' : ''}`}>
          <span>{label}</span>
          {kind === 'area'
            ? <textarea rows={3} value={value[k] ?? ''} maxLength={max} placeholder={hint} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
            : <input type={kind === 'url' ? 'text' : kind} value={value[k] ?? ''} maxLength={max} placeholder={hint}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })} />}
        </label>
      ))}
    </div>
  );
}
