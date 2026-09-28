/**
 * Visit counts for the monthly client report (2026-09-27). Totals only: no
 * cookies, no IPs, nothing about a person — per project, per month, per
 * space: how many visits, how many seconds, and visits per day. One small
 * file per project-month under data/stats/ (gitignored). Writes to one file
 * are queued, so beacons arriving together can't lose each other's counts.
 *
 * The path to a booking (2026-09-28), totals too: how often each hotspot was
 * opened, how many visits opened any hotspot ("engaged"), and how many
 * opened each booking or enquiry card ("intent"). Enquiries and booking
 * requests themselves are counted from what was saved, not from here.
 */
export const INTENTS = ['enquire', 'book', 'table', 'room'];
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from './dataDir.js';

const DIR = path.join(DATA_DIR, 'stats');
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthOf = (d = new Date()) => d.toISOString().slice(0, 7);
const fileFor = (propertyId, month) => path.join(DIR, propertyId, `${month}.json`);

const empty = () => ({ visits: 0, seconds: 0, days: {}, spaces: {}, engaged: 0, intent: {}, hotspots: {} });

async function read(propertyId, month) {
  try {
    return JSON.parse(await fs.readFile(fileFor(propertyId, month), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return empty();
    throw err;
  }
}

const queues = new Map();
function queued(key, fn) {
  const run = (queues.get(key) ?? Promise.resolve()).then(fn, fn);
  queues.set(key, run.catch(() => {}));
  return run;
}

/** One visit to a space, or `seconds` more spent in it; or a hotspot opened
 *  (`hotspot`: { id, label }, `first` for a visit's first), or a card opened
 *  (`intent`: one of INTENTS). */
export function count(propertyId, sceneId, { visit = false, seconds = 0, hotspot = null, first = false, intent = null }) {
  const month = monthOf();
  return queued(`${propertyId}/${month}`, async () => {
    const s = { ...empty(), ...(await read(propertyId, month)) };
    if (hotspot) {
      const bySpace = (s.hotspots[sceneId] ??= {});
      const h = (bySpace[hotspot.id] ??= { opens: 0, label: '' });
      h.opens += 1;
      h.label = hotspot.label;
      if (first) s.engaged += 1;
    }
    if (intent) s.intent[intent] = (s.intent[intent] ?? 0) + 1;
    const sp = (s.spaces[sceneId] ??= { visits: 0, seconds: 0 });
    if (visit) {
      s.visits += 1;
      sp.visits += 1;
      const day = new Date().toISOString().slice(0, 10);
      s.days[day] = (s.days[day] ?? 0) + 1;
    }
    if (seconds > 0) {
      s.seconds += seconds;
      sp.seconds += seconds;
    }
    await fs.mkdir(path.dirname(fileFor(propertyId, month)), { recursive: true });
    await fs.writeFile(fileFor(propertyId, month), JSON.stringify(s));
  });
}

export async function monthStats(propertyId, month) {
  if (!MONTH.test(month)) return null;
  return { ...empty(), ...(await read(propertyId, month)) };
}

export { MONTH, monthOf };
