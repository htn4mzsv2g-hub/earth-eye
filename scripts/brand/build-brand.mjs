#!/usr/bin/env node
/**
 * Earth Eye brand assets — one source of truth for the wordmark geometry.
 *
 * Faithful vector redraw of Ruben's wordmark (public/brand/eartheye-wordmark.png):
 * outlined techno capitals "EARTH" · globe with two crossing orbit rings and
 * satellite ticks · "EYE". Monochrome only.
 *
 * Writes:
 *   public/brand/eartheye-wordmark.svg        static, original colours (black outline, white fill)
 *   public/brand/eartheye-wordmark-dark.svg   static, for dark backgrounds
 *   public/brand/eartheye-wordmark-animated.svg  standalone animated version (for <img>/docs)
 *   public/brand/eartheye-mark.svg            globe mark only (dark)
 *   public/logo.svg                           globe mark with #globe / #globe_cage ids (logoGaze)
 *   public/favicon.svg, public/favicon-32.png, public/apple-touch-icon.png,
 *   public/brand/icon-192.png, public/brand/icon-512.png, public/brand/og-eartheye.png
 *   src/ui/templates/scene-chrome.html        inline animated header wordmark (between markers)
 *
 * Animation (header + animated file): SVG/CSS only, no JS loop.
 *   - EARTH / EYE letters and the orbit rings are static.
 *   - Continents scroll inside the globe clip (CSS transform, 90 s per turn).
 *   - Satellite ticks ride the ring paths with SMIL <animateMotion> (28 s / 36 s, linear).
 *   - prefers-reduced-motion: moving parts hidden, static twins shown.
 *
 * Land: Natural Earth 1:110m (public domain), see scripts/brand/land-strip.json.
 * Usage: node scripts/brand/build-brand.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const P = (...p) => path.join(ROOT, ...p);
const land = JSON.parse(fs.readFileSync(P('scripts/brand/land-strip.json'), 'utf8'));

// ---------------------------------------------------------------- geometry
const LETTERS = {
  E: { w: 92, d: 'M4 0H92L84 11H0Z M0 20H80L72 31H12V49H80L90 60H0Z' },
  A: { w: 100, d: 'M0 60L44 0H56L100 60H86L50 12L14 60Z' },
  R: { w: 86, d: 'M0 0H68A18 18 0 0 1 68 36H60L86 60H70L46 36H12V60H0Z M12 11H68A7 7 0 0 1 68 25H12Z' },
  T: { w: 100, d: 'M0 0H100L92 11H56V60H44V11H8Z' },
  H: { w: 88, d: 'M0 0H12V24H76V0H88V60H76V35H12V60H0Z' },
  Y: { w: 100, d: 'M0 0H16L50 30L84 0H100L56 40V60H44V40Z' },
};
const GAP = 16;
function word(text, x0) {
  let x = x0;
  const parts = [];
  for (const ch of text) {
    const L = LETTERS[ch];
    parts.push(`<path transform="translate(${x} 0)" d="${L.d}"/>`);
    x += L.w + GAP;
  }
  return { markup: parts.join(''), end: x - GAP };
}
const earth = word('EARTH', 0);
const CX = earth.end + 112; // globe centre
const CY = 30;
const R = 44;
const eye = word('EYE', CX + 112);
const VB = { x: -6, y: -22, w: eye.end + 12, h: 104 };

// rings: [rx, ry, rotation°]
const RINGS = [
  { id: 'a', rx: 96, ry: 33, rot: -16, dur: 36, begin: 0 },
  { id: 'b', rx: 90, ry: 28, rot: -9, dur: 28, begin: -17 },
];
const ellipsePath = (rx, ry) => `M${rx} 0A${rx} ${ry} 0 1 1 ${-rx} 0A${rx} ${ry} 0 1 1 ${rx} 0Z`;

// land strip → path in globe-local units, one full turn = W wide
const W = 4 * R; // 180° across the visible disc
const landD = land.rings
  .map((ring) => 'M' + ring.map(([u, v]) => `${((u - 0.5) * W).toFixed(1)} ${(-v * R * 0.97).toFixed(1)}`).join('L') + 'Z')
  .join('');
const LAND_OFFSET = (70 / 360) * W; // start with the Americas facing the viewer, like the artwork

// ---------------------------------------------------------------- themes
const THEMES = {
  light: { stroke: '#0a0a0a', fill: '#ffffff', globe: '#0a0a0a', land: '#ffffff', tubeOuter: '#0a0a0a', tubeInner: '#ffffff', bg: null, rim: '#0a0a0a' },
  dark: { stroke: '#e9eef1', fill: 'rgba(233,238,241,0.04)', globe: '#05080a', land: '#dfe6ea', tubeOuter: '#e9eef1', tubeInner: '#070b0e', bg: null, rim: '#e9eef1' },
};

/**
 * Build the wordmark SVG.
 * @param {object} o
 * @param {'light'|'dark'} o.theme
 * @param {boolean} o.animated
 * @param {string} o.prefix  id prefix (unique per document)
 * @param {boolean} o.standalone  include xmlns + <title>
 */
