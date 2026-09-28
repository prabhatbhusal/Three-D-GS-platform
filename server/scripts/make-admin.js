#!/usr/bin/env node
/**
 * Give an existing studio account the admin role, from the command line.
 * The studio's Team panel can promote people, but only an admin can open it:
 * accounts made before roles existed have none, so this is how the first
 * admin is named. Run it where the API's data lives (this PC, or the host).
 *
 *   cd server && npm run make-admin -- someone@example.com
 *   cd server && npm run make-admin -- --list     who has which role
 */
import 'dotenv/config';
import { getUserByEmail, listUsers, setUserRole } from '../src/usersStore.js';

const arg = process.argv[2];

if (!arg || arg === '--help') {
  console.log('Usage: npm run make-admin -- <email>     (or --list)');
  process.exit(arg ? 0 : 1);
}

if (arg === '--list') {
  const users = await listUsers();
  if (!users.length) console.log('No accounts yet. The first account created in the studio becomes admin.');
  for (const u of users) console.log(`${u.role.padEnd(7)} ${u.email}  ${u.name}`);
  process.exit(0);
}

const user = await getUserByEmail(arg);
if (!user) {
  console.error(`No account for ${arg}. Create it in the studio first (/login?mode=signup), then run this again.`);
  process.exit(1);
}
if (user.role === 'admin') {
  console.log(`${user.email} is already an admin.`);
  process.exit(0);
}
try {
  await setUserRole(user.id, 'admin');
  console.log(`${user.email} (${user.name}) is now an admin. Sign out and in again in the studio to see the Team panel.`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
