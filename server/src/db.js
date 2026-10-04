/**
 * The Postgres connection (Supabase, or any Postgres: nothing here is
 * Supabase-specific, so moving providers is pg_dump + a new DATABASE_URL).
 * Only this server talks to the database; tables live in the `app` schema,
 * which Supabase's public Data API doesn't expose, with RLS on as well.
 */
import pg from 'pg';
import { promises as fs, readFileSync } from 'fs';
import path from 'path';

// DATABASE_CA_FILE: the provider's CA certificate (Supabase: Database → SSL
// configuration → download), so the TLS connection is verified, not just encrypted.
const ca = process.env.DATABASE_CA_FILE ? readFileSync(process.env.DATABASE_CA_FILE, 'utf8') : undefined;

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DATABASE_POOL_MAX) || 10,
  ...(ca && { ssl: { ca } })
});
// An idle connection the provider drops must not crash the server.
pool.on('error', (err) => console.error('[db] idle connection error:', err.message));

/** Runs `fn(client)` in one transaction; rolls back if it throws. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Applies server/db/*.sql not yet applied, in name order, each in its own
 *  transaction. ponytail: no lock between two servers starting at once;
 *  add pg_advisory_lock when more than one API process runs. */
export async function migrate() {
  const dir = path.join(import.meta.dirname, '..', 'db');
  await pool.query(`create schema if not exists app;
    create table if not exists app.schema_migrations (name text primary key, applied_at timestamptz not null default now());
    alter table app.schema_migrations enable row level security;`);
  const done = new Set((await pool.query('select name from app.schema_migrations')).rows.map((r) => r.name));
  for (const name of (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    const sql = await fs.readFile(path.join(dir, name), 'utf8');
    await tx(async (c) => {
      await c.query(sql);
      await c.query('insert into app.schema_migrations (name) values ($1)', [name]);
    });
    console.log(`[db] applied ${name}`);
  }
}
