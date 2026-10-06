'use client';

/** The dialogs a project opens from its card on the projects list and from
 *  its home page: who it's shared with, its branding, its enquiries and its
 *  activity. Owner-only actions are checked again by the server. */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getProperty, addPropertyMember, removePropertyMember, getActivity, getProjectLeads, setProjectLeadEmails, projectLeadsCsvUrl, sendTestEmail,
  setProjectTheme, setProjectInfo, uploadProjectLogo, removeProjectLogo, API_BASE_URL, type ProjectLeads, type ActivityEntry
} from '../../lib/api';
import { BrandInfoFields, infoProblem } from './BrandInfoFields';
import { inkOn, paletteFromImage } from '../../lib/brandColor';
import type { Property } from '../../@types/scene.types';
import type { BrandFont, ProjectInfo, ProjectTheme } from '../../@types/config.types';

/** Add or remove teammates from a project's members (§21: this and the Team
 *  dialog are the whole of "different admins" — ownership at the project
 *  level, not per-space). Opened from a card's ⋯ menu; owner/admin only,
 *  enforced again server-side regardless of who can open this dialog. */
export function ShareDialog({ project, onClose }: { project: Property; onClose: () => void }) {
  const [detail, setDetail] = useState<Property | null>(null);
  const [email, setEmail] = useState('');
  const [as, setAs] = useState<'member' | 'staff'>('member');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState<{ who: string; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => { getProperty(project.id).then(setDetail).catch(() => {}); }, [project.id]);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim();
    if (!clean) return;
    setBusy(true);
    setError('');
    try {
      const r = await addPropertyMember(project.id, clean, as, name.trim());
      setInvite(r?.invite ? { who: name.trim() || clean, link: `${location.origin}${r.invite.path}` } : null);
      setName('');
      setEmail('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add them. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (userId: string) => {
    removePropertyMember(project.id, userId).then(load).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not remove them. Try again.');
    });
  };

  return (
    <div className="np-scrim" onClick={onClose}>
      <div className="pl-dialog" role="dialog" aria-modal="true" aria-label={`Share ${project.title}`} onClick={(e) => e.stopPropagation()}>
        <header className="np-head">
          <h2>Share “{project.title}”</h2>
          <button className="np-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="pl-dialog-body">
          <p className="pl-sub">
            {detail?.ownerName ? <>Owned by <b>{detail.ownerName}</b>.</> : 'No owner set — every teammate can already manage it.'}
            {' '}Add someone below to give them access without making them the owner.
          </p>
          {[...(detail?.memberDetails ?? []).map((u) => ({ ...u, staff: false })), ...(detail?.staffDetails ?? []).map((u) => ({ ...u, staff: true }))].length > 0 && (
            <ul className="pl-share-list">
              {[...(detail?.memberDetails ?? []).map((u) => ({ ...u, staff: false })), ...(detail?.staffDetails ?? []).map((u) => ({ ...u, staff: true }))].map((u) => (
                <li key={u.id}>
                  <span>{u.name} <span className="pl-sub">{u.email}</span> {u.staff && <span className="pl-tag">Staff</span>}</span>
                  <button type="button" onClick={() => remove(u.id)} aria-label={`Remove ${u.name}`}>✕</button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={add} className="pl-share-form">
            <input
              type="email" required placeholder={as === 'staff' ? 'frontdesk@thehotel.com' : 'teammate@geonova.com.np'} value={email}
              onChange={(e) => setEmail(e.target.value)} disabled={busy}
            />
            {as === 'staff' && <input placeholder="Their name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={busy} aria-label="Their name" />}
            <select value={as} onChange={(e) => setAs(e.target.value as 'member' | 'staff')} aria-label="Access" disabled={busy}>
              <option value="member">Full access</option>
              <option value="staff">Client staff</option>
            </select>
            <button className="pl-btn pl-btn-main" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
          </form>
          <p className="pl-sub">
            {as === 'staff'
              ? 'Client staff, such as a restaurant’s host or a hotel’s front desk, see only this project’s enquiries, reservations and monthly report. They can confirm and decline bookings, and can’t change anything else.'
              : 'Full access: they can edit the spaces and the website, but only you can rename, delete or share the project.'}
            {as === 'staff' ? ' New to the studio? They get an account, and you get a link to send them.' : ' They need an account first.'}
          </p>
          {invite && (
            <div className="pl-invite" role="status">
              <p>Send <b>{invite.who}</b> this link to set their password (it works once, for 24 hours):</p>
              <input readOnly value={invite.link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
              <button type="button" className="pl-btn" onClick={() => navigator.clipboard?.writeText(invite.link)}>Copy</button>
            </div>
          )}
          {error && <p className="ed2-warn ed2-fine">{error}</p>}
        </div>
      </div>
    </div>
  );
}

const FONT_FACES: Record<BrandFont, [string, string]> = {
  serif: ['Serif', "Georgia, 'Times New Roman', serif"],
  sans: ['Modern sans', "system-ui, 'Segoe UI', Roboto, sans-serif"],
  classic: ['Classic', "'Palatino Linotype', 'Book Antiqua', Palatino, serif"]
};

/** The project's name, colour, font and logo on its tours. Saves as you go:
 *  published tours pick it up at once (it isn't part of a publish). */
export function BrandingDialog({ project, onClose }: { project: Property; onClose: () => void }) {
  const [theme, setTheme] = useState<ProjectTheme>(project.theme ?? {});
  const [brand, setBrand] = useState(project.theme?.brand ?? '');
  const [info, setInfo] = useState<ProjectInfo>(project.info ?? {});
  const [savedInfo, setSavedInfo] = useState<ProjectInfo>(project.info ?? {});
  const [infoNote, setInfoNote] = useState('');
  // The logo's colours, as swatches. Just after a new logo, if the colour is
  // still the default, its main colour becomes the brand colour.
  const [logoColours, setLogoColours] = useState<string[]>([]);
  const [colourNote, setColourNote] = useState('');
  const newLogo = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const accent = theme.accent ?? '#b08d57';
  const font = theme.font ?? 'serif';
  const logoUrl = theme.logo ? `${API_BASE_URL}/api/assets/${theme.logo}` : null;
  useEffect(() => {
    if (!logoUrl) { setLogoColours([]); return; }
    let live = true;
    fetch(logoUrl).then((r) => r.blob()).then(paletteFromImage).then((p) => {
      if (!live) return;
      setLogoColours(p.colours);
      const fresh = newLogo.current;
      newLogo.current = false;
      if (!p.accent) setColourNote(fresh ? 'Your logo is black and white: pick a brand colour.' : '');
      else if (fresh && !theme.accent) {
        setColourNote('Brand colour taken from your logo.');
        run(() => setProjectTheme(project.id, { accent: p.accent! }));
      }
    }).catch(() => { if (live) setLogoColours([]); });
    return () => { live = false; };
  }, [logoUrl]); // eslint-disable-line react-hooks/exhaustive-deps -- once per logo

  const run = async (fn: () => Promise<Property | null>) => {
    setBusy(true);
    setError('');
    try {
      const p = await fn();
      if (p) setTheme(p.theme ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="np-scrim" onClick={onClose}>
      <div className="pl-dialog pl-dialog-wide" role="dialog" aria-modal="true" aria-label={`Branding for ${project.title}`} onClick={(e) => e.stopPropagation()}>
        <header className="np-head">
          <h2>Branding</h2>
          <button className="np-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="pl-dialog-body">
          <p className="pl-sub">How “{project.title}” looks on its tours. Changes go live on every published tour at once.</p>

          <div className="pl-brand-preview" style={{ '--acc': accent, '--acc-ink': inkOn(accent), '--face': FONT_FACES[font][1] } as React.CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl && <img src={logoUrl} alt="" />}
            <span className="pl-brand-name">{brand || project.title}</span>
            <span className="pl-brand-place">Reception</span>
            <span className="pl-brand-pill">Start virtual tour</span>
          </div>

          <label className="pl-field">
            <span>Name shown on the tour</span>
            <span className="pl-share-form">
              <input value={brand} maxLength={80} placeholder={project.title} onChange={(e) => setBrand(e.target.value)} />
              <button className="pl-btn pl-btn-main" disabled={busy || brand === (theme.brand ?? '')} onClick={() => run(() => setProjectTheme(project.id, { brand }))}>Save</button>
            </span>
          </label>

          <div className="pl-brand-row">
            <label className="pl-field">
              <span>Accent colour</span>
              <span className="pl-share-form">
                <input type="color" value={accent} disabled={busy} onChange={(e) => run(() => setProjectTheme(project.id, { accent: e.target.value }))} />
                {theme.accent && <button className="pl-btn" disabled={busy} onClick={() => run(() => setProjectTheme(project.id, { accent: null }))}>Default</button>}
              </span>
            </label>
            <label className="pl-field">
              <span>Heading font</span>
              <select className="pl-select" value={font} disabled={busy} onChange={(e) => run(() => setProjectTheme(project.id, { font: e.target.value as BrandFont }))}>
                {(Object.keys(FONT_FACES) as BrandFont[]).map((f) => <option key={f} value={f}>{FONT_FACES[f][0]}</option>)}
              </select>
            </label>
          </div>
          {logoColours.length > 0 && (
            <div className="np-swatches" role="group" aria-label="Colours in your logo">
              <small>From your logo</small>
              {logoColours.map((c) => (
                <button key={c} type="button" className={`np-swatch${c === accent ? ' is-on' : ''}`} style={{ background: c }}
                  disabled={busy} aria-label={`Use ${c}`} aria-pressed={c === accent} title={c}
                  onClick={() => { setColourNote(''); run(() => setProjectTheme(project.id, { accent: c })); }} />
              ))}
            </div>
          )}
          {colourNote && <p className="pl-sub">{colourNote}</p>}

          <div className="pl-field">
            <span>Logo</span>
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { newLogo.current = true; run(() => uploadProjectLogo(project.id, f)); } }} />
            <span className="pl-share-form">
              <button className="pl-btn" disabled={busy} onClick={() => fileRef.current?.click()}>{logoUrl ? 'Replace logo…' : 'Upload logo…'}</button>
              {logoUrl && <button className="pl-btn pl-btn-danger" disabled={busy} onClick={() => run(() => removeProjectLogo(project.id))}>Remove</button>}
            </span>
            <span className="pl-sub">A PNG with a transparent background works best on the dark tour. 2 MB at most.</span>
          </div>

          <div className="pl-field">
            <span>Brand information</span>
            <span className="pl-sub">Shown on the project’s website: how guests reach you, and a word about you. Leave a field empty to hide it.</span>
            <BrandInfoFields value={info} onChange={(v) => { setInfo(v); setInfoNote(''); }} className="pl-field" />
            <span className="pl-share-form">
              <button className="pl-btn pl-btn-main" disabled={busy || JSON.stringify(info) === JSON.stringify(savedInfo)} onClick={async () => {
                const problem = infoProblem(info);
                if (problem) { setError(problem); return; }
                setBusy(true); setError('');
                try {
                  const p = await setProjectInfo(project.id, info);
                  if (p) { setInfo(p.info ?? {}); setSavedInfo(p.info ?? {}); setInfoNote('Saved.'); }
                } catch (e) { setError(e instanceof Error ? e.message : 'That didn’t save. Try again.'); } finally { setBusy(false); }
              }}>Save brand information</button>
              {infoNote && <span className="pl-sub">{infoNote}</span>}
            </span>
          </div>
          {error && <p className="ed2-warn ed2-fine">{error}</p>}
        </div>
      </div>
    </div>
  );
}

/** A project's enquiries: the list, a CSV for Excel, and (owner/admin) who
 *  new ones are emailed to (server/src/mailer.js). */
export function EnquiriesDialog({ project, canEdit, onClose }: { project: Property; canEdit: boolean; onClose: () => void }) {
  const [data, setData] = useState<ProjectLeads | null>(null);
  const [emails, setEmails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    getProjectLeads(project.id)
      .then((d) => { setData(d); setEmails(d?.emails.join(', ') ?? ''); })
      .catch((e: Error) => setError(e.message));
  }, [project.id]);
  const saveEmails = async () => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const r = await setProjectLeadEmails(project.id, emails.split(/[\s,;]+/).filter(Boolean));
      setEmails(r?.emails.join(', ') ?? '');
      setData((d) => (d && r ? { ...d, emails: r.emails } : d));
      setNote('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  // A test send says at once whether email works, and why not (Resend's own reason).
  const testEmail = async () => {
    setBusy(true); setError(''); setNote('');
    try {
      const r = await sendTestEmail(project.id);
      setNote(`Sent a test to ${r?.to.join(', ')}. If it isn’t there in a minute, look in spam.`);
    } catch (e) {
      setError(`The test wasn’t sent. ${e instanceof Error ? e.message : ''}`);
    } finally {
      setBusy(false);
    }
  };
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="np-scrim" onClick={onClose}>
      <div className="pl-dialog pl-dialog-wide" role="dialog" aria-modal="true" aria-label={`Enquiries for ${project.title}`} onClick={(e) => e.stopPropagation()}>
        <header className="np-head">
          <h2>Enquiries</h2>
          <button className="np-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="pl-dialog-body">
          {error && <p className="ed2-warn ed2-fine">{error}</p>}
          {!data && !error && <p className="pl-sub">Loading…</p>}
          {data && (
            <>
              <div className="pl-leads-head">
                <p className="pl-sub">
                  {data.leads.length ? `${data.leads.length} from “${project.title}”, newest first.` : `No enquiries from “${project.title}” yet.`}
                </p>
                {!!data.leads.length && (
                  // a plain download: the browser sends the studio's cookie with it
                  <a className="pl-btn pl-btn-main" href={projectLeadsCsvUrl(project.id)} download>Download for Excel</a>
                )}
              </div>
              {!!data.leads.length && (
                <ol className="pl-leads">
                  {data.leads.map((l) => (
                    <li key={l.id}>
                      <div className="pl-lead-top">
                        <b>{l.name}</b>
                        <a href={`tel:${l.phone}`}>{l.phone}</a>
                        {l.email && <a href={`mailto:${l.email}`}>{l.email}</a>}
                        <time className="pl-log-when" dateTime={l.createdAt}>{when(l.createdAt)}</time>
                      </div>
                      <div className="pl-sub">
                        {[l.sceneName, l.requirement, l.dates, l.hotspotLabel && `was looking at ${l.hotspotLabel}`].filter(Boolean).join(' · ')}
                      </div>
                      {l.message && <p className="pl-lead-msg">{l.message}</p>}
                      {l.delivery && !l.delivery.sent && <p className="ed2-warn ed2-fine">Not emailed: {l.delivery.reason}</p>}
                    </li>
                  ))}
                </ol>
              )}

              <div className="pl-field">
                <span>Email new enquiries to</span>
                {!data.emailOn && (
                  <span className="pl-sub">Email is off on this server: add RESEND_API_KEY to server/.env (free at resend.com). Enquiries are still saved here either way.</span>
                )}
                <span className="pl-share-form">
                  <input value={emails} disabled={!canEdit || busy} placeholder="sales@hotel.com, frontdesk@hotel.com" onChange={(e) => setEmails(e.target.value)} />
                  {canEdit && <button className="pl-btn pl-btn-main" disabled={busy || emails === data.emails.join(', ')} onClick={saveEmails}>Save</button>}
                  {data.emailOn && <button className="pl-btn" disabled={busy || emails !== data.emails.join(', ')} onClick={testEmail}
                    title={emails !== data.emails.join(', ') ? 'Save the addresses first' : 'Send a test email to these addresses'}>Send a test</button>}
                </span>
                {!canEdit && <span className="pl-sub">Only the project’s owner or an admin can change this.</span>}
                {note && <span className="pl-sub">{note}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Who did what in this project, newest first (server/src/activity.js). */
export function ActivityDialog({ project, onClose }: { project: Property; onClose: () => void }) {
  const [log, setLog] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getActivity(project.id).then((l) => setLog(l ?? [])).catch((e: Error) => setError(e.message));
  }, [project.id]);
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="np-scrim" onClick={onClose}>
      <div className="pl-dialog pl-dialog-wide" role="dialog" aria-modal="true" aria-label={`Activity in ${project.title}`} onClick={(e) => e.stopPropagation()}>
        <header className="np-head">
          <h2>Activity</h2>
          <button className="np-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="pl-dialog-body">
          <p className="pl-sub">Everything done in “{project.title}” since this log began, newest first.</p>
          {error && <p className="ed2-warn ed2-fine">{error}</p>}
          {!log && !error && <p className="pl-sub">Loading…</p>}
          {log && !log.length && <p className="pl-sub">Nothing recorded yet. Saves, publishes, shares and floor plans show up here.</p>}
          {!!log?.length && (
            <ol className="pl-log">
              {log.map((e, i) => (
                <li key={i}>
                  <span className="pl-log-what"><b>{e.who.name}</b> {e.action} <b>{e.target}</b>{e.detail && <span className="pl-sub"> · {e.detail}</span>}</span>
                  <time className="pl-log-when" dateTime={e.at}>{when(e.at)}</time>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
