// Builds public/media/globe-land.bin: the dots of the home page's point-cloud globe.
// Evenly spread points (a Fibonacci sphere) are kept where they fall on land, using
// Natural Earth's public-domain coastlines (world-atlas land-110m, fetched once).
// File: Int16 pairs, latitude and longitude in hundredths of a degree.
//   node scripts/build-globe.mjs [points on the whole sphere, default 42000]
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const N = Number(process.argv[2]) || 42000;
const OUT = path.resolve(import.meta.dirname, '../public/media/globe-land.bin');
const topo = await (await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')).json();

// TopoJSON → rings of [lon, lat]: arcs are delta-encoded, quantised integers
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
});
const ringOf = (ids) => ids.flatMap((i, k) => {
  const pts = i < 0 ? [...arcs[~i]].reverse() : arcs[i];
  return k ? pts.slice(1) : pts;
});
const polygons = topo.objects.land.geometries.flatMap((g) => (g.type === 'Polygon' ? [g.arcs] : g.arcs));
const rings = polygons.flat().map((ids) => {
  const pts = ringOf(ids);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { pts, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
});

// even-odd over every ring: holes (lakes, seas inside land) toggle back to water
function onLand(lon, lat) {
  let inside = false;
  for (const r of rings) {
    if (lon < r.minX || lon > r.maxX || lat < r.minY || lat > r.maxY) continue;
    const p = r.pts;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i][1] > lat) !== (p[j][1] > lat) && lon < ((p[j][0] - p[i][0]) * (lat - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
    }
  }
  return inside;
}

const out = [];
const golden = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < N; i++) {
  const y = 1 - (2 * (i + 0.5)) / N;
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lon = ((((i * golden * 180) / Math.PI) % 360) + 540) % 360 - 180;
  if (onLand(lon, lat)) out.push(Math.round(lat * 100), Math.round(lon * 100));
}
writeFileSync(OUT, Buffer.from(new Int16Array(out).buffer));
console.log(`${out.length / 2} land points of ${N} → ${path.relative(process.cwd(), OUT)} (${(out.length * 2 / 1024).toFixed(1)} KB)`);
