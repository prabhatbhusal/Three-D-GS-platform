'use client';

import { use, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  approveSiteReview, getSiteReview, postReviewComment, setReviewKey, type PublicSite, type ReviewApproval, type ReviewComment
} from '../../../../lib/api';
import { SiteView } from '../../../../features/website/SiteView';
import './review.css';

const NAME_KEY = 'rcaas.reviewer';
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

type Draft = { sec: number; x: number; y: number; where: string };

/**
 * The client's review of a website draft (/s/<project>/review?key=…), from
 * the link the studio shares: the draft as visitors will see it, with
 * comment pins. "Comment" then a click anywhere pins a note to that spot
 * (its section, and where in it, so pins stay put as the page reflows);
 * "Approve this draft" signs it off. No account: the link's key is the pass.
 * Bookings and enquiries don't send from here.
 */
export default function ReviewPage({ params }: { params: Promise<{ property: string }> }) {
  const { property: id } = use(params);
  const [key, setKey] = useState('');
  const [data, setData] = useState<(PublicSite & { review: { comments: ReviewComment[]; approval: ReviewApproval | null; approvedThisDraft: boolean } }) | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const k = new URLSearchParams(location.search).get('key') ?? '';
    setKey(k);
    setReviewKey(k); // the draft's table and room booking read their times with it
    getSiteReview(id, k).then(setData).catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p className="rv-note">{error}</p>;
  if (!data) return <p className="rv-note">Loading the draft…</p>;
  return <Review id={id} reviewKey={key} data={data} />;
}

function Review({ id, reviewKey, data }: {
  id: string; reviewKey: string;
  data: PublicSite & { review: { comments: ReviewComment[]; approval: ReviewApproval | null; approvedThisDraft: boolean } };
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [comments, setComments] = useState(data.review.comments);
  const [approval, setApproval] = useState(data.review.approvedThisDraft ? data.review.approval : null);
  const [mode, setMode] = useState<'look' | 'comment'>('look');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, reflow] = useReducer((n: number) => n + 1, 0);
  const brand = data.project.theme.brand || data.project.title;

  useEffect(() => { try { setName(localStorage.getItem(NAME_KEY) ?? ''); } catch { /* private mode */ } }, []);
  // Pins sit where their section is now: redraw as the page settles and resizes.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(reflow);
    ro.observe(el);
    const t = setInterval(reflow, 1500); // images and reveals settle for a while
    return () => { ro.disconnect(); clearInterval(t); };
  }, []);

  const sections = () => [...(wrap.current?.querySelector('.ws')?.children ?? [])] as HTMLElement[];
  const place = useCallback((c: { sec: number; x: number; y: number }) => {
    const box = wrap.current?.getBoundingClientRect();
    const all = sections();
    const el = all[c.sec] ?? all[all.length - 1];
    if (!box || !el) return null;
    const r = el.getBoundingClientRect();
    return { left: c.x * box.width, top: r.top - box.top + c.y * r.height };
  }, []);

  // Comment mode: a click anywhere on the page pins a note there, and does nothing else.
  const onClickCapture = (e: React.MouseEvent) => {
    if (mode !== 'comment' || (e.target as HTMLElement).closest('.rv-ui')) return;
    e.preventDefault();
    e.stopPropagation();
    const el = (e.target as HTMLElement).closest('.ws > *') as HTMLElement | null;
    const box = wrap.current!.getBoundingClientRect();
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDraft({
      sec: sections().indexOf(el), x: (e.clientX - box.left) / box.width, y: (e.clientY - r.top) / r.height,
      where: el.querySelector('h1, h2')?.textContent?.trim().slice(0, 80) ?? ''
    });
    setError('');
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!name.trim() || !text.trim()) return setError('Add your name and a comment.');
    setBusy(true);
    try {
      const c = await postReviewComment(id, reviewKey, { ...draft, name: name.trim(), text: text.trim() });
      if (c) setComments((l) => [...l, c]);
      try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* private mode */ }
      setDraft(null);
      setText('');
      setMode('look');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  const approve = async () => {
    const who = name.trim() || window.prompt('Your name, to sign it off:')?.trim();
    if (!who) return;
    setBusy(true);
    try {
      const a = await approveSiteReview(id, reviewKey, who);
      if (a) setApproval(a);
      setName(who);
      try { localStorage.setItem(NAME_KEY, who); } catch { /* private mode */ }
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  const draftAt = draft && place(draft);
  const open1 = comments.filter((c) => !c.resolved).length;
  return (
    <div className={`rv${mode === 'comment' ? ' is-commenting' : ''}`} ref={wrap} onClickCapture={onClickCapture}>
      <SiteView data={data} preview review />

      <div className="rv-pins" aria-label="Comments">
        {comments.map((c, i) => {
          const at = place(c);
          if (!at) return null;
          return (
            <div key={c.id} className={`rv-pin rv-ui${c.resolved ? ' is-resolved' : ''}${open === c.id ? ' is-open' : ''}`} style={{ left: at.left, top: at.top }}>
              <button type="button" aria-label={`Comment ${i + 1} from ${c.name}`} onClick={() => setOpen(open === c.id ? '' : c.id)}>{i + 1}</button>
              {open === c.id && (
                <div className="rv-bubble">
                  <b>{c.name}</b> <small>{when(c.at)}{c.resolved ? ' · resolved' : ''}</small>
                  <p>{c.text}</p>
                </div>
              )}
            </div>
          );
        })}
        {draft && draftAt && (
          <form className="rv-pin rv-ui is-new" style={{ left: draftAt.left, top: draftAt.top }} onSubmit={send}>
            <span aria-hidden>+</span>
            <div className="rv-bubble">
              {!name && <input placeholder="Your name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}
              <textarea autoFocus rows={3} placeholder="What should change here?" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
              {error && <p className="rv-err">{error}</p>}
              <div className="rv-row">
                <button type="button" onClick={() => { setDraft(null); setError(''); }}>Cancel</button>
                <button type="submit" className="rv-main" disabled={busy}>{busy ? 'Sending…' : 'Comment'}</button>
              </div>
            </div>
          </form>
        )}
      </div>

      <div className="rv-bar rv-ui" role="region" aria-label="Review">
        <span className="rv-title"><b>Review</b> the draft website of {brand}
          <small>{open1 ? `${open1} open comment${open1 === 1 ? '' : 's'}` : 'No open comments'} · nothing here is public yet</small>
        </span>
        <button type="button" className={mode === 'comment' ? 'rv-main' : ''} aria-pressed={mode === 'comment'}
          onClick={() => { setMode(mode === 'comment' ? 'look' : 'comment'); setDraft(null); }}>
          {mode === 'comment' ? 'Click the page where it should change…' : 'Comment'}
        </button>
        {approval
          ? <span className="rv-approved">✓ Approved by {approval.name}, {when(approval.at)}</span>
          : <button type="button" className="rv-main" onClick={approve} disabled={busy}>Approve this draft</button>}
        {error && !draft && <span className="rv-err">{error}</span>}
      </div>
    </div>
  );
}
