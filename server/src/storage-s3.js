/**
 * The S3-compatible storage driver (2026-09-28): uploaded splats live in one
 * cloud bucket instead of on the PC that uploaded them, so every PC — and the
 * hosted API — serves the same files. Works with Cloudflare R2, Backblaze B2,
 * AWS S3, MinIO, Wasabi, Supabase Storage: anything that speaks S3.
 *
 * No SDK: requests are signed with AWS Signature V4 using node:crypto and
 * sent with node:http(s). Path-style addressing (<endpoint>/<bucket>/<key>).
 * Keys are `${S3_PREFIX}${assetId}/${relPath}` (prefix defaults to assets/).
 *
 * Switched on in server/.env (see .env.example):
 *   ASSET_DRIVER=s3
 *   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
 *   S3_BUCKET=rcaas-assets      S3_REGION=auto (R2) or e.g. us-east-1
 *   S3_ACCESS_KEY_ID=…          S3_SECRET_ACCESS_KEY=…
 */
import { createHash, createHmac } from 'crypto';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import http from 'http';
import https from 'https';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** RFC 3986 encoding, as S3's canonical request wants it. */
export const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const hmac = (key, s) => createHmac('sha256', key).update(s).digest();

/**
 * AWS Signature V4 for one request: returns the Authorization header value.
 * Pure (the clock and credentials come in), so it's checked against AWS's own
 * published example in the tests.
 */
export function signV4({ method, path: uriPath, query = {}, headers, payloadHash, amzDate, region, accessKeyId, secretAccessKey }) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const names = Object.keys(h).sort();
  const canonicalQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&');
  const canonicalRequest = [
    method, uriPath, canonicalQuery,
    names.map((k) => `${k}:${h[k]}\n`).join(''), names.join(';'), payloadHash
  ].join('\n');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
}

