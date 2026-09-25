/**
 * Studio accounts. One JSON file per user under data/users/, named by a hash
 * of the lowercased email — so an email never becomes a path, and lookup is
 * one read. Same file-backed pattern as scenes/leads until Postgres exists.
 *
 * Passwords: scrypt from node:crypto (no dependency), random 16-byte salt,
 * compared with timingSafeEqual. The hash never leaves this module.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID, randomBytes, scrypt, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';
import { DATA_DIR } from './dataDir.js';

const scryptAsync = promisify(scrypt);
const USERS_DIR = path.join(DATA_DIR, 'users');
const KEY_LEN = 64;

const normEmail = (email) => String(email ?? '').trim().toLowerCase();
const fileFor = (email) =>
  path.join(USERS_DIR, `${createHash('sha256').update(normEmail(email)).digest('hex')}.json`);

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LEN);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

async function passwordMatches(password, stored) {
  const [saltHex, keyHex] = String(stored).split(':');
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

const publicUser = ({ id, name, email, role }) => ({ id, name, email, role: role ?? 'editor' });

async function readUser(email) {
  try {
    return JSON.parse(await fs.readFile(fileFor(email), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Every account file, parsed. Small team (CLAUDE.md §1: three to five
 *  people) — a directory scan per call is fine; revisit if that grows. */
async function readAllUsers() {
  let files;
  try {
    files = await fs.readdir(USERS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return Promise.all(
    files.filter((f) => f.endsWith('.json')).map(async (f) => JSON.parse(await fs.readFile(path.join(USERS_DIR, f), 'utf8')))
  );
}

/** Every account, for the admin-only team list. Newest first. */
export async function listUsers() {
  const all = await readAllUsers();
  return all.map(publicUser).sort((a, b) => b.id.localeCompare(a.id));
}

/** Scans by id — accounts are filed by email hash (see `fileFor`), so there
 *  is no direct lookup. Null if the account was deleted since the session
 *  was issued. */
export async function getUserById(id) {
  const found = (await readAllUsers()).find((u) => u.id === id);
  return found ? publicUser(found) : null;
}

/** For adding a teammate to a project by the email they sign in with. */
export async function getUserByEmail(email) {
  const found = await readUser(email);
  return found ? publicUser(found) : null;
}

/** Promote or demote an account. Refuses to leave the team with zero admins
 *  — the one guard rail against locking everyone out. */
export async function setUserRole(id, role) {
  if (role !== 'admin' && role !== 'editor') throw new Error('role must be "admin" or "editor"');
  const all = await readAllUsers();
  const record = all.find((u) => u.id === id);
  if (!record) return null;
  if (record.role === 'admin' && role !== 'admin' && all.filter((u) => u.role === 'admin').length <= 1) {
    throw Object.assign(new Error('That is the only admin left — promote someone else first.'), { status: 409 });
  }
  record.role = role;
  await fs.writeFile(fileFor(record.email), JSON.stringify(record, null, 2));
  return publicUser(record);
}

/** Returns the public user, or null if that email is already registered.
 *  The first account ever created becomes admin (there is no admin yet to
 *  invite anyone); every account after that starts as an editor and an
 *  admin promotes them from the team list. */
export async function createUser({ name, email, password }) {
  await fs.mkdir(USERS_DIR, { recursive: true });
  const isFirstAccount = (await readAllUsers()).length === 0;
  const record = {
    id: randomUUID(),
    name: String(name).trim(),
    email: normEmail(email),
    passwordHash: await hashPassword(password),
    role: isFirstAccount ? 'admin' : 'editor',
    createdAt: new Date().toISOString()
  };
  try {
    // 'wx' fails if the file exists — the uniqueness check and the write are one step.
    await fs.writeFile(fileFor(email), JSON.stringify(record, null, 2), { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') return null;
    throw err;
  }
  return publicUser(record);
}

/* ------------------------------------------------------------------ */
/* Reset links and removal (2026-09-25). No email service yet, so an    */
/* admin makes a one-time link and sends it however suits. Only its     */
/* hash is stored; it lasts a day and works once.                       */
/* ------------------------------------------------------------------ */

const RESET_TTL = 24 * 60 * 60 * 1000;
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');

/** When the password last changed: sessions issued before it are void. */
export async function passwordChangedAt(id) {
  const u = (await readAllUsers()).find((x) => x.id === id);
  return u ? u.passwordChangedAt ?? null : undefined; // undefined: no such account
}

export async function createResetToken(id) {
  const all = await readAllUsers();
  const record = all.find((u) => u.id === id);
  if (!record) return null;
  const token = randomBytes(24).toString('base64url');
  record.reset = { hash: sha(token), expires: Date.now() + RESET_TTL };
  await fs.writeFile(fileFor(record.email), JSON.stringify(record, null, 2));
  return { token, expires: new Date(record.reset.expires).toISOString(), user: publicUser(record) };
}

/** Sets the new password if the token is live; null otherwise. */
export async function resetPassword(token, password) {
  const hash = sha(token);
  const record = (await readAllUsers()).find((u) => u.reset && u.reset.hash === hash);
  if (!record || record.reset.expires < Date.now()) return null;
  record.passwordHash = await hashPassword(password);
  record.passwordChangedAt = Date.now();
  delete record.reset;
  await fs.writeFile(fileFor(record.email), JSON.stringify(record, null, 2));
  return publicUser(record);
}

/** Refuses to remove the last admin. */
export async function deleteUser(id) {
  const all = await readAllUsers();
  const record = all.find((u) => u.id === id);
  if (!record) return null;
  if (record.role === 'admin' && all.filter((u) => u.role === 'admin').length <= 1) {
    throw Object.assign(new Error('That is the only admin — promote someone else first.'), { status: 409 });
  }
  await fs.rm(fileFor(record.email), { force: true });
  return publicUser(record);
}

/** Returns the public user when the credentials are right, else null. */
export async function verifyUser(email, password) {
  const user = await readUser(email);
  if (!user) {
    // Spend the same time as a real check, so response time doesn't reveal
    // which emails have accounts.
    await hashPassword(String(password));
    return null;
  }
  return (await passwordMatches(String(password), user.passwordHash)) ? publicUser(user) : null;
}
