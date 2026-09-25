'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession, login, resetPasswordWith, signup } from '../lib/api';

type Mode = 'signin' | 'signup';

/** Only same-site paths — never an absolute or protocol-relative URL, which
 *  would turn ?next= into an open redirect. */
function safeNext(v: string | null): string {
  return v && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') ? v : '/studio';
}

/** Reads ?mode= and ?next= itself via useSearchParams() rather than as a
 *  server-passed prop: the static export build (next.config.ts,
 *  NEXT_OUTPUT_EXPORT) can't read the request's query string at build time,
 *  and this is the client-side, hydrate-after-the-fact equivalent (see the
 *  Suspense boundary in app/login/page.tsx, which useSearchParams requires). */
export function AuthPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode: Mode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  const next = safeNext(searchParams.get('next'));
  // ?reset=<token>: an admin's one-time link (Team dialog) — set a new password
  const resetToken = searchParams.get('reset');
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Already signed in: skip the form.
  useEffect(() => {
    if (resetToken) return; // a reset link works whoever is signed in on this browser
    getSession().then((s) => { if (s?.authenticated) router.replace(next); }).catch(() => {});
  }, [router, next, resetToken]);

  const switchTo = (m: Mode) => { setMode(m); setError(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') await signup({ name, email, password, accessCode });
      else await login(password, email);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  if (resetToken) return <ResetPanel token={resetToken} />;

  const isSignup = mode === 'signup';

  return (
    <div className="auth-card">
      <h1 className="auth-title">{isSignup ? <>Create your <em>studio</em> account</> : <>Welcome <em>back</em></>}</h1>
      <p className="auth-sub">
        {isSignup
          ? 'For the capture and authoring team. You need the team access code from your studio lead.'
          : 'Sign in to upload captures and author tours.'}
      </p>

      <div className="auth-switch" role="tablist" aria-label="Account">
        <button type="button" role="tab" aria-selected={!isSignup} className={!isSignup ? 'on' : ''} onClick={() => switchTo('signin')}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={isSignup} className={isSignup ? 'on' : ''} onClick={() => switchTo('signup')}>
          Create account
        </button>
        <span className="auth-switch-pill" data-side={isSignup ? 'right' : 'left'} aria-hidden />
      </div>

      <form className="auth-form" onSubmit={submit}>
        {isSignup && (
          <label className="auth-field">
            <span>Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} placeholder="Your name" />
          </label>
        )}
        <label className="auth-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="you@company.com" />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <span className="auth-pw">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              minLength={isSignup ? 8 : undefined}
              placeholder={isSignup ? 'At least 8 characters' : 'Your password'}
            />
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>
              {showPw ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
        {isSignup && (
          <label className="auth-field">
            <span>Team access code</span>
            <input type="password" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} autoComplete="off" required placeholder="From your studio lead" />
          </label>
        )}

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" className="site-btn site-btn-primary site-btn-lg auth-submit" disabled={busy}>
          {busy ? (isSignup ? 'Creating account…' : 'Signing in…') : isSignup ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="auth-foot">
        {isSignup ? 'Already have an account? ' : 'New to the team? '}
        <button type="button" className="auth-link" onClick={() => switchTo(isSignup ? 'signin' : 'signup')}>
          {isSignup ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </div>
  );
}

/** Set a new password from an admin's one-time reset link, then open the
 *  studio signed in with it. The link works once and for a day. */
function ResetPanel({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== again) { setError('The two passwords don’t match.'); return; }
    setBusy(true);
    setError('');
    try {
      await resetPasswordWith(token, password);
      router.replace('/studio');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="auth-card">
      <h1 className="auth-title">Set a <em>new</em> password</h1>
      <p className="auth-sub">Your admin sent you this link. Choose a new password; you&apos;ll be signed in with it, and signed out everywhere else.</p>
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-field">
          <span>New password</span>
          <span className="auth-pw">
            <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" />
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>{showPw ? 'Hide' : 'Show'}</button>
          </span>
        </label>
        <label className="auth-field">
          <span>Type it again</span>
          <input type={showPw ? 'text' : 'password'} value={again} onChange={(e) => setAgain(e.target.value)}
            autoComplete="new-password" required minLength={8} />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="site-btn site-btn-primary site-btn-lg auth-submit" disabled={busy}>
          {busy ? 'Saving…' : 'Set password and sign in'}
        </button>
      </form>
    </div>
  );
}
