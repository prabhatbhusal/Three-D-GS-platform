/**
 * Studio accounts in Postgres (db/001_auth.sql). Same functions, results and
 * errors as usersStore-file.js, which the routes can't tell apart. Password
 * hashing is shared with it, so imported accounts keep their passwords.
 */
import { randomUUID, randomBytes } from 'crypto';
import { pool, tx } from './db.js';
import { normEmail, hashPassword, passwordMatches, publicUser, sha, RESET_TTL } from './usersStore-file.js';

const COLS = 'id, name, email, role';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// An id from a URL that isn't a uuid would make Postgres throw (a 500); it's simply no one.
const isId = (id) => typeof id === 'string' && UUID_RE.test(id);
const one = (r) => (r.rows[0] ? publicUser(r.rows[0]) : null);

export async function listUsers() {
  return (await pool.query(`select ${COLS} from app.users order by created_at desc`)).rows.map(publicUser);
}

export async function getUserById(id) {
  if (!isId(id)) return null;
  return one(await pool.query(`select ${COLS} from app.users where id = $1`, [id]));
}

export async function getUserByEmail(email) {
  return one(await pool.query(`select ${COLS} from app.users where email = $1`, [normEmail(email)]));
}

/** Locks every admin row first, so two demotions at once can't both pass
 *  the last-admin check. */
async function adminsLocked(c) {
  return (await c.query(`select id from app.users where role = 'admin' for update`)).rows.length;
}

export async function setUserRole(id, role) {
  if (role !== 'admin' && role !== 'editor') throw new Error('role must be "admin" or "editor"');
  if (!isId(id)) return null;
  return tx(async (c) => {
    const admins = await adminsLocked(c);
    const record = (await c.query(`select ${COLS} from app.users where id = $1 for update`, [id])).rows[0];
    if (!record) return null;
    if (record.role === 'staff') throw Object.assign(new Error('That’s a client staff account. Invite the person with a team account of their own instead.'), { status: 400 });
    if (record.role === 'admin' && role !== 'admin' && admins <= 1) {
      throw Object.assign(new Error('That is the only admin left — promote someone else first.'), { status: 409 });
    }
    return one(await c.query(`update app.users set role = $2 where id = $1 returning ${COLS}`, [id, role]));
  });
}

/** Null if the email is taken. The first account ever becomes admin.
 *  ponytail: two first sign-ups at the same instant both become admin;
 *  harmless (an admin can demote one). */
export async function createUser({ name, email, password, role }) {
  const r = await pool.query(
    `insert into app.users (id, name, email, password_hash, role)
     select $1, $2, $3, $4, case when exists (select 1 from app.users) then $5 else 'admin' end
     on conflict (email) do nothing
     returning ${COLS}`,
    [randomUUID(), String(name).trim(), normEmail(email), await hashPassword(password), role === 'staff' ? 'staff' : 'editor']
  );
  return one(r);
}

export async function createStaffAccount({ name, email }) {
  const user = await createUser({ name, email, password: randomBytes(32).toString('base64url'), role: 'staff' });
  if (!user) return null;
  const link = await createResetToken(user.id);
  return { user, token: link.token, expires: link.expires };
}

/** Milliseconds, null if never changed, undefined if there's no such account. */
export async function passwordChangedAt(id) {
  if (!isId(id)) return undefined;
  const row = (await pool.query('select password_changed_at from app.users where id = $1', [id])).rows[0];
  return row ? row.password_changed_at?.getTime() ?? null : undefined;
}

export async function createResetToken(id) {
  if (!isId(id)) return null;
  const token = randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + RESET_TTL);
  const user = one(await pool.query(
    `update app.users set reset_hash = $2, reset_expires = $3 where id = $1 returning ${COLS}`,
    [id, sha(token), expires]
  ));
  return user ? { token, expires: expires.toISOString(), user } : null;
}

/** One statement: a link used twice at once still sets one password. */
export async function resetPassword(token, password) {
  const now = new Date(); // the app's clock, as session iatMs is (staleReason)
  return one(await pool.query(
    `update app.users set password_hash = $2, password_changed_at = $3, reset_hash = null, reset_expires = null
     where reset_hash = $1 and reset_expires > $3
     returning ${COLS}`,
    [sha(token), await hashPassword(password), now]
  ));
}

export async function setPassword(id, password) {
  if (!isId(id)) return null;
  return one(await pool.query(
    `update app.users set password_hash = $2, password_changed_at = $3, reset_hash = null, reset_expires = null
     where id = $1 returning ${COLS}`,
    [id, await hashPassword(password), new Date()]
  ));
}

export async function deleteUser(id) {
  if (!isId(id)) return null;
  return tx(async (c) => {
    const admins = await adminsLocked(c);
    const record = (await c.query(`select ${COLS} from app.users where id = $1 for update`, [id])).rows[0];
    if (!record) return null;
    if (record.role === 'admin' && admins <= 1) {
      throw Object.assign(new Error('That is the only admin — promote someone else first.'), { status: 409 });
    }
    await c.query('delete from app.users where id = $1', [id]);
    return publicUser(record);
  });
}

export async function verifyUser(email, password) {
  const row = (await pool.query(`select ${COLS}, password_hash from app.users where email = $1`, [normEmail(email)])).rows[0];
  if (!row) {
    // Same time as a real check, so response time doesn't reveal which emails have accounts.
    await hashPassword(String(password));
    return null;
  }
  return (await passwordMatches(String(password), row.password_hash)) ? publicUser(row) : null;
}
