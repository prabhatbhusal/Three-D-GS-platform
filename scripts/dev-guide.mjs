// Builds docs/RCAAS-Developer-Guide.pdf: the codebase explained for a developer
// who has never seen it. The API reference, module index, page list, settings,
// commands, rules and known gaps are read from the code and CLAUDE.md each run,
// so the guide stays true as the code changes; the chapters around them are
// written here. Prints through headless Chrome (the same as scripts/shot.mjs).
//   npm run docs:dev-guide          CHROME=<path> if Chrome isn't in its usual Windows place
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs', 'RCAAS-Developer-Guide.pdf');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Markdown's inline bits (bold, code) as HTML; enough for CLAUDE.md's bullets. */
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
const commit = (() => {
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', { cwd: ROOT }).toString().trim();
    return dirty ? `${hash} with uncommitted changes` : hash;
  } catch { return 'unknown'; }
})();
const today = new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------ reading the code */

/** What a file is for: its first block comment before any export, else the
 *  comment just above its default export (a page's, usually). */
function headerComment(src) {
  const firstExport = src.search(/^export /m);
  const head = firstExport < 0 ? src : src.slice(0, firstExport);
  const block = /\/\*\*?([\s\S]*?)\*\//.exec(head)?.[1] ?? /\/\*\*([\s\S]*?)\*\/\s*export default/.exec(src)?.[1];
  const lines = block ? block.split('\n').map((l) => l.replace(/^\s*\*?\s?/, '')) : head.split('\n').filter((l) => /^\s*\/\//.test(l)).map((l) => l.replace(/^\s*\/\/\s?/, ''));
  const para = lines.join('\n').trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  return clip(para, 420);
}
/** Cut at a sentence end near `n` characters. */
function clip(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (end > n * 0.5 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '')) + (end > n * 0.5 ? '' : '…');
}
function walk(dir, keep) {
  const out = [];
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs).sort()) {
    const rel = `${dir}/${name}`;
    if (/node_modules|vendor|\.next|data$/.test(name)) continue;
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...walk(rel, keep));
    else if (keep.test(name)) out.push(rel);
  }
  return out;
}

