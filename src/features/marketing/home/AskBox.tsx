'use client';
/** "What do you want to scan?": one line to type, and Send opens the visitor's
 *  email app with it filled in, addressed to the team (no backend, like the
 *  Contact page's sheet). Styles: home.css .hp-ask. */
import { useState } from 'react';
import { COMPANY } from '../siteContent';

export function AskBox() {
  const [text, setText] = useState('');
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    location.href = `mailto:${COMPANY.email}?subject=${encodeURIComponent('A capture enquiry from RCAAS.tech')}&body=${encodeURIComponent(body)}`;
  };
  return (
    <section className="hp-ask" aria-labelledby="hp-ask-title">
      <h2 id="hp-ask-title">What do you want to scan?</h2>
      <p>A lobby, a campus, a temple courtyard, a bridge. Say what it is and where, and we will reply within a working day.</p>
      <form className="hp-ask-form" onSubmit={send}>
        <label className="hp-visually-hidden" htmlFor="hp-ask-input">What do you want to scan?</label>
        <input id="hp-ask-input" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Our hotel's lobby and banquet hall in Thamel" autoComplete="off" maxLength={300} />
        <button type="submit" disabled={!text.trim()}>Write the email</button>
      </form>
      <p className="hp-ask-direct">
        Or call <a href={`tel:${COMPANY.phone.replace(/\s/g, '')}`}>{COMPANY.phone}</a>, or write to{' '}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. {COMPANY.hours}.
      </p>
    </section>
  );
}