export function createS3Driver(env = process.env) {
  const endpoint = new URL(env.S3_ENDPOINT);
  const bucket = env.S3_BUCKET;
  const region = env.S3_REGION || 'auto';
  const prefix = env.S3_PREFIX ?? 'assets/';
  const creds = { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY };
  for (const [k, v] of Object.entries({ S3_ENDPOINT: env.S3_ENDPOINT, S3_BUCKET: bucket, S3_ACCESS_KEY_ID: creds.accessKeyId, S3_SECRET_ACCESS_KEY: creds.secretAccessKey })) {
    if (!v) throw new Error(`ASSET_DRIVER=s3 needs ${k} in server/.env`);
  }
  const lib = endpoint.protocol === 'http:' ? http : https;
  const agent = new lib.Agent({ keepAlive: true, maxSockets: 32 }); // tiles come in bursts
  const base = endpoint.pathname.replace(/\/$/, '');

  const keyOf = (assetId, rel = '') => `${prefix}${assetId}/${rel}`;
  const uriFor = (key) => `${base}/${enc(bucket)}/${key.split('/').map(enc).join('/')}`;

  /** One signed request. Resolves with the response (body unread) — or rejects on network trouble. */
  function request(method, key, { query = {}, headers = {}, body = null, payloadHash = 'UNSIGNED-PAYLOAD' } = {}) {
    const uriPath = key === null ? `${base}/${enc(bucket)}` : uriFor(key);
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const all = { host: endpoint.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, ...headers };
    const authorization = signV4({ method, path: uriPath, query, headers: all, payloadHash, amzDate, region, ...creds });
    const qs = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&');
    return new Promise((resolve, reject) => {
      const req = lib.request({
        protocol: endpoint.protocol, hostname: endpoint.hostname, port: endpoint.port || undefined, agent,
        method, path: uriPath + (qs ? `?${qs}` : ''), headers: { ...all, authorization }
      }, resolve);
      req.on('error', reject);
      req.setTimeout(60000, () => req.destroy(new Error('The storage service did not answer in time.')));
      if (body && typeof body.pipe === 'function') body.on('error', (e) => req.destroy(e)).pipe(req);
      else req.end(body ?? undefined);
    });
  }

  const text = async (res) => { let s = ''; for await (const c of res) s += c; return s; };
  const notFound = () => Object.assign(new Error('Asset not found.'), { code: 'ENOENT', status: 404 });
  async function ok(res, what) {
    if (res.statusCode === 404) { res.resume(); throw notFound(); }
    if (res.statusCode >= 300) {
      const detail = (await text(res)).match(/<Code>([^<]+)<\/Code>/)?.[1] ?? res.statusCode;
      throw Object.assign(new Error(`Storage ${what} failed (${detail}). Check the S3 settings in server/.env.`), { status: 502 });
    }
    return res;
  }

  /** Every key under a prefix (ListObjectsV2, page by page). */
  async function listKeys(keyPrefix, max = Infinity) {
    const keys = [];
    let token;
    do {
      const query = { 'list-type': '2', prefix: keyPrefix, ...(token ? { 'continuation-token': token } : {}), ...(max < 1000 ? { 'max-keys': String(max) } : {}) };
      const xml = await text(await ok(await request('GET', null, { query, payloadHash: EMPTY_SHA256 }), 'list'));
      for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] : undefined;
    } while (token && keys.length < max);
    return keys;
  }

  return {
    name: 's3',

    /** S3 needs the length up front: a file stream says so; anything else is spooled to a temp file first. */
    async put(assetId, rel, readStream, contentType) {
      let file = typeof readStream.path === 'string' && !readStream.readableFlowing ? readStream.path : null;
      let spooled = null;
      if (file) readStream.destroy(); // read again below, with its size known
      else {
        spooled = path.join(os.tmpdir(), `rcaas-upload-${randomUUID()}`);
        await pipeline(readStream, createWriteStream(spooled));
        file = spooled;
      }
      try {
        const { size } = await fs.stat(file);
        await ok(await request('PUT', keyOf(assetId, rel), {
          headers: { 'content-length': size, 'content-type': contentType },
          body: size ? createReadStream(file) : Buffer.alloc(0)
        }), 'upload');
      } finally {
        if (spooled) await fs.rm(spooled, { force: true });
      }
    },

    async stat(assetId, rel) {
      const res = await ok(await request('HEAD', keyOf(assetId, rel), { payloadHash: EMPTY_SHA256 }), 'read');
      res.resume();
      return { bytes: Number(res.headers['content-length'] ?? 0) };
    },

    /** A stream at once (the interface is synchronous); the bytes follow as they arrive. */
    get(assetId, rel, { range } = {}) {
      const out = new PassThrough();
      const headers = range ? { range: `bytes=${range.start ?? 0}-${range.end ?? ''}` } : {};
      request('GET', keyOf(assetId, rel), { headers, payloadHash: EMPTY_SHA256 })
        .then((res) => ok(res, 'read'))
        .then((res) => res.on('error', (e) => out.destroy(e)).pipe(out))
        .catch((e) => out.destroy(e));
      return out;
    },

    /** Relative paths of every file of an asset (under `under`, if given). */
    async list(assetId, under = '') {
      const p = keyOf(assetId, under);
      return (await listKeys(p)).map((k) => k.slice(keyOf(assetId).length)).filter(Boolean);
    },

    async exists(assetId) {
      return (await listKeys(keyOf(assetId), 1)).length > 0;
    },

    async remove(assetId, rel) {
      const keys = rel ? [keyOf(assetId, rel)] : await listKeys(keyOf(assetId));
      // ponytail: one DELETE per file, 8 at a time; DeleteObjects (1,000 per call) if exports grow to thousands of tiles
      for (let i = 0; i < keys.length; i += 8) {
        await Promise.all(keys.slice(i, i + 8).map(async (k) => {
          const res = await request('DELETE', k, { payloadHash: EMPTY_SHA256 });
          res.resume();
          if (res.statusCode >= 300 && res.statusCode !== 404) throw new Error(`Storage delete failed (${res.statusCode}).`);
        }));
      }
    }
  };
}