/** Every API route: method, full path, who may call it, and the comment above it in the code. */
function apiRoutes() {
  const mounts = {};
  for (const m of read('server/src/index.js').matchAll(/app\.use\('([^']+)',\s*(\w+)\)/g)) mounts[m[2]] = m[1];
  const routes = [];
  for (const file of readdirSync(path.join(ROOT, 'server/src/routes')).sort()) {
    const lines = read(`server/src/routes/${file}`).split('\n');
    lines.forEach((line, i) => {
      const m = /^\s*(\w+Router)\.(get|post|put|patch|delete)\(\s*'([^']+)'(.*)/.exec(line);
      if (!m) return;
      const notes = [];
      for (let j = i - 1; j >= 0; j--) {
        const l = lines[j].trim();
        if (!(l.startsWith('//') || l.startsWith('*') || l.startsWith('/**') || l.endsWith('*/'))) break;
        notes.unshift(l.replace(/^\/\*\*?|\*\/$|^\*|^\/\//g, '').trim());
      }
      const guards = m[4] + (lines[i + 1] ?? '');
      const access = /requireAdmin/.test(guards) ? 'Admin'
        : /sceneGuard|assetGuard/.test(guards) ? 'Signed in, with access to it'
          : /requireEditorSession/.test(guards) ? 'Signed in'
            : /byReviewKey/.test(guards) ? 'Review link key, or signed in' : 'Public';
      const base = mounts[m[1]] ?? '?';
      routes.push({ file, method: m[2].toUpperCase(), path: (base + (m[3] === '/' ? '' : m[3])) || '/', access, about: clip(notes.join(' ').replace(/\s+/g, ' '), 260) });
    });
  }
  return routes;
}

/** The site's pages and plain routes, from src/app's folders. */
function pages() {
  return walk('src/app', /^(page\.tsx|route\.ts)$/).map((f) => {
    const url = '/' + f.replace(/^src\/app\/?/, '').replace(/\/?(page\.tsx|route\.ts)$/, '').split('/').filter((s) => s && !/^\(.*\)$/.test(s)).join('/');
    return { url: url.replace(/\[(\w+)\]/g, ':$1'), file: f, about: headerComment(read(f)) };
  });
}

function modules(dir, keep = /\.(ts|tsx|js|mjs)$/) {
  return walk(dir, keep).filter((f) => !/\.d\.ts$/.test(f)).map((f) => {
    const src = read(f);
    return { file: f, lines: src.split('\n').length, about: headerComment(src) };
  });
}

/** server/.env.example: each setting with the comment lines above it. */
function envVars() {
  const out = [];
  let notes = [];
  for (const raw of read('server/.env.example').split('\n')) {
    const line = raw.trim();
    const set = /^#?\s*([A-Z][A-Z0-9_]+)=(.*)$/.exec(line);
    if (set) { out.push({ key: set[1], example: set[2], about: notes.join(' ') }); notes = []; continue; }
    if (line.startsWith('#')) notes.push(line.replace(/^#\s?/, ''));
    else notes = [];
  }
  return out;
}

/** A "### Heading" list from CLAUDE.md (or a numbered "## N." section), as HTML bullets. */
function claudeList(start) {
  const src = read('CLAUDE.md');
  const from = src.indexOf(start);
  if (from < 0) return '<p>Not found in CLAUDE.md.</p>';
  const rest = src.slice(from + start.length);
  const end = rest.search(/\n#{2,3} /);
  const body = end < 0 ? rest : rest.slice(0, end);
  const items = body.split(/\n(?=- |\d+\. )/).map((s) => s.trim()).filter((s) => /^(- |\d+\. )/.test(s))
    .map((s) => `<li>${md(s.replace(/^(- |\d+\. )/, '').replace(/\n\s+/g, ' '))}</li>`);
  return `<ul class="bullets">${items.join('')}</ul>`;
}

const scripts = (p) => Object.entries(JSON.parse(read(p)).scripts ?? {});

/* ------------------------------------------------------------ the document */

const routes = apiRoutes();
const byFile = Object.groupBy(routes, (r) => r.file);
const table = (head, rows, cls = '') => `<table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
/** The repo files a source file imports (its relative imports, resolved; CSS and packages left out). */
function localImports(file) {
  const out = new Set();
  for (const m of read(file).matchAll(/(?:import|export)\s[^'"]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    const spec = m[1] ?? m[2];
    if (/\.css$/.test(spec)) continue;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    const hit = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']
      .map((e) => base + e).find((p) => existsSync(path.join(ROOT, p)) && statSync(path.join(ROOT, p)).isFile());
    if (hit) out.add(hit);
  }
  return [...out].sort();
}
/** Who imports whom, across the site (src/) and the API (server/src). */
const graph = (() => {
  const files = [...walk('src', /\.(ts|tsx)$/), ...walk('server/src', /\.(js|mjs)$/)]
    .filter((f) => !/\.d\.ts$/.test(f) && !f.startsWith('src/vendor/'));
  const uses = Object.fromEntries(files.map((f) => [f, localImports(f)]));
  const usedBy = Object.fromEntries(files.map((f) => [f, []]));
  for (const [f, list] of Object.entries(uses)) for (const d of list) usedBy[d]?.push(f);
  return { files, uses, usedBy };
})();
const short = (f) => f.replace(/^src\//, '').replace(/^server\/src\//, 'server/');
/** Each page: the layouts wrapping it, outermost first, and the components it puts on screen itself. */
function pageChains() {
  return walk('src/app', /^page\.tsx$/).map((f) => {
    const dirs = path.posix.dirname(f).split('/');
    const layouts = dirs.map((_, i) => `${dirs.slice(0, i + 1).join('/')}/layout.tsx`).filter((l) => existsSync(path.join(ROOT, l)));
    const url = '/' + f.replace(/^src\/app\/?/, '').replace(/\/?page\.tsx$/, '').split('/').filter((s) => s && !/^\(.*\)$/.test(s)).join('/');
    const parts = graph.uses[f]?.filter((d) => /^src\/(components|features|app)\//.test(d)) ?? [];
    return { url: url.replace(/\[(\w+)\]/g, ':$1'), file: f, layouts, parts };
  });
}
const codeList = (list) => list.map((x) => `<code>${esc(short(x))}</code>`).join(' ') || '<span class="dim">none</span>';
/** A workflow as a table: each step's file and function, and what happens there. */
const flow = (title, steps) => `<h3>${title}</h3>${table(['', 'Where', 'What happens'],
  steps.map(([where, what], i) => `<tr><td class="num">${i + 1}</td><td>${where}</td><td>${what}</td></tr>`), 'flow')}`;

const moduleTable = (list) => table(['File', 'Lines', 'What it is for'],
  list.map((m) => `<tr><td><code>${esc(m.file)}</code></td><td class="num">${m.lines}</td><td>${esc(m.about) || '<span class="dim">No header comment.</span>'}</td></tr>`), 'mods');

const CHAPTERS = [
  ['start', 'Read this first'], ['learn', 'Learning the codebase in a day'], ['product', 'What the product does'], ['arch', 'How it fits together'],
  ['flows', 'Workflows, file by file'], ['setup', 'Running it on your computer'], ['repo', 'Where things are'],
  ['layout', 'How a page is put together'], ['frontend', 'Frontend conventions'], ['rules', 'Rules that override feature requests'],
  ['data', 'The data'], ['auth', 'Accounts and permissions'], ['api', 'API reference'], ['pages', 'Pages'], ['three', 'The 3D tour engine'],
  ['modules', 'Module index'], ['links', 'How the files link'], ['tests', 'Testing'], ['config', 'Settings'], ['deploy', 'Deploying'],
  ['recipes', 'Recipes for common changes'], ['improve', 'Where the code should go next'], ['gaps', 'Known gaps']
];
/** A chapter heading, numbered by its place in CHAPTERS. */
const h = (id) => `<h1 id="${id}"><span class="n">${CHAPTERS.findIndex((c) => c[0] === id) + 1}</span>${CHAPTERS.find((c) => c[0] === id)[1]}</h1>`;
const ch = (id) => `chapter ${CHAPTERS.findIndex((c) => c[0] === id) + 1} (${CHAPTERS.find((c) => c[0] === id)[1]})`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>RCAAS.tech Developer Guide</title><style>
@page { size: A4; margin: 18mm 17mm 20mm; }
:root { --ink: #16181d; --dim: #5b606b; --line: #d9dbe1; --soft: #f3f4f7; --accent: #2450e6; --brown: #8a5a2e; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); font: 10pt/1.55 "Segoe UI", system-ui, sans-serif; }
h1 { break-before: page; margin: 0 0 14pt; padding-bottom: 8pt; border-bottom: 1.5pt solid var(--brown); font-size: 20pt; line-height: 1.2; }
h1 .n { display: inline-block; min-width: 26pt; color: var(--brown); }
h2 { margin: 18pt 0 6pt; font-size: 13pt; break-after: avoid; }
h3 { margin: 12pt 0 4pt; font-size: 11pt; break-after: avoid; }
p, li { max-width: 165mm; }
p { margin: 0 0 7pt; }
code { font: 8.6pt Consolas, ui-monospace, monospace; background: var(--soft); padding: 0 2pt; border-radius: 2pt; }
pre { margin: 6pt 0 10pt; padding: 8pt 10pt; background: var(--soft); border-left: 2pt solid var(--brown); font: 8.4pt/1.45 Consolas, ui-monospace, monospace; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; padding: 0; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 8.6pt; }
th { text-align: left; padding: 4pt 6pt 4pt 0; border-bottom: 1pt solid var(--brown); color: var(--dim); font-weight: 600; }
td { padding: 4pt 6pt 4pt 0; border-bottom: 0.5pt solid var(--line); vertical-align: top; }
tr { break-inside: avoid; }
table.api, table.mods, table.links, table.flow { table-layout: fixed; }
table.flow th:nth-child(1) { width: 4%; } table.flow th:nth-child(2) { width: 38%; }
table.links th:nth-child(1) { width: 30%; } table.links td code, table.flow td code { overflow-wrap: anywhere; }
.tree { margin: 8pt 0 12pt; padding: 10pt; border: 1pt solid var(--line); font: 8.2pt/1.55 Consolas, monospace; white-space: pre; break-inside: avoid; }
table.api th:nth-child(1) { width: 9%; } table.api th:nth-child(2) { width: 33%; } table.api th:nth-child(3) { width: 14%; }
table.mods th:nth-child(1) { width: 34%; } table.mods th:nth-child(2) { width: 7%; }
table.api td:nth-child(2) code, table.mods td:nth-child(1) code { overflow-wrap: anywhere; }
td code { font-size: 7.8pt; background: none; padding: 0; }
.num { text-align: right; font-variant-numeric: tabular-nums; color: var(--dim); }
.m { font-weight: 700; font-size: 7.6pt; }
.m.GET { color: #1d7a46; } .m.POST { color: var(--accent); } .m.PUT, .m.PATCH { color: #9a5a00; } .m.DELETE { color: #b42318; }
.dim { color: var(--dim); }
.bullets li { margin-bottom: 5pt; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: space-between; }
.cover h1 { break-before: auto; border: 0; font-size: 34pt; margin: 40mm 0 8pt; }
.cover .sub { font-size: 14pt; color: var(--dim); max-width: 140mm; }
.cover .meta { color: var(--dim); font-size: 9pt; border-top: 1pt solid var(--brown); padding-top: 8pt; }
.toc { list-style: none; padding: 0; columns: 2; column-gap: 12mm; }
.toc li { margin: 0 0 5pt; break-inside: avoid; }
.toc a { color: var(--ink); text-decoration: none; }
.toc .n { display: inline-block; min-width: 18pt; color: var(--brown); font-weight: 700; }
.diagram { margin: 8pt 0 12pt; padding: 10pt; border: 1pt solid var(--line); font: 8.4pt/1.5 Consolas, monospace; white-space: pre; break-inside: avoid; }
.note { padding: 7pt 10pt; border-left: 2pt solid var(--accent); background: #eef2ff; margin: 6pt 0 10pt; }
a { color: var(--accent); }
</style></head><body>

<section class="cover">
  <div>
    <h1>RCAAS.tech<br>Developer Guide</h1>
    <p class="sub">How the 3D tour platform is built: the architecture, the data, every API route and every module, and how to run, test, change and deploy it.</p>
  </div>
  <p class="meta">Generated from the code on ${today}, at commit <code>${commit}</code>, by <code>npm run docs:dev-guide</code>. Regenerate it after changing the code; the API, modules, pages, settings and known gaps update themselves.<br>
  For what the product does for clients, read <b>RCAAS-Feature-Book.pdf</b> beside this file. The living, always-current brief is <code>CLAUDE.md</code> at the repository root.</p>
</section>

<h1 id="toc" style="break-before: page">Contents</h1>
<ol class="toc">${CHAPTERS.map(([id, t], i) => `<li><a href="#${id}"><span class="n">${i + 1}</span>${t}</a></li>`).join('')}</ol>

${h('start', 1)}
<p>RCAAS.tech turns LiDAR scans of real places (hotel lobbies, banquet halls, college labs, heritage courtyards) into 3D tours that people walk through in a web browser, and turns visitors into enquiries and booking requests. It is two programs in one repository:</p>
<ul class="bullets">
<li><b>The website and studio</b> (<code>src/</code>): a Next.js 16 app. Visitors see the marketing site, the tours (<code>/tour</code>, <code>/t/:project</code>) and clients' websites (<code>/s/:project</code>). The team authors tours in the studio (<code>/studio</code>).</li>
<li><b>The API</b> (<code>server/</code>): an Express server. It stores spaces, projects, websites, bookings and enquiries, serves the scan files, and sends emails and texts.</li>
</ul>
<p>Three things make this codebase unusual, and most surprises come from them:</p>
<ul class="bullets">
<li><b>The 3D engine is a vendor SDK.</b> Splats are drawn by the XGRIDS LCC Web SDK (<code>src/vendor/</code>), which owns a single WebGL renderer per page. The only documentation is <code>src/vendor/README.md</code>. Never guess what it can do.</li>
<li><b>Data is JSON files</b> in a data folder (<code>DATA_DIR</code>), behind small store modules. Only studio accounts can live in Postgres so far. A store's functions are its contract, so a database can replace one store at a time.</li>
<li><b>Publishing is a snapshot.</b> Editing in the studio never changes a live tour. Publishing writes a numbered copy, and visitors only ever read those copies.</li>
</ul>
<div class="note">New here? Start with ${ch('learn')}: it is a plan for your first day. Keep ${ch('api')} and ${ch('links')} open as a reference while you work.</div>

${h('learn')}
<p>Nobody needs to read every file. The code is about ${Math.round(graph.files.reduce((n, f) => n + read(f).split('\n').length, 0) / 1000)} thousand lines across ${graph.files.length} files, and most of a day's understanding comes from following a few requests from the button to the file on disk. This plan gets a developer (or the owner) to the point of making a safe change by the end of one day.</p>
${table(['When', 'Do this', 'Read'], [
  ['Hour 1', 'Run it and use it like a client. Open the home page, a tour, the studio, a project\'s website (<code>/s/:project</code>) and the Reservations inbox. Book a table from a hotspot and confirm it.', `${ch('setup')}, ${ch('product')}`],
  ['Hour 2', 'Learn the shape: two programs (the Next.js site and the Express API), and how a page is built from layouts and components.', `${ch('arch')}, ${ch('layout')}. Files: <code>src/app/layout.tsx</code>, <code>src/app/(site)/layout.tsx</code>, <code>src/features/marketing/layout/SitePage.tsx</code>, <code>src/app/(site)/page.tsx</code>`],
  ['Hour 3', 'Follow one request end to end, with the files open side by side: a guest\'s Book now on a table hotspot.', `${ch('flows')}. Files: <code>HotspotBookCard.tsx</code> → <code>lib/api.ts requestHere</code> → <code>server/src/routes/reservations.js</code> → <code>server/src/reservations.js</code>`],
  ['Hour 4', 'See the data. Open the data folder (<code>server/src/data</code> in development) and read a space\'s JSON, a published copy (<code>:id@n.json</code>), a website and a reservations file.', `${ch('data')}`],
  ['Hour 5', 'The 3D tour: how a scan loads, how the camera walks, how hotspots follow the view.', `${ch('three')}. Files: <code>App.tsx</code> (<code>Stage</code>), <code>useSceneManager.ts</code>, <code>useLccWalker.ts</code>, <code>sceneDoc.ts</code>, <code>HotspotMarkers.tsx</code>`],
  ['Hour 6', 'The studio: how an edit becomes a save, and a save becomes a publish. Search <code>EditorShell.tsx</code>, don\'t read it top to bottom.', `${ch('flows')} (studio), ${ch('auth')}`],
  ['Hour 7', 'Read the tests as the specification: each test name is a rule the product keeps. Run <code>npm test</code>.', `${ch('tests')}. Files: <code>test/client.test.mjs</code>, <code>server/test/api.test.js</code>`],
  ['Hour 8', 'Make a small change with a recipe, then run the checks.', `${ch('recipes')}, ${ch('rules')}`]
].map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`))}
<h2>Ways to find your way without reading everything</h2>
<ul class="bullets">
<li><b>Search for the URL.</b> Every API call is written once in <code>src/lib/api.ts</code> and once in <code>server/src/routes/</code>. Searching for <code>/requests/tables</code>, for example, finds both ends at once.</li>
<li><b>Every file says what it is for</b> in its first comment. ${ch('modules')} lists them all with that comment, and ${ch('links')} shows who uses each file.</li>
<li><b>Class names tell you the surface:</b> <code>lp-</code> marketing pages, <code>site-</code> the site's shared chrome, <code>ed2-</code> the studio, <code>vw-</code> the tour, <code>hs-</code> hotspots, <code>ws-</code> and <code>[data-style]</code> client websites. Search a class to find its CSS file.</li>
<li><b>CLAUDE.md is the current brief:</b> what works, what is broken and what is next. It is updated with every change.</li>
<li><b>Look, don't guess:</b> <code>node scripts/shot.mjs &lt;url&gt; &lt;out.png&gt;</code> takes a full-page screenshot, which is quicker than imagining what a CSS change does.</li>
</ul>

${h('product', 2)}
<p>A client (a hotel, restaurant, venue, college or heritage site) is a <b>project</b>. Each scanned room or area is a <b>space</b>. A space holds a scan, a start view, <b>hotspots</b> (information, media, links to other spaces, and Book now on tables, rooms and halls), <b>camera tracks</b> (authored flythroughs, stored in <code>tracks</code>), invisible <b>collision boxes</b>, and settings such as day and night versions.</p>
<p>Visitors walk, fly or orbit through a space, open hotspots, and send an <b>enquiry</b> or a <b>booking request</b> without leaving the tour. A project can also have a <b>website</b> at <code>/s/:project</code> (draft, preview, client review link, scheduled publish) with room, table and hall booking, menus, offers, reviews and an FAQ. The team answers everything in the <b>Reservations</b> inbox, and the monthly <b>report</b> shows visits, time spent and the path from visit to confirmed booking.</p>
<p>The feature-by-feature description, with screenshots, is <b>RCAAS-Feature-Book.pdf</b>.</p>

${h('arch', 3)}
<div class="diagram">  Visitor's browser                         Studio (team's browser)
  /  /tour  /t/:project  /s/:project        /studio  /login
          \\                                   /
           \\        Next.js app (src/)       /        port 3000 in development
            '---------------+---------------'
                            | fetch, with a session cookie for the studio
                            v
                  Express API (server/src)                port 4000
                  routes/*  ->  stores  ->  data
                   |            |            |
                   |   JSON files in DATA_DIR  (spaces, projects, websites,
                   |                            bookings, enquiries, stats)
                   |   Postgres app.users       (accounts, when DATABASE_URL is set)
                   |   storage.js: local disk or an S3/R2 bucket (scans, photos)
                   v
     Resend (email)   Sparrow (SMS)   WhatsApp Cloud API   Anthropic (tour concierge)</div>
<h2>Three requests, end to end</h2>
<h3>A visitor opens a tour</h3>
<ol>
<li><code>/tour?space=:id</code> (or <code>/t/:project/:space</code>, which redirects there) renders <code>TourClient</code>, which reads the project's published spaces.</li>
<li><code>GET /api/scenes/:id/published</code> returns the latest snapshot. Drafts are never served to visitors.</li>
<li><code>useSceneManager</code> loads the scan through the LCC SDK from <code>/api/assets/:assetId/…</code> (byte ranges, cached for a year), or a <code>.glb</code> model, or a 360 video. <code>withColliders</code> adds collision boxes.</li>
<li><code>useLccWalker</code> moves the camera (Walk, Fly, Orbit, Viewpoints) and keeps it out of walls. <code>HotspotMarkers</code> draws hotspots projected each frame.</li>
<li>The tour sends visit counts to <code>POST /api/stats</code> (totals only), and an enquiry goes to <code>POST /api/leads</code>, which emails the project's team.</li>
</ol>
<h3>The team edits and publishes a space</h3>
<ol>
<li><code>/studio/:project</code> loads the draft with <code>GET /api/scenes/:id</code>. Access is checked by <code>sceneGuard</code> (<code>server/src/access.js</code>).</li>
<li>Edits change the in-memory scene document in <code>src/features/scene/sceneDoc.ts</code>. <code>history.ts</code> gives undo and redo, and the header shows unsaved changes.</li>
<li>Save sends the whole document with <code>PUT /api/scenes/:id</code>. The server keeps publish fields it owns and never lets a stale tab overwrite them.</li>
<li>Publish (<code>POST /api/scenes/:id/publish</code>) runs <code>publishChecks</code>, then writes <code>scenes/:id@n.json</code> once and never again. Revert, restore and version history work from those files.</li>
</ol>
<h3>A guest asks to book a table from a hotspot</h3>
<ol>
<li>The tour's <code>HotspotBookCard</code> loads free times from <code>GET /api/sites/:project/requests/tables</code>.</li>
<li><code>POST /api/sites/:project/requests</code> checks the hotspot is published in that project, then checks again inside the project's write queue (<code>withReservations</code>) that the table is still free. A clash gets 409.</li>
<li>The request is stored in <code>reservations/:project.json</code>, and the team gets an email and text (<code>notify.js</code>, <code>mailer.js</code>).</li>
<li>The team confirms or declines in Reservations (<code>PATCH /api/sites/:project/reservations/:rid</code>), and the guest is told by text, WhatsApp or email.</li>
</ol>

${h('flows')}
<p>Each table follows one thing a person does, from the button they press to the file the server writes. Left column: the file and the function. Every browser-to-server step goes through <code>src/lib/api.ts</code>, which has one function per endpoint; the server side starts in the router named in the API reference.</p>
${flow('Signing in, and staying signed in', [
  ['<code>features/auth/AuthPanel.tsx</code> · <code>submit</code>', 'The sign-in form on <code>/login</code> calls <code>login(password, email)</code>.'],
  ['<code>lib/api.ts</code> · <code>login</code>', '<code>POST /api/auth/login</code>, with the browser sending and keeping cookies (<code>credentials: include</code>).'],
  ['<code>server/routes/auth.js</code> · <code>/login</code>', 'Rate-limited per IP. <code>verifyUser</code> checks the password (scrypt) against the account.'],
  ['<code>server/usersStore.js</code>', 'Picks the account store: <code>usersStore-pg.js</code> (Postgres <code>app.users</code>) when <code>DATABASE_URL</code> is set, else <code>usersStore-file.js</code> (JSON files).'],
  ['<code>server/middleware/auth.js</code> · <code>issueSession</code>', 'Sets the httpOnly cookie <code>splatspace_session</code>: a signed JWT with the account id, name, email and when it was issued, good for 12 hours.'],
  ['<code>features/auth/useStudioSession.ts</code>, <code>features/auth/useSession.ts</code>', 'Studio pages and the nav ask <code>GET /api/auth/session</code> who is signed in. Signed out, the studio sends you to <code>/login?next=…</code>.'],
  ['<code>server/middleware/auth.js</code> · <code>requireEditorSession</code>, <code>staleReason</code>; <code>server/access.js</code> · <code>freshSession</code>', 'On every studio request: the cookie must be valid, the account must still exist, and the session must be newer than the last password change. The role is read fresh from the account, not from the cookie.']
])}
${flow('A visitor opens a tour', [
  ['<code>app/tour/page.tsx</code>', 'Server part: link-preview tags (<code>lib/shareMeta.ts</code>). It renders <code>TourClient</code>.'],
  ['<code>app/tour/TourClient.tsx</code>', 'Reads the project\'s published spaces (<code>getGallery</code>), its brand (<code>getProjectTheme</code> → <code>lib/uiConfig.ts applyTheme</code>), checks an embed key if framed (<code>checkEmbed</code>), and loads the published scene docs (<code>features/scene/sceneDoc.ts loadSceneDoc</code>).'],
  ['<code>server/routes/scenes.js</code> · <code>GET /:id/published</code>', '<code>store.js getPublishedScene</code> returns the newest snapshot (<code>scenes/:id@n.json</code>). Drafts never reach visitors.'],
  ['<code>features/scene/App.tsx</code> (loaded in the browser only)', '<code>Stage</code> builds the 3D view; <code>App</code> puts the visitor UI (<code>Viewer.tsx</code>) over it. In the studio the same <code>App</code> shows <code>EditorShell.tsx</code> instead.'],
  ['<code>features/scene/useSceneManager.ts</code>', 'Loads the scan through the LCC SDK from <code>/api/assets/:assetId/…</code> (<code>server/routes/assets.js</code> → <code>storage.js</code>, disk or S3/R2), or a .glb (<code>meshModel.ts</code>), or a 360 video (<code>panoModel.ts</code>). Wraps it with <code>collision.ts withColliders</code>.'],
  ['<code>features/scene/useLccWalker.ts</code>', 'Walk, Fly, Orbit: keys, mouse and touch move the camera; <code>collision.ts</code> keeps it out of walls and on the floor.'],
  ['<code>features/hotspots/HotspotMarkers.tsx</code>', 'Each frame, <code>hotspotProjector.ts</code> projects hotspots to the screen; <code>hotspotLayout.ts</code> places their cards. A tap opens <code>HotspotPanel</code>.'],
  ['<code>features/tour/Viewer.tsx</code> → <code>lib/api.ts</code>', 'Visit counts go to <code>POST /api/stats</code> (<code>server/stats.js</code>, totals only).']
])}
${flow('A guest books a table from a hotspot (Book now)', [
  ['<code>features/hotspots/HotspotMarkers.tsx</code> · <code>HotspotPanel</code>', 'A table, room or hall hotspot shows Book now.'],
  ['<code>features/booking/HotspotBookCard.tsx</code>', 'Asks which times are free (<code>getHereTables</code> → <code>GET /api/sites/:id/requests/tables</code>; for a hall <code>getHereHall</code>), then sends the guest\'s answers with <code>requestHere</code>.'],
  ['<code>server/routes/reservations.js</code> · <code>POST /:id/requests</code>', 'Checks the hotspot is published in that project, the day and time are on the hours, and the guests fit. What is booked comes from the published hotspot, never from the request.'],
  ['<code>server/reservations.js</code> · <code>withReservations</code>', 'One write at a time per project: re-checks <code>tableFree</code> (or <code>events.js hallHotspotFree</code>) and appends the request to <code>reservations/:id.json</code>. A clash answers 409.'],
  ['<code>server/routes/reservations.js</code> · <code>tellTheTeam</code> → <code>server/mailer.js sendMail</code>', 'Emails the project\'s team through Resend.'],
  ['<code>app/studio/[property]/reservations/page.tsx</code>', 'The team presses Confirm or Decline: <code>PATCH /api/sites/:id/reservations/:rid</code> re-checks availability, then tells the guest (<code>server/notify.js textGuest</code> by SMS or WhatsApp, and <code>sendMail</code>).']
])}
${flow('A guest books on a client\'s website', [
  ['<code>app/s/[property]/page.tsx</code>', 'Server-rendered: fetches the published website (<code>GET /api/sites/:id</code>, <code>server/routes/sites.js</code>, cleaned by <code>cleanSite</code>) and renders <code>SiteView.tsx</code>.'],
  ['<code>app/s/[property]/SiteView.tsx</code>', 'Lays out the sections: rooms (<code>RoomBooking.tsx</code>), tables (<code>TableBooking.tsx</code>), halls (<code>EventBooking.tsx</code>), menu, offers, reviews, FAQ, map.'],
  ['<code>features/booking/TableBooking.tsx</code>', '<code>getAvailability</code> → <code>GET /api/sites/:id/availability</code>, then <code>reserveTable</code> → <code>POST /api/sites/:id/reservations</code>. Rooms use <code>requestStay</code>, halls <code>requestEvent</code>.'],
  ['<code>server/routes/reservations.js</code> → <code>server/reservations.js</code>, <code>stays.js</code>, <code>events.js</code>', 'The same queue and rules as above: <code>tableFree</code>/<code>bestTable</code>, <code>roomsFree</code>, <code>hallFree</code>.']
])}
${flow('The team edits, saves and publishes a space', [
  ['<code>app/studio/[property]/page.tsx</code>', 'Checks the session (<code>useStudioSession</code>), loads the project\'s spaces, and shows <code>App</code> with <code>EditorShell</code>.'],
  ['<code>features/studio/EditorShell.tsx</code>', 'The tree, inspectors and buttons. Every edit goes through <code>features/scene/sceneDoc.ts</code> (hotspots, colliders, booking), <code>viewpoints.ts</code> (tracks) or <code>transform.ts</code> (model placement); <code>history.ts</code> records undo steps.'],
  ['<code>features/scene/sceneDoc.ts</code> · <code>sceneDocFor</code> → <code>lib/api.ts saveScene</code>', 'Save sends the whole document: <code>PUT /api/scenes/:id</code>.'],
  ['<code>server/routes/scenes.js</code> → <code>access.js sceneGuard</code> → <code>store.js saveScene</code>', 'Checks the account may work on this space (and on the project it goes into), writes <code>scenes/:id.json</code>, and logs it (<code>activity.js record</code>).'],
  ['<code>server/routes/scenes.js</code> · <code>GET /:id/publish</code>, <code>POST /:id/publish</code>', 'The publish panel first shows warnings (<code>publishChecks</code>, <code>missingFiles</code>), then <code>store.js publishScene</code> writes the next numbered snapshot. Visitors see it at once.']
])}
${flow('A visitor sends an enquiry', [
  ['<code>features/enquiry/EnquiryPanel.tsx</code>', 'The form in the tour, on project pages and on client websites calls <code>submitLead</code>.'],
  ['<code>server/routes/leads.js</code> · <code>POST /</code>', 'Rate-limited, checks a bot-trap field and how fast the form was filled, then <code>leadsStore.js saveLead</code>. After the visitor has their answer, <code>sendLeadEmail</code> (<code>mailer.js</code>) emails the project\'s team, and a failed send is recorded on the enquiry.']
])}

${h('setup', 4)}
<pre><code># Node 24 (the tests run TypeScript directly), and Chrome for screenshots and this guide
npm install
cd server && npm install && cd ..
cp server/.env.example server/.env      # set SESSION_SECRET, EMBED_TOKEN_SECRET, EDITOR_PASSWORD
npm run dev                             # starts the API and the site, on free ports</code></pre>
<p>Open the site, go to <code>/login?mode=signup</code> and create an account with the team access code (the <code>EDITOR_PASSWORD</code> you set). The first account ever created becomes the admin.</p>
<ul class="bullets">
<li><b>Scans are not in git.</b> <code>server/src/data/assets/</code> is ignored, so a new checkout has the spaces' JSON but no scans, and those tours show their start screen without 3D (the studio's publish panel warns). Copy the asset folders from another machine, or set <code>ASSET_DRIVER=s3</code> so every machine reads one bucket.</li>
<li><b>Accounts:</b> without <code>DATABASE_URL</code> they are JSON files in <code>DATA_DIR/users</code>. With it (Supabase or any Postgres), they live in <code>app.users</code>. <code>npm run db:import-users</code> (in <code>server/</code>) copies file accounts in.</li>
<li><b>Windows and Git Bash:</b> prefix variables that hold paths with <code>MSYS_NO_PATHCONV=1</code>. There is no Python on the main development PC, so scripts use Node.</li>
<li>After changing the scene loaders (<code>useSceneManager</code>, loader options), hard-reload: the SDK renderer is a page singleton, which is also why React StrictMode is off.</li>
</ul>
<h2>Commands</h2>
${table(['Where', 'Command', 'Runs'], [...scripts('package.json').map(([k, v]) => `<tr><td>root</td><td><code>npm run ${esc(k)}</code></td><td><code>${esc(v)}</code></td></tr>`),
  ...scripts('server/package.json').map(([k, v]) => `<tr><td>server/</td><td><code>npm run ${esc(k)}</code></td><td><code>${esc(v)}</code></td></tr>`),
  '<tr><td>root</td><td><code>npx tsc --noEmit</code></td><td>Type-check the site</td></tr>',
  '<tr><td>root</td><td><code>node scripts/shot.mjs &lt;url&gt; &lt;out.png&gt;</code></td><td>Full-page screenshot through headless Chrome</td></tr>'])}

${h('repo', 5)}
${table(['Folder', 'What is in it'], [
  ['src/app', `Next.js routes. <code>(site)</code> is the marketing site, <code>studio</code> the authoring app, <code>tour</code> and <code>t</code> the tours, <code>s</code> client websites. ${ch('layout')} shows how each page is put together, and ${ch('pages')} lists them all.`],
  ['src/features/auth', 'Sign-in, sign-up, forgot and change password (<code>AuthPanel</code>, <code>PasswordChange</code>), and who is signed in (<code>useSession</code>, <code>useStudioSession</code>).'],
  ['src/features/booking', 'Booking rules (<code>booking.ts</code>) and every booking form: tables, rooms, halls, the waitlist, and Book now on a hotspot (<code>HotspotBookCard</code>).'],
  ['src/features/hotspots', 'Hotspot markers and cards over the 3D view, their icons, and the maths that places them.'],
  ['src/features/scene', 'The 3D engine the tour and the studio share: <code>App.tsx</code> (the canvas), <code>sceneDoc.ts</code> (the scene document), loading scans, models and 360 video, the walker and collision.'],
  ['src/features/tour', 'The visitor\'s UI over the 3D (<code>Viewer.tsx</code>), the floor map and the AI concierge.'],
  ['src/features/enquiry', 'The enquiry form used in the tour, on project pages and on client websites.'],
  ['src/features/studio', 'The studio UI (<code>EditorShell.tsx</code>, about 2,000 lines: search it, don\'t read it whole), gizmos, collision boxes, the uploader and model converter, dialogs, undo history.'],
  ['src/features/website', 'Clients\' websites at <code>/s/:project</code>: <code>SiteView</code>, <code>SiteParts</code>, <code>website.css</code>.'],
  ['src/features/marketing', 'The marketing site: <code>layout/</code> (Navbar, AccountMenu, SitePage, ContactBand, Footer), <code>home/</code> and <code>work/</code> sections, policy pages, and the words (<code>siteContent.ts</code>).'],
  ['src/components/ui', 'Small pieces any page reuses: <code>Button</code>, <code>Section</code>, <code>PageHead</code>, <code>ThemeToggle</code>.'],
  ['src/hooks', 'Reusable React logic that belongs to no one feature: <code>useClickOutside</code>.'],
  ['src/lib', 'Plumbing every feature uses: the API client (<code>api.ts</code>, one function per endpoint), translations, page metadata, theme and brand colours, audio, visit stats.'],
  ['src/@types', 'Shared TypeScript types: hotspots, scenes, viewpoints, uploads, the vendor SDK.'],
  ['src/vendor', 'The XGRIDS LCC Web SDK and its README, the only documentation for it.'],
  ['server/src', 'The API: <code>index.js</code> wires it up, <code>routes/</code> are the endpoints, and the stores (<code>store.js</code>, <code>usersStore*.js</code>, <code>reservations.js</code>, <code>leadsStore.js</code>, <code>stats.js</code>, <code>activity.js</code>) own the data.'],
  ['server/db', 'Postgres migrations, applied in name order when the API starts with <code>DATABASE_URL</code> set.'],
  ['server/scripts', 'One-off tools: make an admin, push assets to the bucket, import accounts into Postgres.'],
  ['server/test, test', 'The API tests (a real server on a free port) and the client tests (pure logic).'],
  ['scripts', '<code>dev.mjs</code> (start both programs), <code>shot.mjs</code> (screenshots), <code>dev-guide.mjs</code> (this document).'],
  ['deploy', 'VPS deploy: <code>deploy.sh</code>, pm2 <code>ecosystem.config.cjs</code>, <code>nginx.conf</code>, and its <code>README.md</code>.'],
  ['public', 'Static files shipped to every visitor. Never put masters here: they go in <code>media-src/</code> (ignored by git).']
].map(([a, b]) => `<tr><td><code>${a}</code></td><td>${b}</td></tr>`))}

${h('layout')}
<p>Next.js builds every page from the folders in <code>src/app</code>. A <code>layout.tsx</code> wraps every page below it and stays on screen while you move between those pages; a <code>page.tsx</code> is one URL. A folder in brackets, like <code>(site)</code>, groups pages under one layout without adding to the URL. That is why the nav never reloads on the marketing site: it lives in the group's layout, not in each page.</p>
<h2>The marketing site</h2>
<div class="tree">src/app/layout.tsx                    every page: &lt;html&gt;, the Inter font, globals.css, the theme
│                                     script (dark or light before first paint), site-wide metadata
└─ src/app/(site)/layout.tsx          the marketing pages: &lt;main class="site lp"&gt; (the scroll
   │                                  container), site.css + landing.css, JSON-LD, and the Navbar
   ├─ features/marketing/layout/Navbar.tsx    stays put while pages change; AccountMenu when signed in
   └─ src/app/(site)/page.tsx         one page, e.g. the home page
      └─ features/marketing/layout/SitePage.tsx   slides in and out between pages, then adds:
         ├─ the page's own sections   home: features/marketing/home/Hero, ScanStory,
         │                            WhyTours, ProvenSpecs, WaysIn, FourSteps, EnquiryBleed, Sectors
         ├─ features/marketing/layout/ContactBand.tsx   "Have a space worth walking?" (contact={false} hides it)
         └─ features/marketing/layout/Footer.tsx        links: add a page to its COLUMNS list</div>
<h2>The tour and the studio</h2>
<div class="tree">src/app/tour/page.tsx → TourClient.tsx → features/scene/App.tsx (browser only)
                                           ├─ Stage: the 3D canvas (scan, camera, hotspots)
                                           └─ Viewer.tsx: the visitor's buttons, panels, enquiry

src/app/studio/layout.tsx (keeps the studio out of search)
├─ studio/page.tsx                 the project list
└─ studio/[property]/page.tsx → features/scene/App.tsx
                                           ├─ Stage: the same 3D canvas
                                           └─ EditorShell.tsx: tree, inspectors, save, publish
   ├─ [property]/site/page.tsx         the website editor
   ├─ [property]/reservations/page.tsx the bookings inbox
   └─ [property]/report/page.tsx       the monthly report</div>
<p>A client's website is <code>src/app/s/[property]/page.tsx</code> → <code>SiteView.tsx</code> (sections) and <code>SiteParts.tsx</code> (smaller pieces), styled by <code>website.css</code> and its three looks. It does not use the marketing site's layout.</p>
<h2>Every page, its layouts and what it puts on screen</h2>
<p>Read from the code on each run. "Layouts" are outermost first; "Shows" are the components the page file imports itself (each of those imports more: see ${ch('links')}).</p>
${table(['URL', 'Layouts', 'Shows'], pageChains().map((p) => `<tr><td><code>${esc(p.url)}</code></td><td>${codeList(p.layouts)}</td><td>${codeList(p.parts)}</td></tr>`), 'links')}

${h('frontend')}
<h2>Where a component goes</h2>
${table(['Folder', 'What goes there'], [
  ['src/features/&lt;feature&gt;', 'Everything one feature needs, together: its components, logic, hooks and CSS. A new feature gets a new folder. Sections of a page get a file each (<code>marketing/home/Hero.tsx</code>, <code>marketing/work/WorkEntry.tsx</code>), with their words in <code>marketing/siteContent.ts</code>.'],
  ['src/components/ui', 'Small pieces any page reuses: <code>Button</code> (every button and button-like link), <code>Section</code> (a band with its heading), <code>PageHead</code> (a page\'s opening banner with its one h1), <code>ThemeToggle</code>.'],
  ['src/hooks', 'Reusable React logic shared by several features: <code>useClickOutside</code>. A hook one feature owns lives in that feature (<code>auth/useSession</code>, <code>scene/useSceneManager</code>).'],
  ['src/lib', 'Plumbing, not features: the API client, translations, page metadata, theme. Pure functions anywhere get a test in <code>test/client.test.mjs</code>.'],
].map(([a, b]) => `<tr><td><code>${a}</code></td><td>${b}</td></tr>`))}
<h2>Buttons</h2>
<p>Use <code>&lt;Button&gt;</code> from <code>components/ui/Button.tsx</code>, never a hand-written class list. With <code>href</code> it is a link (add <code>reload</code> for the tour and the studio, which need a full page load); without it, a <code>&lt;button&gt;</code>.</p>
<pre><code>&lt;Button href="/contact" variant="pill-solid" transitionTypes={['nav-forward']}&gt;Book a capture&lt;/Button&gt;
&lt;Button href="/tour" reload&gt;Walk a live tour&lt;/Button&gt;
&lt;Button type="submit" variant="primary" large disabled={busy}&gt;Sign in&lt;/Button&gt;</code></pre>
${table(['Variant', 'Looks like', 'Use it for'], [
  ['pill', 'Outlined pill', 'Secondary actions on marketing pages: "How it works", "Open the gallery".'],
  ['pill-solid', 'Filled pill in the brand blue', 'The one main action of a section: "Book a capture".'],
  ['primary', 'Filled button in the brand blue', 'The main action in the nav and in forms: "Create account", "Sign in".'],
  ['ghost', 'Outlined button', 'A secondary action next to a primary one.'],
  ['quiet', 'Text-like button', 'A low-key action in the nav: "Sign in".']
].map(([a, b, c]) => `<tr><td><code>${a}</code></td><td>${b}</td><td>${c}</td></tr>`))}
<h2>Colours</h2>
<p>Components never write a colour. They use a token named for its role, and the token is set once for dark and once for light. Each surface has its own set:</p>
${table(['Token (marketing site, on <code>.site</code> in site.css)', 'Role'], [
  ['--bg', 'The page'], ['--panel', 'A card or a field'], ['--raise', 'A tile inside a card; hover fills'],
  ['--line, --line-lit', 'Borders, and borders when hovered'], ['--text, --dim', 'Text, and quieter text'],
  ['--accent', 'The brand blue for text, links and focus lines'], ['--accent-fill, --accent-ink', 'Filled buttons and the current tab, and the text on them'],
  ['--accent-glow', 'The focus halo around fields'], ['--danger, --danger-ink', 'Errors and Log out, and the text on them'], ['--teal, --violet', 'The hero gradient only']
].map(([a, b]) => `<tr><td><code>${a}</code></td><td>${b}</td></tr>`))}
<p>The studio uses the same roles under <code>--ed-*</code> names (<code>editor.css</code>: black and white, with <code>--ed-signal</code> for the selection and <code>--ed-danger</code>). The tour uses <code>--gold</code> and <code>--paper</code> (<code>globals.css</code>, <code>viewer.css</code>) plus the client's brand colour. A client's website takes its brand accent and one of three looks (<code>website.css [data-style]</code>).</p>
<h2>CSS files</h2>
<p>One stylesheet per surface, each with its own class prefix: <code>site.css</code> (<code>site-</code>, shared chrome, tokens), <code>landing.css</code> (<code>lp-</code>, marketing pages), <code>fieldbook.css</code> (Contact and About), <code>editor.css</code> (<code>ed2-</code>), <code>viewer.css</code> (<code>vw-</code>), <code>hotspots.css</code> (<code>hs-</code>), <code>website.css</code> (client websites). A layout or page imports the stylesheets it needs.</p>

${h('rules', 6)}
<p>These come from <code>CLAUDE.md</code> and win over any feature request. Each exists because breaking it caused, or would cause, a real problem.</p>
${claudeList('## 3. Rules that override feature requests')}

${h('data', 7)}
<h2>The data folder</h2>
<p>Everything except scans and accounts is JSON under <code>DATA_DIR</code> (default <code>server/src/data</code>; in production a folder outside the checkout). Each store module is the only code that reads or writes its folder.</p>
${table(['Path', 'Owner', 'Holds'], [
  ['scenes/:id.json', 'store.js', 'A space\'s draft scene document (below).'],
  ['scenes/:id@n.json', 'store.js', 'Published snapshot <i>n</i>. Written once (<code>wx</code>), never changed. Visitors read only these.'],
  ['properties/:id.json', 'store.js', 'A project: title, <code>ownerId</code>, <code>members</code>, <code>staff</code>, brand theme and logo, contact info, enquiry email addresses.'],
  ['sites/:project.json', 'routes/sites.js', '<code>{ draft, published, publishedAt, scheduled?, review? }</code>. <code>cleanSite()</code> is the schema: it trims and defaults every field.'],
  ['reservations/:project.json', 'reservations.js', 'Every booking and waitlist entry, written through one queue per project. <code>kind</code>: <code>table</code>, <code>stay</code> (room), <code>event</code> (hall), <code>request</code> (a hotspot\'s Book now, with <code>of</code>: table, room or hall), <code>wait</code>. Status: requested, confirmed, declined, cancelled; a wait is waiting, notified or removed.'],
  ['leads/', 'leadsStore.js', 'Enquiries from tours and websites.'],
  ['stats/:project/:month.json', 'stats.js', 'Visit totals per space and day, hotspot opens, booking intents. No cookies, IPs or anything personal.'],
  ['activity/', 'activity.js', 'Who did what in each project (published, invited, confirmed).'],
  ['users/', 'usersStore-file.js', 'Accounts when no <code>DATABASE_URL</code> is set, one file per account, named by a hash of the email.'],
  ['assets/:assetId/…', 'storage.js', 'Scans, models, photos, audio, floor plans. Or the S3/R2 bucket with <code>ASSET_DRIVER=s3</code>. Always addressed by asset id, never by path.']
].map(([a, b, c]) => `<tr><td><code>${a}</code></td><td><code>${b}</code></td><td>${c}</td></tr>`))}
<h2>The scene document</h2>
<p>One JSON document per space, renderer-agnostic: nothing in it is specific to the SDK. <code>server/src/migrate.js</code> upgrades old documents when they are read (current version ${esc(/CURRENT_VERSION = (\d+)/.exec(read('server/src/migrate.js'))?.[1])}), and <code>src/features/scene/sceneDoc.ts</code> defaults anything missing when the studio loads one. A new field must survive being absent.</p>
${table(['Field', 'Holds'], [
  ['id, version, title, tagline', 'Identity and the schema version.'],
  ['propertyId, ownerId', 'The project it belongs to, and who created it (decides access while it is in no project).'],
  ['splat', '<code>format</code> (an LCC scan, a <code>.glb</code> model, or 360 video) and <code>variants.high|medium|low</code>, each <code>{ assetId, meta }</code>, where <code>meta</code> is the index file inside the asset.'],
  ['spawn', 'The start view: <code>position</code>, <code>yaw</code>, <code>eyeHeight</code>.'],
  ['hotspots[]', 'Each with <code>id</code>, <code>type</code> (text, image, video, audio, link, portal, table, room, hall), <code>position</code>, <code>radius</code>, <code>label</code> and a <code>payload</code> for its type (media, text, capacity, price, booking link).'],
  ['tracks[]', 'Camera tracks (viewpoints): label, length in <code>seconds</code>, waypoints, thumbnail, optional narration and transcript.'],
  ['colliders[]', 'Invisible collision boxes: position, size, turn.'],
  ['night, building, floor, neighbours', 'The night version of a space, where it sits in a multi-building site, and linked spaces.'],
  ['status, publishedVersion, publishedAt, embed', 'Owned by the publish and embed routes. A studio save can never change them.']
].map(([a, b]) => `<tr><td><code>${a}</code></td><td>${b}</td></tr>`))}
<h2>Postgres</h2>
<p><code>server/src/db.js</code> holds the connection, a <code>tx()</code> helper and <code>migrate()</code>, which applies <code>server/db/*.sql</code> in name order on start and records them in <code>app.schema_migrations</code>. Tables live in the <code>app</code> schema, which Supabase does not expose through its public API, with row-level security on. Nothing is Supabase-specific: moving providers is <code>pg_dump</code> plus a new <code>DATABASE_URL</code>.</p>

${h('auth', 8)}
<ul class="bullets">
<li><b>Sessions:</b> a signed JWT in the httpOnly cookie <code>splatspace_session</code> (12 hours, SameSite=Lax, Secure in production), made by <code>middleware/auth.js</code>. A password change or reset ends every older session, because <code>staleReason</code> compares the token's issue time with the account's <code>passwordChangedAt</code>.</li>
<li><b>Accounts</b> (<code>usersStore.js</code> picks the file or Postgres version): scrypt password hashes with a random salt. Signing up needs the team access code. Password reset is a one-time link (24 hours) made by an admin or emailed by Forgot password.</li>
<li><b>Roles:</b> <b>admin</b> manages team accounts (the Team panel), <b>editor</b> is a team member, and <b>staff</b> is a client's own staff, who can only answer their project's enquiries and bookings. Roles are read fresh from the account on every request, not from the cookie.</li>
<li><b>Projects:</b> visible to their owner and the members they add. Being admin does not show other people's projects. Spaces and assets are judged by their project (<code>access.js</code>: <code>sceneGuard</code>, <code>assetGuard</code>, <code>refuseStaff</code>).</li>
<li><b>Public endpoints</b> (enquiries, bookings, stats, auth) are rate-limited per connection. Forms carry a hidden field and their render time, to turn away bots.</li>
<li><b>Embeds:</b> each space has an embed key and an optional list of allowed sites, checked when <code>/tour</code> is framed by another site.</li>
</ul>

${h('api', 9)}
<p>${routes.length} routes, read from <code>server/src/routes</code> when this guide was built. <b>Access</b>: <i>Public</i> needs nothing; <i>Signed in</i> needs a studio session; <i>with access to it</i> also checks the space or asset belongs to a project you can see; <i>Admin</i> needs the admin role. Routes marked Signed in may check further inside (a project's owner, a staff account's project). The description is the comment above the route in the code. Bodies and replies are JSON unless noted; errors are <code>{ error }</code> with a message meant for people.</p>
${Object.entries(byFile).map(([file, list]) => `<h2><code>routes/${esc(file)}</code></h2>${table(['', 'Path', 'Access', 'What it does'],
  list.map((r) => `<tr><td class="m ${r.method}">${r.method}</td><td><code>${esc(r.path)}</code></td><td>${esc(r.access)}</td><td>${esc(r.about) || '<span class="dim">See the code.</span>'}</td></tr>`), 'api')}`).join('')}
<p>Health check: <code>GET /api/health</code> answers <code>{ ok }</code>, and 503 when the database is set but down.</p>

${h('pages', 10)}
${table(['URL', 'File', 'What it is'], pages().map((p) => `<tr><td><code>${esc(p.url)}</code></td><td><code>${esc(p.file.replace('src/app/', ''))}</code></td><td>${esc(p.about) || '<span class="dim">No header comment.</span>'}</td></tr>`))}

${h('three', 11)}
<ul class="bullets">
<li><b>The renderer</b> is the LCC SDK's, one per page. <code>App.tsx</code> mounts a react-three-fiber canvas (Three.js pinned to r164, the SDK's version) and wires the scene manager, walker, camera director, gizmo, collision boxes and the studio's <code>EditorApi</code>. Objects are built imperatively in <code>useEffect</code>, not with R3F JSX.</li>
<li><b>Loading:</b> <code>useSceneManager.ts</code> loads one space at a time: an LCC scan through the SDK, a <code>.glb</code> through <code>meshModel.ts</code> (with a BVH for collision), or 360 video through <code>panoModel.ts</code>. <code>renderer.root</code> is undocumented but used on purpose: moving it moves the model and its collision together.</li>
<li><b>Quality:</b> <code>deviceTier.ts</code> guesses a tier, then the tour measures frames per second and reloads a lower tier if needed, keeping the visitor's place. LCC streams by level of detail, so scans are never decimated to hit a size.</li>
<li><b>Moving:</b> <code>useLccWalker.ts</code> runs Walk, Fly, Orbit and Viewpoints, with capsule collision (<code>renderer.intersectsCapsule</code>) and floor probes from <code>collision.ts</code>. <code>useCameraDirector.ts</code> plays camera tracks and glides.</li>
<li><b>Hotspots:</b> projected to screen each frame into <code>hotspotProjector.ts</code>, and drawn as DOM by <code>HotspotMarkers.tsx</code> on its own animation frame, so React never re-renders at 60 fps.</li>
<li><b>When WebGL is missing</b> (old phones, some bots), <code>App.tsx</code> keeps the enquiry path working anyway.</li>
<li><b>Testing it:</b> headless Chrome renders splats in software at about 1.6 fps, so judge motion on a real GPU. In development, <code>window.__camera</code> exposes the camera for checking positions.</li>
</ul>

${h('modules', 12)}
<p>Every source file and the first comment in it, read when this guide was built. A file without a comment is a hint that one is owed.</p>
${readdirSync(path.join(ROOT, 'src/features')).sort().map((f) => `<h2>Feature: <code>src/features/${f}</code></h2>${moduleTable(modules(`src/features/${f}`))}`).join('\n')}
<h2>Shared: <code>src/components/ui</code>, <code>src/hooks</code>, <code>src/lib</code></h2>${moduleTable([...modules('src/components'), ...modules('src/hooks'), ...modules('src/lib')])}
<h2>Route files: <code>src/app</code></h2>${moduleTable(modules('src/app'))}
<h2>API: <code>server/src</code></h2>${moduleTable(modules('server/src'))}
<h2>Scripts</h2>${moduleTable([...modules('scripts'), ...modules('server/scripts')])}

${h('links')}
<p>Every source file, what it uses from this repository and what uses it, read from the import lines on each run. Use it to answer "if I change this file, what can break?" (look at "Used by") and "where does this data come from?" (follow "Uses"). Packages and stylesheets are left out.</p>
${table(['File', 'Uses', 'Used by'], graph.files.filter((f) => !f.startsWith('src/app/') || /(page|layout)\.tsx$|Client\.tsx$|View\.tsx$|Parts\.tsx$/.test(f))
  .map((f) => `<tr><td><code>${esc(short(f))}</code></td><td>${codeList(graph.uses[f])}</td><td>${codeList(graph.usedBy[f])}</td></tr>`), 'links')}

${h('tests', 13)}
<ul class="bullets">
<li><code>npm test</code> runs the client tests (<code>test/client.test.mjs</code>: pure logic, TypeScript imported directly) and then the API tests twice, once storing files on disk and once on a fake S3 (<code>API_TEST_STORAGE=s3</code>).</li>
<li>The API tests start a real server on a free port with a temporary <code>DATA_DIR</code>, and fake mail, SMS, WhatsApp and Anthropic servers that record what was sent. They set <code>DATABASE_URL</code> themselves, so they never touch the database in <code>server/.env</code>; set <code>API_TEST_DATABASE_URL</code> to run them against a throwaway Postgres.</li>
<li>New pure logic gets one assert-style test in <code>test/client.test.mjs</code>. A new endpoint gets its behaviour, its refusals and its access checked in <code>server/test/api.test.js</code>.</li>
<li>Every string shown in the tour needs Nepali and Chinese in <code>i18n.ts</code>; a test fails otherwise.</li>
<li>CI (<code>.github/workflows/ci.yml</code>) runs lint, types, tests and a production build on every push and pull request.</li>
</ul>

${h('config', 14)}
<h2>API settings: <code>server/.env</code></h2>
${table(['Setting', 'Example', 'What it does'], envVars().map((e) => `<tr><td><code>${esc(e.key)}</code></td><td><code>${esc(e.example)}</code></td><td>${esc(e.about)}</td></tr>`))}
<h2>Site settings</h2>
${table(['Setting', 'What it does'], [
  ['NEXT_PUBLIC_API_URL', 'Where the site finds the API. In production, the public domain (nginx sends <code>/api</code> to the API). <code>npm run dev</code> sets it.'],
  ['NEXT_PUBLIC_SITE_URL', 'The public address, for canonical links, <code>sitemap.xml</code>, <code>robots.txt</code> and <code>llms.txt</code>. Falls back to the API URL in production.'],
  ['NEXT_DIST_DIR', 'Build folder, so a second dev server or a test build doesn\'t collide with <code>.next</code>.']
].map(([a, b]) => `<tr><td><code>${a}</code></td><td>${b}</td></tr>`))}

${h('deploy', 15)}
<p>One Linux VPS runs both programs under pm2, behind nginx with HTTPS. Scans live in a Cloudflare R2 bucket (<code>ASSET_DRIVER=s3</code>), so the server's disk holds only JSON in a <code>DATA_DIR</code> outside the checkout. The full steps are in <code>deploy/README.md</code>.</p>
<ul class="bullets">
<li>Pushes to <code>main</code> that pass CI deploy themselves over SSH once the repository has the <code>DEPLOY_*</code> secrets; until then that job is skipped.</li>
<li>Database migrations run when the API starts. There is nothing to run by hand.</li>
<li>Put Cloudflare in front and add a cache rule for <code>/api/assets/*</code>: scan files are sent with a one-year immutable cache header.</li>
<li>Back up <code>DATA_DIR</code> daily (and the database, if used). Scans are already in the bucket.</li>
</ul>

${h('recipes', 16)}
<h3>Add an API endpoint</h3>
<p>Add it to the right file in <code>server/src/routes/</code>, guard it (<code>requireEditorSession</code>, then <code>sceneGuard</code> or a project check), keep data access in a store module, write a comment above it (it becomes its description in this guide), and test it in <code>server/test/api.test.js</code>, refusals included.</p>
<h3>Add a field to the scene document</h3>
<p>Default it when absent, in <code>sceneDoc.ts</code> on load or in <code>migrate.js</code>. Sanitise any number that reaches the camera. Keep SDK concepts out of the schema. If a visitor needs it, make sure it survives publishing.</p>
<h3>Add a studio edit</h3>
<p>Add a store to <code>sceneDoc.ts</code> (load it in <code>loadSceneDoc</code>, write it in <code>sceneDocFor</code>), an entry in the history snapshot, and the UI in <code>EditorShell.tsx</code>.</p>
<h3>Add a database table</h3>
<p>Add <code>server/db/00N_name.sql</code> (tables in the <code>app</code> schema, row-level security on), and keep the store's exports the same as its file version so routes don't change.</p>
<h3>Add a marketing page</h3>
<p>Add <code>src/app/(site)/name/page.tsx</code> with a <code>canonical</code>, render it inside <code>SitePage</code>, and add its path to <code>PAGES</code> in <code>src/app/sitemap.xml/route.ts</code>.</p>
<h3>Change a tour string</h3>
<p>Wrap it in <code>t('…')</code> and add Nepali and Chinese to <code>i18n.ts</code>.</p>
<h3>Before you finish</h3>
<pre><code>npx tsc --noEmit &amp;&amp; npm test &amp;&amp; npm run lint
npm run docs:dev-guide        # if routes, modules or settings changed</code></pre>
<p>Then update <code>CLAUDE.md</code>, section 4, in the same change: a feature added, fixed or broken lands under Working, Needs fixing or Next up.</p>

${h('improve')}
<p>The code works and is tested, but a few places make it harder to learn and to change than it needs to be. In order of how much each would help:</p>
<ol>
<li><b>Split the studio's one big file.</b> <code>EditorShell.tsx</code> is about 2,000 lines: the top bar, the scene tree, every inspector, publishing and the account menu. Move each into its own file under the studio feature folder (<code>SceneTree</code>, <code>HotspotInspector</code>, <code>ColliderInspector</code>, <code>TrackInspector</code>, <code>PublishPanel</code>, <code>StudioAccount</code>), as the marketing site's sections were split on 2026-10-05. Do <code>Viewer.tsx</code> the same way. This is the single biggest help to a new developer.</li>
<li><b>One source for rules both sides use.</b> Booking rules exist twice: in the browser (<code>booking.ts</code>) and on the server (<code>reservations.js</code>, <code>stays.js</code>, <code>events.js</code>). When they drift, guests see errors: the Book now card picks "today" from the visitor's clock while the server uses the venue's (found 2026-10-05). Move the shared rules into one module both import.</li>
<li><b>Type the server.</b> The API is plain JavaScript. Adding <code>// @ts-check</code> and JSDoc types to the stores and routes, or moving to TypeScript one file at a time, would catch wrong field names before a guest does.</li>
<li><b>Move the rest of the data to Postgres,</b> one store at a time behind the same exports, bookings first. Today the per-project write queue (<code>withReservations</code>) only works with one server process, and a database transaction would remove that limit.</li>
<li><b>Browser tests for the money paths.</b> The unit and API tests are strong. Add a few Playwright tests that click through sign-in, publishing, Book now and a website booking, so a layout change can't silently break them.</li>
<li><b>Errors you can see.</b> Before launch, add error reporting for the browser and the API, and an uptime check, so a broken booking form is noticed in minutes, not days.</li>
<li><b>Keep the documents honest automatically.</b> Run <code>npm run docs:dev-guide</code> in CI and fail the build when a route or a file has no comment explaining it.</li>
</ol>

${h('gaps', 17)}
<p>From <code>CLAUDE.md</code>, "Needs fixing", when this guide was built:</p>
${claudeList('### Needs fixing')}
</body></html>`;

/* ------------------------------------------------------------ printing */

const dir = mkdtempSync(path.join(tmpdir(), 'dev-guide-'));
const page = path.join(dir, 'guide.html');
writeFileSync(page, html);
if (process.env.DEV_GUIDE_HTML) writeFileSync(process.env.DEV_GUIDE_HTML, html); // to look at it in a browser
const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}/profile`, 'about:blank'
], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await wait(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* starting */ }
  }
  if (!target) throw new Error('Chrome did not start. Set CHROME to its path.');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  let loaded = false;
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Page.loadEventFired') loaded = true;
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  });
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send('Page.enable');
  await send('Page.navigate', { url: 'file:///' + page.replace(/\\/g, '/') });
  for (let i = 0; i < 100 && !loaded; i++) await wait(100);
  const pdf = await send('Page.printToPDF', {
    printBackground: true, preferCSSPageSize: true, generateDocumentOutline: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;padding:0 17mm;font:7.5px Segoe UI,sans-serif;color:#7a7f8a;display:flex;justify-content:space-between"><span>RCAAS.tech Developer Guide</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>'
  });
  if (!pdf.result?.data) throw new Error('Printing failed: ' + JSON.stringify(pdf.error ?? pdf));
  writeFileSync(OUT, Buffer.from(pdf.result.data, 'base64'));
  ws.close();
  console.log(`${path.relative(ROOT, OUT)}: ${routes.length} API routes, commit ${commit}`);
} finally {
  chrome.kill();
  await wait(500);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Chrome may still hold its profile */ }
}
