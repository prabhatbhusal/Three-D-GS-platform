/**
 * Lead storage (CLAUDE.md §6.4). One JSON file per lead under
 * data/leads/<id>.json — same file-backed pattern as scenes (store.js) until
 * Postgres exists. Leads are never edited after intake, only listed, so this
 * is intentionally simpler than store.js (no update path).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { DATA_DIR } from './dataDir.js';

const LEADS_DIR = path.join(DATA_DIR, 'leads');

async function ensureDir() {
  await fs.mkdir(LEADS_DIR, { recursive: true });
}

export async function saveLead(lead) {
  await ensureDir();
  const id = randomUUID();
  const record = { id, createdAt: new Date().toISOString(), ...lead };
  await fs.writeFile(path.join(LEADS_DIR, `${id}.json`), JSON.stringify(record, null, 2));
  return record;
}

export async function listLeads() {
  await ensureDir();
  const files = await fs.readdir(LEADS_DIR);
  const leads = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => JSON.parse(await fs.readFile(path.join(LEADS_DIR, f), 'utf8')))
  );
  return leads.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
