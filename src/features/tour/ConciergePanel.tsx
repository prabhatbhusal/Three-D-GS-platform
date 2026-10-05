'use client';

import { useEffect, useRef, useState } from 'react';
import { askConcierge, type ConciergeShow } from '../../lib/api';
import { useT } from '../../lib/i18n';

type Turn = { role: 'user' | 'assistant'; text: string; show?: ConciergeShow | null };

/**
 * The AI concierge (server/src/routes/concierge.js), over the tour: a
 * visitor's questions about the place, answered from what the project has
 * published, in their language. When an answer is about a place in the
 * tour, the tour goes there (`onShow`), and the answer offers to go again.
 * The conversation lasts as long as the panel's page.
 */
export function ConciergePanel({ project, space, venue, onShow, onClose }: {
  project: string; space: string; venue: string;
  onShow: (show: ConciergeShow) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [turns, busy]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion('');
    setError('');
    setTurns((l) => [...l, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const history = turns.slice(-6).map(({ role, text }) => ({ role, text }));
      const r = await askConcierge(project, { question: q, history, space, lang: t.lang });
      if (!r) throw new Error(t('The concierge couldn’t answer. Try again.'));
      setTurns((l) => [...l, { role: 'assistant', text: r.answer, show: r.show }]);
      if (r.show) onShow(r.show);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="vw-sheet-scrim vw-sheet-scrim-light" onClick={onClose} />
      <div className="vw-sheet vw-concierge" role="dialog" aria-label={t('Ask the concierge')}>
        <button className="vw-sheet-x" onClick={onClose} aria-label={t('Close')}>✕</button>
        <h2>{t('Ask the concierge')}</h2>
        <p className="vw-sheet-sub">{t('Anything about {venue}: rooms, food, where things are.', { venue })}</p>
        <div className="vw-chat" ref={list} aria-live="polite">
          {!turns.length && (
            <div className="vw-chat-starters">
              {[t('What’s on the menu?'), t('Where is the pool?'), t('How do I book?')].map((s) => (
                <button key={s} type="button" onClick={() => setQuestion(s)}>{s}</button>
              ))}
            </div>
          )}
          {turns.map((m, i) => (
            <div key={i} className={`vw-chat-msg is-${m.role}`}>
              <p>{m.text}</p>
              {m.show && <button type="button" className="vw-sheet-link" onClick={() => onShow(m.show!)}>{t('Show me')} →</button>}
            </div>
          ))}
          {busy && <div className="vw-chat-msg is-assistant is-typing" aria-label={t('Thinking…')}><span /><span /><span /></div>}
        </div>
        {error && <p className="vw-sheet-err">{error}</p>}
        <form className="vw-chat-ask" onSubmit={ask}>
          <input value={question} maxLength={500} placeholder={t('Type your question…')} aria-label={t('Your question')}
            onChange={(e) => setQuestion(e.target.value)} />
          <button type="submit" className="vw-sheet-go" disabled={busy || !question.trim()}>{t('Ask')}</button>
        </form>
        <p className="vw-sheet-fine vw-sheet-center">{t('Answers come from this place’s own information and can be wrong. For bookings, use the booking buttons.')}</p>
      </div>
    </>
  );
}
