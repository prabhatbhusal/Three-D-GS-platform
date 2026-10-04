/**
 * Copies the file accounts (DATA_DIR/users/*.json) into Postgres, keeping
 * their ids and password hashes, so everyone signs in as before and every
 * project's owner/member ids still match. Safe to run again: an email that's
 * already in the database is left alone. The JSON files are not touched;
 * unset DATABASE_URL to go back to them.
 *
 *   npm run db:import-users
 */
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../src/dataDir.js';

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL in server/.env first.');
  process.exit(1);
}
const { pool, migrate } = await import('../src/db.js');
await migrate();

const dir = path.join(DATA_DIR, 'users');
const files = (await fs.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json'));
let added = 0;
for (const f of files) {
  const u = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
  const r = await pool.query(
    `insert into app.users (id, name, email, password_hash, role, password_changed_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (email) do nothing`,
    [u.id, u.name, u.email, u.passwordHash, u.role ?? 'editor', u.passwordChangedAt ? new Date(u.passwordChangedAt) : null, u.createdAt ?? new Date()]
  );
  added += r.rowCount;
}
console.log(`${added} account(s) added, ${files.length - added} already there.`);
await pool.end();
