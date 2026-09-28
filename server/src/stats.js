/**
 * Visit counts for the monthly client report (2026-09-27). Totals only: no
 * cookies, no IPs, nothing about a person — per project, per month, per
 * space: how many visits, how many seconds, and visits per day. One small
 * file per project-month under data/stats/ (gitignored). Writes to one file
 * are queued, so beacons arriving together can't lose each other's counts.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from './dataDir.js';

const DIR = path.join(DATA_DIR, 'stats');
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthOf = (d = new Date()) => d.toISOString().slice(0, 7);
const fileFor = (propertyId, month) => path.join(DIR, propertyId, `${month}.json`);

const empty = () => ({ visits: 0, seconds: 0, days: {}, spaces: {} });

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

/** One visit to a space, or `seconds` more spent in it. */
export function count(propertyId, sceneId, { visit = false, seconds = 0 }) {
  const month = monthOf();
  return queued(`${propertyId}/${month}`, async () => {
    const s = await read(propertyId, month);
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
  return read(propertyId, month);
}

export { MONTH, monthOf };