function wordmark({ theme = 'dark', animated = false, prefix = 'ee', standalone = true, extraAttrs = '' } = {}) {
  const t = THEMES[theme];
  const id = (s) => `${prefix}-${s}`;
  const sw = 2.6;
  const ringDefs = RINGS.map((r) => `<path id="${id('orbit-' + r.id)}" d="${ellipsePath(r.rx, r.ry)}"/>`).join('');
  const tube = (r) => `<use href="#${id('orbit-' + r.id)}" fill="none" stroke="${t.tubeOuter}" stroke-width="9"/><use href="#${id('orbit-' + r.id)}" fill="none" stroke="${t.tubeInner}" stroke-width="4.2"/>`;
  // satellite tick: a small bar across the tube
  const tick = `<rect x="-3.6" y="-7.5" width="7.2" height="15" rx="1.2" fill="${t.tubeInner}" stroke="${t.tubeOuter}" stroke-width="1.8"/>`;
  const staticSat = (r, frac) => {
    const a = frac * 2 * Math.PI;
    const x = r.rx * Math.cos(a), y = r.ry * Math.sin(a);
    const ang = (Math.atan2(r.ry * Math.cos(a), -r.rx * Math.sin(a)) * 180) / Math.PI;
    return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${ang.toFixed(1)})">${tick}</g>`;
  };
  // artwork positions: ring a tick upper-right, ring b tick lower-left
  const STATIC_POS = { a: 0.89, b: 0.41 };
  const movingSat = (r) =>
    `<g>${tick}<animateMotion dur="${r.dur}s" begin="${r.begin}s" repeatCount="indefinite" rotate="auto" calcMode="linear"><mpath href="#${id('orbit-' + r.id)}"/></animateMotion></g>`;
  const sats = (r) =>
    animated
      ? `<g class="ee-sat-moving">${movingSat(r)}</g><g class="ee-sat-static">${staticSat(r, STATIC_POS[r.id])}</g>`
      : staticSat(r, STATIC_POS[r.id]);
  const ringLayer = (front) =>
    RINGS.map(
      (r) =>
        `<g transform="translate(${CX} ${CY}) rotate(${r.rot})"${front ? ` clip-path="url(#${id('front')})"` : ''}>${tube(r)}${sats(r)}</g>`,
    ).join('');

  const landUse = [-1, 0, 1].map((k) => `<use href="#${id('land')}" x="${(LAND_OFFSET + k * W).toFixed(1)}"/>`).join('');
  const style = animated
    ? `<style>
.ee-land-spin{animation:ee-spin 90s linear infinite;will-change:transform}
@keyframes ee-spin{from{transform:translateX(0)}to{transform:translateX(${W}px)}}
.ee-sat-static{display:none}
.ee-paused .ee-land-spin{animation-play-state:paused}
@media (prefers-reduced-motion: reduce){.ee-land-spin{animation:none}.ee-sat-moving{display:none}.ee-sat-static{display:inline}}
</style>`
    : '';
  const head = standalone
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" role="img" aria-labelledby="${id('title')}"${extraAttrs}><title id="${id('title')}">Earth Eye</title>`
    : `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" role="img" aria-label="Earth Eye"${extraAttrs}>`;
  return `${head}${style}<defs>${ringDefs}<path id="${id('land')}" d="${landD}"/>
<clipPath id="${id('globe-clip')}"><circle cx="0" cy="0" r="${R - 1}"/></clipPath>
<clipPath id="${id('front')}"><rect x="-140" y="0" width="280" height="80"/></clipPath>
<radialGradient id="${id('shade')}" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></radialGradient>
</defs>
<g class="ee-letters" fill="${t.fill}" stroke="${t.stroke}" stroke-width="${sw}" stroke-linejoin="round" fill-rule="evenodd">${earth.markup}${eye.markup}</g>
<g class="ee-orbits-back">${ringLayer(false)}</g>
<g class="ee-globe" transform="translate(${CX} ${CY})">
<circle r="${R}" fill="${t.globe}"/>
<g clip-path="url(#${id('globe-clip')})"><g class="ee-land-spin" fill="${t.land}">${landUse}</g></g>
<circle r="${R - 1}" fill="url(#${id('shade')})"/>
<circle r="${R}" fill="none" stroke="${t.rim}" stroke-width="${sw}"/>
</g>
<g class="ee-orbits-front">${ringLayer(true)}</g>
</svg>`;
}

