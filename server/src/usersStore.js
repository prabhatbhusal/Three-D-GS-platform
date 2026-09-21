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

const publicUser = ({ id, name, email }) => ({ id, name, email });

async function readUser(email) {
  try {
    return JSON.parse(await fs.readFile(fileFor(email), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Returns the public user, or null if that email is already registered. */
export async function createUser({ name, email, password }) {
  await fs.mkdir(USERS_DIR, { recursive: true });
  const record = {
    id: randomUUID(),
    name: String(name).trim(),
    email: normEmail(email),
    passwordHash: await hashPassword(password),
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
