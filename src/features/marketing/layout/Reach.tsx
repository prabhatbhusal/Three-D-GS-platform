'use client';
/** How to reach the team, as icons (siteContent.ts REACH): each is a round
 *  link whose number or address shows on hover and focus, and is its
 *  accessible name. OpenNow says whether the office is open, in Kathmandu
 *  time. Used by the nav, ContactBand, Footer and the Contact page. Styles:
 *  inner.css .reach, .open-now. */
import { useEffect, useState } from 'react';
import { Icon } from '../../../components/ui/Icon';
import { REACH } from '../siteContent';

export function ReachIcons({ only, className }: { only?: string[]; className?: string }) {
  return (
    <ul className={className ? `reach ${className}` : 'reach'} aria-label="Reach the team">
      {REACH.filter((r) => !only || only.includes(r.label)).map((r) => (
        <li key={r.label}>
          <a href={r.href} data-tip={r.detail} aria-label={`${r.label}: ${r.detail}`} data-cursor="link"
            {...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            <Icon name={r.ic} />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Sunday to Friday, 10:00 to 17:30, Kathmandu (COMPANY.hours). */
export function openNowText(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const mins = Number(parts.hour) * 60 + Number(parts.minute);
  const day = parts.weekday;
  if (day !== 'Sat' && mins >= 600 && mins < 1050) return { open: true, text: 'Open now, until 17:30 Kathmandu time' };
  const next = day === 'Sat' || (day === 'Fri' && mins >= 1050) ? 'Sunday' : mins < 600 ? 'today' : 'tomorrow';
  return { open: false, text: `Closed now. Opens ${next} at 10:00 Kathmandu time` };
}

export function OpenNow() {
  const [s, setS] = useState<ReturnType<typeof openNowText> | null>(null);
  useEffect(() => {
    const tick = () => setS(openNowText(new Date()));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  // Rendered after mount only: the server doesn't know the visitor's clock.
  return <p className="open-now" data-open={s?.open ? '' : undefined} aria-live="polite">{s?.text ?? ' '}</p>;
}
