#!/usr/bin/env node
/**
 * npm run dev: the site (Next) and the API together, on free ports.
 *
 * Closing VS Code (or a crash) can leave the previous servers running. Next
 * then refuses a second `next dev` in this folder, and the API finds 4000
 * taken. So first stop leftovers of THIS project only: the `next dev` named
 * in .next/dev/lock, and an API whose /api/health says it is this folder's.
 * Anything else on 3000 / 4000 is left alone and the next free port is used,
 * with the site and the API told about each other's ports.
 *
 *   npm run dev        both
 *   npm run dev:web    the site alone (next dev)
 *   cd server && npm run dev   the API alone
 */
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'server');
const WIN = process.platform === 'win32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(`\x1b[36m[dev]\x1b[0m ${m}`);

/** A process's parent and command line (to stop a leftover's watcher too). */
function processInfo(pid) {
  try {
    if (WIN) {
      const out = execFileSync('powershell', ['-NoProfile', '-Command',
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}"; if ($p) { "$($p.ParentProcessId)|$($p.CommandLine)" }`],
      { encoding: 'utf8', windowsHide: true }).trim();
      if (!out) return null;
      const i = out.indexOf('|');
      return { ppid: Number(out.slice(0, i)), cmd: out.slice(i + 1) };
    }
    const out = execFileSync('ps', ['-o', 'ppid=,command=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    const m = /^(\d+)\s+(.*)$/.exec(out);
    return m ? { ppid: Number(m[1]), cmd: m[2] } : null;
  } catch {
    return null;
  }
}

/** Stop a leftover and, if it ran under a watcher (`next dev`, `node --watch`),
 *  that watcher first, so it can't start the server again. */
function stop(pid, what) {
  say(`stopping ${what} (pid ${pid}), left running from before`);
  const self = processInfo(pid);
  const parent = self && self.ppid > 0 && self.ppid !== process.pid ? processInfo(self.ppid) : null;
  if (parent && /node/i.test(parent.cmd) && (/next["']?\s+dev\b/.test(parent.cmd) || /\s--watch\b/.test(parent.cmd))) {
    try { process.kill(self.ppid); } catch { /* already gone */ }
  }
  try { process.kill(pid); } catch { /* already gone */ }
}

/** Leftover APIs of this folder on 4000–4009 (an earlier fallback may have moved one up). */
async function stopLeftoverApis() {
  const found = await Promise.all(Array.from({ length: 10 }, async (_, i) => {
    const port = 4000 + i;
    try {
      const h = await (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) })).json();
      if (h?.service === 'rcaas-api' && h.dir === path.join(SERVER, 'src') && h.pid) { stop(h.pid, `the API on :${port}`); return true; }
    } catch { /* nothing there, or not ours */ }
    return false;
  }));
  return found.some(Boolean);
}

function stopLeftoverNext() {
  let info;
  try { info = JSON.parse(fs.readFileSync(path.join(ROOT, '.next', 'dev', 'lock'), 'utf8')); } catch { return false; }
  if (!info?.pid || !processInfo(info.pid)) return false; // a stale lock with no process: Next handles it
  stop(info.pid, `next dev at ${info.appUrl ?? `:${info.port}`}`);
  return true;
}

const isFree = (port) => new Promise((resolve) => {
  const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
  s.listen(port);
});
async function freePort(from) {
  for (let p = from; p < from + 20; p++) if (await isFree(p)) return p;
  throw new Error(`no free port between ${from} and ${from + 19}`);
}

/* ---- 1. clear leftovers of this project, 2. pick ports ---- */
const stoppedNext = stopLeftoverNext();
const stoppedApi = await stopLeftoverApis();
if (stoppedNext || stoppedApi) await sleep(1500); // let the ports go
const webPort = await freePort(Number(process.env.WEB_PORT) || 3000);
const apiPort = await freePort(Number(process.env.API_PORT) || 4000);
if (webPort !== 3000) say(`3000 is taken by something else; the site uses ${webPort}`);
if (apiPort !== 4000) say(`4000 is taken by something else; the API uses ${apiPort}`);

/* ---- 3. start both, output prefixed, stopped together ---- */
const children = [];
function run(name, color, cmd, args, opts) {
  const child = spawn(cmd, args, { ...opts, env: { ...process.env, FORCE_COLOR: '1', ...opts.env }, windowsHide: true });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (from, to) => {
    let buf = '';
    from.on('data', (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) to.write(tag + l + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    say(`${name} stopped${code ? ` (exit ${code})` : ''}`);
    if (name === 'web') shutdown(code ?? 0); // the site is what you're looking at: without it, stop everything
  });
  children.push(child);
  return child;
}

run('api', 35, process.execPath, ['--watch', 'src/index.js'], {
  cwd: SERVER, env: { PORT: String(apiPort), CLIENT_ORIGIN: `http://localhost:${webPort}` }
});
run('web', 32, process.execPath, [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--webpack', '-p', String(webPort)], {
  cwd: ROOT, env: { NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}` }
});
say(`site  http://localhost:${webPort}   API  http://localhost:${apiPort}   (Ctrl+C stops both)`);

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    // Windows: take the whole tree (next dev and node --watch each run a child server)
    if (WIN) { try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* gone */ } }
    else c.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0)); // the terminal (or VS Code) closing
