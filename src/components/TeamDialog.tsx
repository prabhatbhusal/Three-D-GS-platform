'use client';

import { useEffect, useState } from 'react';
import { getSession, getTeam, setTeamRole, type SessionUser } from '../lib/api';

/**
 * The team list, opened from the studio's top bar. Admin-only — the server
 * refuses the requests behind it for anyone else, but the button that opens
 * this is itself hidden from non-admins (studio/page.tsx), so nobody but an
 * admin sees an empty or broken list.
 */
export function TeamDialog({ onClose }: { onClose: () => void }) {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [team, setTeamList] = useState<SessionUser[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => getTeam().then(setTeamList).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the team.'));
  useEffect(() => { getSession().then((s) => setMe(s?.user ?? null)).catch(() => {}); load(); }, []);

  const toggle = async (u: SessionUser) => {
    setBusy(u.id);
    setError('');
    try {
      await setTeamRole(u.id, u.role === 'admin' ? 'editor' : 'admin');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change their role. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="np-scrim" onClick={onClose}>
      <div className="pl-dialog" role="dialog" aria-modal="true" aria-label="Team" onClick={(e) => e.stopPropagation()}>
        <header className="np-head">
          <h2>Team</h2>
          <button className="np-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="pl-dialog-body">
          <p className="pl-sub">
            Admins see and manage every project; editors only see the ones they own or were added to.
            New accounts start as editors — anyone who still has the team access code can create one.
          </p>
          {error && <p className="ed2-warn ed2-fine">{error}</p>}
          {!team && !error && <p className="pl-sub">Loading…</p>}
          {team && (
            <ul className="pl-team-list">
              {team.map((u) => (
                <li key={u.id}>
                  <span className="pl-team-who">
                    {u.name} <span className="pl-sub">{u.email}</span>
                  </span>
                  <span className={`pl-role-tag is-${u.role}`}>{u.role}</span>
                  <button
                    type="button" className="pl-btn"
                    disabled={busy === u.id || u.id === me?.id}
                    title={u.id === me?.id ? 'You can’t change your own role' : undefined}
                    onClick={() => toggle(u)}
                  >
                    {busy === u.id ? '…' : u.role === 'admin' ? 'Make editor' : 'Make admin'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
