'use client';

import { useEffect, useState } from 'react';
import { getSession, getTeam, makeResetLink, removeTeammate, setTeamRole, type SessionUser } from '../lib/api';

/**
 * The team list, opened from the studio's top bar. Admin-only — the server
 * refuses the requests behind it for anyone else, and the button that opens
 * this is itself hidden from non-admins (studio/page.tsx).
 *
 * Per person: make admin / editor, a one-time password reset link (there's
 * no email service yet: copy it and send it on WhatsApp or by mail), and
 * remove. Removing signs them out everywhere and hands their projects to you.
 */
export function TeamDialog({ onClose }: { onClose: () => void }) {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [team, setTeamList] = useState<SessionUser[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<{ id: string; url: string; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => getTeam().then(setTeamList).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the team.'));
  useEffect(() => { getSession().then((s) => setMe(s?.user ?? null)).catch(() => {}); load(); }, []);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(null);
    }
  };
  const toggle = (u: SessionUser) => act(u.id, async () => { await setTeamRole(u.id, u.role === 'admin' ? 'editor' : 'admin'); load(); });
  const reset = (u: SessionUser) => act(u.id, async () => {
    const r = await makeResetLink(u.id);
    if (r) { setLink({ id: u.id, url: `${location.origin}${r.path}`, expires: r.expires }); setCopied(false); }
  });
  const remove = (u: SessionUser) => {
    if (!confirm(`Remove ${u.name}? They're signed out everywhere at once, and any project they own becomes yours.`)) return;
    act(u.id, async () => { await removeTeammate(u.id); if (link?.id === u.id) setLink(null); load(); });
  };

  return (
    <div className="np-scrim" onClick={onClose}>
      <div className="pl-dialog pl-dialog-wide" role="dialog" aria-modal="true" aria-label="Team" onClick={(e) => e.stopPropagation()}>
        <header className="np-head">
          <h2>Team</h2>
          <button className="np-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="pl-dialog-body">
          <p className="pl-sub">
            Admins see and manage every project; editors only see the ones they own or were added to.
            New accounts start as editors — anyone who has the team access code can create one.
          </p>
          {error && <p className="ed2-warn ed2-fine">{error}</p>}
          {!team && !error && <p className="pl-sub">Loading…</p>}
          {team && (
            <ul className="pl-team-list">
              {team.map((u) => {
                const self = u.id === me?.id;
                return (
                  <li key={u.id} className="pl-team-row">
                    <span className="pl-team-who">
                      {u.name}{self && ' (you)'} <span className="pl-sub">{u.email}</span>
                    </span>
                    <span className={`pl-role-tag is-${u.role}`}>{u.role}</span>
                    <span className="pl-team-acts">
                      <button type="button" className="pl-btn" disabled={busy === u.id || self} onClick={() => toggle(u)}>
                        {u.role === 'admin' ? 'Make editor' : 'Make admin'}
                      </button>
                      <button type="button" className="pl-btn" disabled={busy === u.id} onClick={() => reset(u)}>Reset password</button>
                      {!self && <button type="button" className="pl-btn pl-btn-danger" disabled={busy === u.id} onClick={() => remove(u)}>Remove</button>}
                    </span>
                    {link?.id === u.id && (
                      <span className="pl-reset-link">
                        <span className="pl-sub">Send {u.name} this link. It works once, until {new Date(link.expires).toLocaleString()}; their old sessions end when they use it.</span>
                        <span className="pl-share-form">
                          <input readOnly value={link.url} onFocus={(e) => e.target.select()} />
                          <button type="button" className="pl-btn pl-btn-main" onClick={() => navigator.clipboard?.writeText(link.url).then(() => setCopied(true))}>
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
