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

/** Leads are never edited, but what happened to their email is recorded. */
export async function setLeadDelivery(id, delivery) {
  const file = path.join(LEADS_DIR, `${id}.json`);
  const lead = JSON.parse(await fs.readFile(file, 'utf8'));
  await fs.writeFile(file, JSON.stringify({ ...lead, delivery }, null, 2));
}

/** One CSV row, Excel-safe: quoted, and a cell a stranger started with
 *  = + - @ (or a tab/CR) gets a leading ' so Excel shows it instead of
 *  running it as a formula. */
const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export function leadsCsv(leads) {
  const head = ['Received', 'Name', 'Phone', 'Email', 'Space', 'Looking for', 'Dates', 'Message', 'Was looking at', 'Emailed'];
  const rows = leads.map((l) => [
    l.createdAt, l.name, l.phone, l.email, l.sceneName || l.sceneId, l.requirement, l.dates, l.message, l.hotspotLabel,
    l.delivery ? (l.delivery.sent ? 'yes' : `no: ${l.delivery.reason}`) : ''
  ]);
  // BOM so Excel reads it as UTF-8 (Nepali names), CRLF as Excel expects
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
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
