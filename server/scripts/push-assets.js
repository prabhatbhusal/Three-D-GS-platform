#!/usr/bin/env node
/**
 * Copy this PC's uploaded assets (server/src/data/assets, or ASSET_DIR) into
 * the S3 bucket set in server/.env, so every PC and the hosted API can serve
 * them. Run it once on each PC that has uploads, before or after switching
 * ASSET_DRIVER=s3 on. Files already in the bucket at the same size are
 * skipped, so running it again only sends what's new. Nothing is deleted,
 * here or there.
 *
 *   cd server && npm run assets:push             copy what's missing
 *   cd server && npm run assets:push -- --dry-run   list it, send nothing
 */
import 'dotenv/config';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { createS3Driver } from '../src/storage-s3.js';
import { ASSET_DIR, contentTypeFor } from '../src/storage.js';

const dry = process.argv.includes('--dry-run');
let s3;
try { s3 = createS3Driver(process.env); } catch (e) { console.error(e.message); process.exit(1); }

async function files(dir, base = dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(full, base)));
    else out.push({ full, rel: path.relative(base, full).split(path.sep).join('/') });
  }
  return out;
}

let assets;
try { assets = (await fs.readdir(ASSET_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name); } catch (e) {
  if (e.code === 'ENOENT') { console.log(`No uploads on this PC (${ASSET_DIR}). Nothing to push.`); process.exit(0); }
  throw e;
}

let sent = 0, skipped = 0, bytes = 0;
for (const id of assets) {
  let mine = 0;
  for (const f of await files(path.join(ASSET_DIR, id))) {
    const { size } = await fs.stat(f.full);
    const there = await s3.stat(id, f.rel).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
    if (there && there.bytes === size) { skipped += 1; continue; }
    if (!dry) await s3.put(id, f.rel, createReadStream(f.full), contentTypeFor(f.rel));
    sent += 1; mine += 1; bytes += size;
  }
  console.log(`${id}: ${mine ? `${dry ? 'would send' : 'sent'} ${mine} file(s)` : 'already in the bucket'}`);
}
const mb = (bytes / 1024 / 1024).toFixed(1);
console.log(`\n${dry ? 'Would send' : 'Sent'} ${sent} file(s), ${mb} MB; ${skipped} already there.`);
