// A full-page screenshot at a real viewport, through Chrome's DevTools protocol
// (no Puppeteer): for checking a page's design. Pages scroll inside their own
// container (globals.css locks body for the 3D app), so this unlocks it,
// shows every scroll-revealed section and loads the lazy photos first.
// node scripts/shot.mjs <url> <out.png> [width=1440] [height=900] [mobile]
// CHROME=<path> if Chrome isn't in its usual Windows place.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, out, w = '1440', h = '900', mobile] = process.argv.slice(2);
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--user-data-dir=${process.env.TEMP || '/tmp'}/cdp-prof-${port}`, 'about:blank'
], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await wait(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } else events.push(d.method);
});
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });

await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: !!mobile });
await send('Page.enable');
await send('Page.navigate', { url });
for (let i = 0; i < 300 && !events.includes('Page.loadEventFired'); i++) await wait(100);
await wait(3000);
// The site scrolls inside .ws; let the document scroll instead, show every section, and load the lazy photos.
await send('Runtime.evaluate', { expression: `
  const s = document.createElement('style');
  s.textContent = 'html,body,#root{height:auto!important;overflow:visible!important;position:static!important} .ws{position:static!important;overflow:visible!important;height:auto!important} .ws-reveal{opacity:1!important;transform:none!important;translate:none!important} .ws-hero-img{animation:none!important}';
  document.head.appendChild(s);
  document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; });
` });
await wait(4000);
const { contentSize } = await send('Page.getLayoutMetrics');
const shot = await send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: +w, height: Math.min(contentSize.height, 16000), scale: 1 }
});
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(out, Math.round(contentSize.height));
ws.close();
chrome.kill();
