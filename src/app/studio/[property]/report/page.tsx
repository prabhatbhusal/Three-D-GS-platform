'use client';

import { use, useEffect, useState } from 'react';
import { API_BASE_URL, getProjectReport, type ProjectReport } from '../../../../lib/api';
import { useStudioSession } from '../../../../lib/useStudioSession';
import './report.css';

const thisMonth = () => new Date().toISOString().slice(0, 7); // the server counts in UTC months too

function duration(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/**
 * The monthly client report: visits and time per space from the public tour,
 * enquiries from the form. Made to be printed — "Save as PDF" is the
 * browser's own print dialog, with the controls hidden by @media print.
 */
export default function ReportPage({ params }: { params: Promise<{ property: string }> }) {
  const { property: id } = use(params);
  const ok = useStudioSession(`/studio/${id}/report`);
  const [month, setMonth] = useState(thisMonth);
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ok || !/^\d{4}-\d{2}$/.test(month)) return;
    setError('');
    getProjectReport(id, month).then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load the report.'));
  }, [ok, id, month]);

  if (!ok) return <div className="rp-note">Opening the report…</div>;
  if (error) return <div className="rp-note">{error}</div>;
  if (!report) return <div className="rp-note">Counting…</div>;

  const { project, days } = report;
  const [y, m] = month.split('-').map(Number);
  const dayCount = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const perDay = Array.from({ length: dayCount }, (_, i) => days[`${month}-${String(i + 1).padStart(2, '0')}`] ?? 0);
  const peak = Math.max(1, ...perDay);
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const style = { '--rp-accent': project.theme.accent || '#1d1d1f' } as React.CSSProperties;

  return (
    <div className="rp" style={style}>
      <div className="rp-controls">
        {/* plain <a>: the studio needs a full page load (§12) */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/studio">← Projects</a>
        <label>Month <input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} /></label>
        <button onClick={() => window.print()}>Save as PDF</button>
      </div>

      <article className="rp-page">
        <header className="rp-head">
          {/* eslint-disable-next-line @next/next/no-img-element -- a client's logo from the API, printed as-is */}
          {project.theme.logo && <img src={`${API_BASE_URL}/api/assets/${project.theme.logo}`} alt="" />}
          <div>
            <h1>{project.theme.brand || project.title}</h1>
            <p>Virtual tour report · {monthName}</p>
          </div>
        </header>

        <section className="rp-kpis">
          <div><b>{report.visits}</b><span>space visits</span></div>
          <div><b>{duration(report.seconds)}</b><span>time in the tour</span></div>
          <div><b>{report.visits ? duration(Math.round(report.seconds / report.visits)) : '—'}</b><span>average per visit</span></div>
          <div><b>{report.enquiries}</b><span>enquiries{report.fromProjectPage ? ` (${report.fromProjectPage} from the project page)` : ''}</span></div>
        </section>

        <section>
          <h2>Visits per day</h2>
          <div className="rp-bars" role="img" aria-label={`Visits per day in ${monthName}, at most ${Math.max(...perDay)} in a day`}>
            {perDay.map((n, i) => (
              <div key={i} title={`${i + 1} ${monthName}: ${n}`}>
                <i style={{ height: `${(n / peak) * 100}%` }} />
                <span>{(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>Spaces</h2>
          {report.spaces.length ? (
            <table className="rp-table">
              <thead><tr><th>Space</th><th>Visits</th><th>Time</th><th>Avg. visit</th><th>Enquiries</th></tr></thead>
              <tbody>
                {report.spaces.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}</td>
                    <td>{s.visits}</td>
                    <td>{duration(s.seconds)}</td>
                    <td>{s.visits ? duration(Math.round(s.seconds / s.visits)) : '—'}</td>
                    <td>{s.enquiries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="rp-muted">No spaces in this project yet.</p>}
          <p className="rp-muted">Counts come from the published tour only. Time is counted while the tour tab is on screen, up to 30 minutes at a stretch.</p>
        </section>
      </article>
    </div>
  );
}
