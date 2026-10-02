// Renders the app icons (public/icons/*) from one SVG with the browser that Playwright already installs.
// Run once after changing the design: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const ACCENT = '#3358dc';
const ACCENT_2 = '#6a45d8';

/** A calorie ring (three quarters filled) on the brand gradient. `full` = no rounded corners (maskable / OS-masked). */
const svg = ({
  rounded,
  scale,
}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ACCENT}"/><stop offset="1" stop-color="${ACCENT_2}"/></linearGradient></defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#g)"/>
  <g transform="translate(256 256) scale(${scale}) rotate(-90)">
    <circle r="150" fill="none" stroke="#fff" stroke-opacity="0.28" stroke-width="46"/>
    <circle r="150" fill="none" stroke="#fff" stroke-width="46" stroke-linecap="round"
            stroke-dasharray="${(2 * Math.PI * 150 * 0.72).toFixed(1)} ${(2 * Math.PI * 150).toFixed(1)}"/>
    <circle r="34" fill="#fff"/>
  </g>
</svg>`;

const jobs = [
  { file: 'public/icons/icon-192.png', size: 192, svg: svg({ rounded: true, scale: 1 }) },
  { file: 'public/icons/icon-512.png', size: 512, svg: svg({ rounded: true, scale: 1 }) },
  // Maskable: the OS crops to a circle or squircle, so keep everything inside the central 80%.
  { file: 'public/icons/maskable-512.png', size: 512, svg: svg({ rounded: false, scale: 0.78 }) },
  // iOS rounds the corners itself.
  {
    file: 'public/icons/apple-touch-icon.png',
    size: 180,
    svg: svg({ rounded: false, scale: 0.9 }),
  },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const job of jobs) {
  await page.setViewportSize({ width: job.size, height: job.size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{width:${job.size}px;height:${job.size}px;display:block}</style>${job.svg}`,
  );
  writeFileSync(job.file, await page.screenshot({ omitBackground: true }));
}
await browser.close();
writeFileSync('public/icons/icon.svg', svg({ rounded: true, scale: 1 }));
console.log('icons written');
