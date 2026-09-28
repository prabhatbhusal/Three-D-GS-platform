/**
 * A stand-in S3 service for the tests (storage-s3.js): path-style PUT, GET
 * (with byte ranges), HEAD, DELETE and ListObjectsV2, kept in memory. Like
 * the real one, it recomputes every request's Signature V4 from the request
 * it actually received and refuses a mismatch — so the tests prove the driver
 * signs what it sends, keys and query strings included. Lists come in pages
 * of 3, so paging is exercised too.
 */
import http from 'node:http';
import { signV4 } from '../src/storage-s3.js';

export async function startFakeS3({ bucket, accessKeyId, secretAccessKey, pageSize = 3 }) {
  const objects = new Map(); // key -> { body: Buffer, type }
  const stats = { requests: 0, badSignatures: 0 };

  const xml = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/xml' }).end(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
  const error = (res, status, code) => xml(res, status, `<Error><Code>${code}</Code></Error>`);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const server = http.createServer(async (req, res) => {
    stats.requests += 1;
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    // Signature: recompute from what arrived.
    const auth = req.headers.authorization ?? '';
    const m = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(auth);
    const [rawPath, rawQuery = ''] = req.url.split('?');
    const query = Object.fromEntries(new URLSearchParams(rawQuery));
    const signed = m ? Object.fromEntries(m[4].split(';').map((h) => [h, req.headers[h]])) : {};
    const expected = m && signV4({
      method: req.method, path: rawPath, query, headers: signed,
      payloadHash: req.headers['x-amz-content-sha256'], amzDate: req.headers['x-amz-date'],
      region: m[3], accessKeyId, secretAccessKey
    });
    if (!m || m[1] !== accessKeyId || expected !== auth) {
      stats.badSignatures += 1;
      return error(res, 403, 'SignatureDoesNotMatch');
    }

    const parts = rawPath.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== bucket) return error(res, 404, 'NoSuchBucket');
    const key = parts.slice(1).join('/');

    if (!key && req.method === 'GET' && query['list-type'] === '2') {
      const all = [...objects.keys()].filter((k) => k.startsWith(query.prefix ?? '')).sort();
      const start = Number(query['continuation-token'] ?? 0);
      const size = Math.min(pageSize, Number(query['max-keys'] ?? 1000));
      const page = all.slice(start, start + size);
      const more = start + size < all.length;
      return xml(res, 200, `<ListBucketResult><KeyCount>${page.length}</KeyCount>${page.map((k) => `<Contents><Key>${esc(k)}</Key></Contents>`).join('')}` +
        `<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${start + size}</NextContinuationToken>` : ''}</ListBucketResult>`);
    }

    if (req.method === 'PUT') {
      if (Number(req.headers['content-length']) !== body.length) return error(res, 400, 'IncompleteBody');
      objects.set(key, { body, type: req.headers['content-type'] ?? 'application/octet-stream' });
      return res.writeHead(200).end();
    }
    if (req.method === 'DELETE') { objects.delete(key); return res.writeHead(204).end(); }

    const obj = objects.get(key);
    if (!obj) return req.method === 'HEAD' ? res.writeHead(404).end() : error(res, 404, 'NoSuchKey');
    if (req.method === 'HEAD') return res.writeHead(200, { 'Content-Length': obj.body.length, 'Content-Type': obj.type }).end();
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const from = Number(range[1]);
      const to = range[2] ? Math.min(Number(range[2]), obj.body.length - 1) : obj.body.length - 1;
      return res.writeHead(206, { 'Content-Range': `bytes ${from}-${to}/${obj.body.length}`, 'Content-Length': to - from + 1 }).end(obj.body.subarray(from, to + 1));
    }
    res.writeHead(200, { 'Content-Length': obj.body.length, 'Content-Type': obj.type }).end(obj.body);
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    objects, stats,
    close: () => new Promise((r) => server.close(r))
  };
}
