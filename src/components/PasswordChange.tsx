'use client';
/** "Change password" in the account drawer's Settings, in the site nav and the
 *  studio. `cls` is the drawer's class prefix (site.css / editor.css `-pw`). */
import { useState } from 'react';
import { changePassword } from '../lib/api';

export function PasswordChange({ cls, email }: { cls: 'site' | 'ed2'; email: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [state, setState] = useState<{ busy?: boolean; done?: boolean; error?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ busy: true });
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setState({ done: true });
    } catch (err) {
      setState({ error: err instanceof Error ? err.message : 'The password wasn’t changed. Try again.' });
    }
  };

  return (
    <form className={`${cls}-pw`} onSubmit={submit}>
      <h4>Change password</h4>
      {/* lets password managers file the new password under the right account */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <label>
        <span>Current password</span>
        <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>
        <span>New password</span>
        <input type="password" autoComplete="new-password" required minLength={8} maxLength={200} value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <button type="submit" disabled={state.busy}>{state.busy ? 'Changing…' : 'Change password'}</button>
      <p role="status" className={state.error ? 'is-error' : undefined}>
        {state.done ? 'Password changed. Any other device signed in to this account is now signed out.' : state.error}
      </p>
    </form>
  );
}
