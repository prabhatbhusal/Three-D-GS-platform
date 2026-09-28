'use client';

import { useState } from 'react';
import { joinWaitlist, type WaitFor, type WaitRequest } from '../lib/api';

/**
 * Join the waitlist (server/src/waitlist.js): shown by TableBooking and
 * RoomBooking when what the guest wants is all taken. A name and a phone;
 * if a table or room is let go, they're told by text (and email, if given)
 * with a link back to book. Nothing is held for them.
 */
export function WaitlistForm({ project, what, request, preview = false }: {
  project: string;
  /** What they'd wait for, in words: "a table for 2 on Tue 29 Sep". */
  what: string;
  request: WaitFor;
  preview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', website: '' });
  const [renderedAt] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (done) return <p className="tb-wait-done" role="status">You’re on the waitlist for {what}. If a place opens up, we’ll text you{form.email ? ' and email you' : ''} a link to book it.</p>;
  if (!open) {
    return (
      <div className="tb-wait">
        <p className="tb-dim">All taken for {what}.</p>
        <button type="button" className="tb-ghost" onClick={() => setOpen(true)}>Join the waitlist</button>
      </div>
    );
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) return;
    if (!form.name.trim() || !form.phone.trim()) return setError('Add your name and phone, so we can tell you.');
    setSending(true);
    setError('');
    try {
      await joinWaitlist(project, { ...request, ...form, formRenderedAt: renderedAt } as WaitRequest);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };
  return (
    <form className="tb-details tb-wait" onSubmit={submit} noValidate>
      <p className="tb-dim">We’ll text you if a place opens up for {what}. Nothing is held for you until you book.</p>
      <div className="tb-row">
        <label><span>Name</span><input value={form.name} maxLength={100} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label><span>Phone</span><input type="tel" value={form.phone} maxLength={30} autoComplete="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
      </div>
      <label><span>Email <em>optional</em></span><input type="email" value={form.email} maxLength={200} autoComplete="email" onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      {/* honeypot: hidden from people, filled by bots */}
      <label className="tb-hp" aria-hidden="true"><span>Leave empty</span><input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
      {error && <p className="tb-err" role="alert">{error}</p>}
      <button className="tb-go" type="submit" disabled={sending || preview}>
        {preview ? 'Preview: the waitlist opens once you publish' : sending ? 'Sending…' : 'Put me on the waitlist'}
      </button>
    </form>
  );
}