/** Square globe mark (favicon / app icon / logoGaze logo). */
function mark({ theme = 'dark', bg = true, size = 512, ids = false } = {}) {
  const t = THEMES[theme];
  const pad = 10;
  const box = 2 * (RINGS[0].rx + pad);
  const s = box;
  const tube = (r) => `<path d="${ellipsePath(r.rx, r.ry)}" fill="none" stroke="${t.tubeOuter}" stroke-width="9"/><path d="${ellipsePath(r.rx, r.ry)}" fill="none" stroke="${t.tubeInner}" stroke-width="4"/>`;
  const tick = (r, frac) => {
    const a = frac * 2 * Math.PI;
    const x = r.rx * Math.cos(a), y = r.ry * Math.sin(a);
    const ang = (Math.atan2(r.ry * Math.cos(a), -r.rx * Math.sin(a)) * 180) / Math.PI;
    return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${ang.toFixed(1)})"><rect x="-4.5" y="-9" width="9" height="18" rx="1.5" fill="${t.tubeInner}" stroke="${t.tubeOuter}" stroke-width="2.2"/></g>`;
  };
  const pos = { a: 0.89, b: 0.41 };
  const rings = (front) =>
    RINGS.map((r) => `<g transform="rotate(${r.rot})"${front ? ' clip-path="url(#m-front)"' : ''}>${tube(r)}${tick(r, pos[r.id])}</g>`).join('');
  const landUse = [-1, 0, 1].map((k) => `<use href="#m-land" x="${(LAND_OFFSET + k * W).toFixed(1)}"/>`).join('');
  const R2 = R * 1.25;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-s / 2} ${-s / 2} ${s} ${s}" width="${size}" height="${size}" role="img" aria-labelledby="m-title"><title id="m-title">Earth Eye</title>
