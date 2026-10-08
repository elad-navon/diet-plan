// Renders the app icons and the favicon with the browser that Playwright already installs.
// Every icon is the same green apple: a solid shape with no holes, so it reads at 16 px as well as on a home screen.
//  - The browser-tab icon (favicon.ico, icon.svg) and the home-screen icons (192/512) are on a TRANSPARENT
//    background. There is no "maskable" icon on purpose: Android would put it on an opaque tile.
//  - The iPhone icon (apple-touch-icon) is on white, because iOS fills any transparent pixel with black.
//  - icon.svg is also the logo at the top of the side bar (SideRail).
// Run once after changing a design: node scripts/make-icons.mjs
//
// Writes: public/icons/{icon.svg,icon-192.png,icon-512.png,apple-touch-icon.png}, public/favicon.ico
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const GREEN = '#22c55e';
const DARK_GREEN = '#15803d';
const BROWN = '#7c4a1e';
const WHITE = '#ffffff';

/** The apple: body, stem and leaf. */
const APPLE = `
  <path d="M256 150 C200 100 70 120 70 270 C70 390 160 480 215 480 C238 480 245 466 256 466 C267 466 274 480 297 480 C352 480 442 390 442 270 C442 120 312 100 256 150 Z" fill="${GREEN}"/>
  <path d="M256 150 C256 110 264 75 290 45" stroke="${BROWN}" stroke-width="26" stroke-linecap="round" fill="none"/>
  <path d="M276 100 C300 40 370 30 400 48 C380 100 316 115 276 100 Z" fill="${DARK_GREEN}"/>`;

/** The apple centred; `scale` shrinks it toward the middle; `background` null = transparent. */
const svg = ({ background = null, scale = 1 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${background ? `<rect width="512" height="512" fill="${background}"/>` : ''}
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${APPLE}
  </g>
</svg>
`;

const png = [
  { file: 'public/icons/icon-192.png', size: 192, svg: svg({ scale: 0.94 }) },
  { file: 'public/icons/icon-512.png', size: 512, svg: svg({ scale: 0.94 }) },
  // iOS rounds the corners itself and turns transparent pixels black, so this one sits on white.
  {
    file: 'public/icons/apple-touch-icon.png',
    size: 180,
    svg: svg({ background: WHITE, scale: 0.75 }),
  },
];
// The favicon, rendered separately at each size (no blurry downscaling).
const faviconSizes = [16, 32, 48];
// The browser tab and the side bar show the apple bigger: it fills the square almost to the edges.
const TIGHT = 1.12;

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
  favicons.push({ size, data: await render(svg({ scale: TIGHT }), size) });
await browser.close();

writeFileSync('public/icons/icon.svg', svg({ scale: TIGHT }));

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
