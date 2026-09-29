#!/usr/bin/env node
// Derive the compact land strip used by the Earth Eye globe mark from
// Natural Earth 1:110m land (public domain, naturalearthdata.com).
// Usage: node scripts/brand/derive-land.mjs /path/to/ne_110m_land.geojson
// Output: scripts/brand/land-strip.json — rings in unit coordinates:
//   u = (lon + 180) / 360  ∈ [0,1)   (horizontal, one full turn)
//   v = sin(lat)           ∈ [-1,1]  (orthographic vertical)
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('pass the ne_110m_land.geojson path');
const gj = JSON.parse(fs.readFileSync(src, 'utf8'));

function dp(points, eps) {
  if (points.length < 3) return points;
  let maxD = 0, idx = 0;
  const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [points[0], points[points.length - 1]];
  return [...dp(points.slice(0, idx + 1), eps).slice(0, -1), ...dp(points.slice(idx), eps)];
}
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2); };

const rings = [];
for (const f of gj.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const outer = poly[0];
    const maxLat = Math.max(...outer.map((p) => p[1]));
    if (maxLat < -55) continue; // Antarctica reads as a smudge at logo size
    const pts = outer.map(([lon, lat]) => [(lon + 180) / 360, Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180)]);
    // simplify in a space where u is stretched ×2 (strip is 2:1 wide vs tall-ish)
    const scaled = pts.map(([u, v]) => [u * 4, v]);
    // closed ring: simplify the two halves separately (DP needs distinct endpoints)
    const mid = Math.floor(scaled.length / 2);
    const halves = [...dp(scaled.slice(0, mid + 1), 0.004).slice(0, -1), ...dp(scaled.slice(mid), 0.004).slice(0, -1)];
    const simp = halves.map(([u, v]) => [Math.round((u / 4) * 10000) / 10000, Math.round(v * 10000) / 10000]);
    if (simp.length < 4 || area(simp.map(([u, v]) => [u * 4, v])) < 0.0006) continue;
    rings.push(simp);
  }
}
const out = {
  source: 'Natural Earth 1:110m land (ne_110m_land), public domain — https://www.naturalearthdata.com/',
  projection: 'u=(lon+180)/360, v=sin(lat); Antarctica omitted; Douglas-Peucker simplified',
  rings,
};
const dest = path.join(path.dirname(new URL(import.meta.url).pathname), 'land-strip.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`${rings.length} rings, ${rings.reduce((n, r) => n + r.length, 0)} points → ${dest}`);