<defs><path id="m-land" d="${landD}"/><clipPath id="m-clip"><circle r="${R - 1}"/></clipPath><clipPath id="m-front"><rect x="-140" y="0" width="280" height="80"/></clipPath>
<radialGradient id="m-shade" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></radialGradient></defs>
${bg ? `<rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${s * 0.18}" fill="#05080a"/>` : ''}
<g transform="scale(${(R2 / R).toFixed(3)})">
<g${ids ? ' id="globe_cage"' : ''}>${rings(false)}</g>
<g${ids ? ' id="globe"' : ''}><circle r="${R}" fill="${t.globe}"/><g clip-path="url(#m-clip)" fill="${t.land}">${landUse}</g><circle r="${R - 1}" fill="url(#m-shade)"/><circle r="${R}" fill="none" stroke="${t.rim}" stroke-width="2.6"/></g>
<g>${rings(true)}</g>
</g></svg>`;
}

// ---------------------------------------------------------------- write
fs.mkdirSync(P('public/brand'), { recursive: true });
const write = (rel, s) => { fs.writeFileSync(P(rel), s); console.log('wrote', rel, s.length); };

write('public/brand/eartheye-wordmark.svg', wordmark({ theme: 'light', prefix: 'eel' }));
write('public/brand/eartheye-wordmark-dark.svg', wordmark({ theme: 'dark', prefix: 'eed' }));
write('public/brand/eartheye-wordmark-animated.svg', wordmark({ theme: 'dark', animated: true, prefix: 'eea' }));
write('public/brand/eartheye-mark.svg', mark({ theme: 'dark', bg: false }));
write('public/logo.svg', mark({ theme: 'dark', bg: false, ids: true }));
write('public/favicon.svg', mark({ theme: 'dark', bg: true, size: 64 }));

// header snippet
const header = wordmark({ theme: 'dark', animated: true, prefix: 'eeh', standalone: false, extraAttrs: ' class="ee-wordmark-svg" focusable="false"' });
const tplPath = P('src/ui/templates/scene-chrome.html');
let tpl = fs.readFileSync(tplPath, 'utf8');
const START = '<!-- earth-eye:wordmark:start (generated by scripts/brand/build-brand.mjs) -->';
const END = '<!-- earth-eye:wordmark:end -->';
const re = /<!-- earth-eye:wordmark:start[\s\S]*?<!-- earth-eye:wordmark:end -->/;
if (!re.test(tpl)) throw new Error('scene-chrome.html is missing the earth-eye:wordmark markers');
tpl = tpl.replace(re, `${START}\n${header}\n    ${END}`);
fs.writeFileSync(tplPath, tpl);
console.log('updated src/ui/templates/scene-chrome.html');

// rasters
const png = async (svg, size, rel) => { await sharp(Buffer.from(svg)).resize(size, size).png().toFile(P(rel)); console.log('wrote', rel); };
const markBg = mark({ theme: 'dark', bg: true, size: 512 });
await png(markBg, 32, 'public/favicon-32.png');
await png(markBg, 180, 'public/apple-touch-icon.png');
await png(markBg, 192, 'public/brand/icon-192.png');
await png(markBg, 512, 'public/brand/icon-512.png');

// OG image 1200×630
const wmDark = wordmark({ theme: 'dark', prefix: 'og' });
const wmW = 1040, wmH = Math.round((wmW * VB.h) / VB.w);
const wmPng = await sharp(Buffer.from(wmDark.replace('<svg ', `<svg width="${wmW}" height="${wmH}" `))).png().toBuffer();
const ogBg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#111a1f"/><stop offset="1" stop-color="#030506"/></radialGradient>
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity="0.04"/></pattern></defs>
<rect width="1200" height="630" fill="url(#g)"/><rect width="1200" height="630" fill="url(#grid)"/>
<text x="600" y="430" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="26" letter-spacing="8" fill="#c9d3d8">PUBLIC SIGNALS · ONE GLOBE</text>
<text x="600" y="560" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="22" letter-spacing="4" fill="#7f8b91">eartheye.us</text>
</svg>`;
await sharp(Buffer.from(ogBg))
  .composite([{ input: wmPng, left: Math.round((1200 - wmW) / 2), top: 210 }])
  .png()
  .toFile(P('public/brand/og-eartheye.png'));
console.log('wrote public/brand/og-eartheye.png');
