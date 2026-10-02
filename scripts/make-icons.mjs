// Renders the app icons and the favicon from one design (a plate with a fork and a knife on bright blue) with
// the browser that Playwright already installs. Run once after changing the design: node scripts/make-icons.mjs
//
// Writes: public/icons/{icon.svg,icon-192.png,icon-512.png,maskable-512.png,apple-touch-icon.png}, public/favicon.ico
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BLUE = '#3b82f6';
const WHITE = '#ffffff';

/** The plate, fork and knife. `bold` = thicker strokes so it stays readable at 16-32 px. */
function cutlery(bold) {
  const t = bold ? 20 : 12; // fork tines
  const h = bold ? 30 : 18; // handles
  const tines = bold ? [106, 138] : [104, 122, 140];
  const plateInner = bold ? 52 : 60;
  return `
    <circle cx="256" cy="256" r="94" fill="${WHITE}"/>
    <circle cx="256" cy="256" r="${plateInner}" fill="${BLUE}"/>
    <g stroke="${WHITE}" stroke-linecap="round" fill="none">
      <path d="${tines.map((x) => `M${x} 146 V214`).join(' ')}" stroke-width="${t}"/>
      <path d="M${tines[0]} 214 Q122 246 ${tines[tines.length - 1]} 214" stroke-width="${t}"/>
      <path d="M122 236 V372" stroke-width="${h}"/>
      <path d="M392 372 V262" stroke-width="${h}"/>
    </g>
    <path d="M392 146 C436 176 436 246 392 266 Z" fill="${WHITE}"/>`;
}

/** `rounded` = rounded corners; `scale` shrinks the drawing toward the middle (room for masks). */
const svg = ({
  rounded,
  scale = 1,
  bold = false,
}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${BLUE}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${cutlery(bold)}</g>
</svg>`;

const png = [
  { file: 'public/icons/icon-192.png', size: 192, svg: svg({ rounded: true }) },
  { file: 'public/icons/icon-512.png', size: 512, svg: svg({ rounded: true }) },
  // Maskable: the OS crops it to a circle or squircle, so everything stays inside the central 80%.
  { file: 'public/icons/maskable-512.png', size: 512, svg: svg({ rounded: false, scale: 0.9 }) },
  // iOS rounds the corners itself.
  {
    file: 'public/icons/apple-touch-icon.png',
    size: 180,
    svg: svg({ rounded: false, scale: 0.96 }),
  },
];
// The favicon: bold strokes, rendered separately at each size (no blurry downscaling).
const faviconSizes = [16, 32, 48];

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(markup, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${markup}`,
  );
  return page.screenshot({ omitBackground: true });
}

for (const job of png) writeFileSync(job.file, await render(job.svg, job.size));
const favicons = [];
for (const size of faviconSizes)
  favicons.push({ size, data: await render(svg({ rounded: true, bold: true }), size) });
await browser.close();

writeFileSync('public/icons/icon.svg', svg({ rounded: true, bold: true }));

// A .ico file is a small header followed by the PNG images (supported by every current browser).
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(favicons.length, 4);
const entries = Buffer.alloc(16 * favicons.length);
let offset = header.length + entries.length;
favicons.forEach(({ size, data }, i) => {
  entries.writeUInt8(size, i * 16);
  entries.writeUInt8(size, i * 16 + 1);
  entries.writeUInt16LE(1, i * 16 + 4); // planes
  entries.writeUInt16LE(32, i * 16 + 6); // bits per pixel
  entries.writeUInt32LE(data.length, i * 16 + 8);
  entries.writeUInt32LE(offset, i * 16 + 12);
  offset += data.length;
});
writeFileSync(
  'public/favicon.ico',
  Buffer.concat([header, entries, ...favicons.map((f) => f.data)]),
);
console.log('icons written');
