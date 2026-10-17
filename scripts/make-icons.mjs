// Renders the app icons and the favicon with the browser that Playwright already installs.
// Every icon is the same drawing: an orange notebook (a diary - "יומן") with a fork and a knife and the
// spine drawn on it in dark orange, on a transparent background. It is one solid shape on purpose:
// launcher icon packs leave white-on-transparent icons on white tiles, cut out shapes let the tile show
// through, and round shapes read as "already shaped".
//  - icon.svg is the logo at the top of the side bar (SideRail, always on the dark rail).
//  - The browser tab: favicon.svg (and favicon.ico, for browsers without SVG icons) - orange reads on light
//    and dark tabs alike.
//  - The home-screen icons (192/512) are on a TRANSPARENT background. There is no "maskable" icon on
//    purpose: Android would put it on an opaque tile.
//  - The iPhone icon (apple-touch-icon) is on white, because iOS fills any transparent pixel with black.
//  - The Android app (android/, when it exists): the launcher icon is the notebook on a transparent
//    background, the same size as the grocery and Prime Time icons; the launch screen is the notebook on
//    white.
// Run once after changing a design: node scripts/make-icons.mjs
//
// Writes: public/icons/{icon.svg,favicon.svg,icon-192.png,icon-512.png,apple-touch-icon.png},
// public/favicon.ico, and android/app/src/main/res/{mipmap-*,drawable*,values/ic_launcher_background.xml}
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from '@playwright/test';

const WHITE = '#ffffff';
// The notebook and what is drawn on it. Not a bright, light color: the user's launcher icon packs draw no
// tile behind those (light orange, purple and light blue were tried).
const ORANGE = '#ea580c';
const DARK_ORANGE = '#7c2d12';

/** The notebook on a 64-unit grid: the cover in ORANGE, the spine, fork and knife on it in DARK_ORANGE. */
const FORK = `<g fill="none" stroke-linecap="round"><path d="M-4 -24v10a4 4 0 0 0 8 0v-10" stroke-width="3.4"/><line x1="0" y1="-24" x2="0" y2="-12" stroke-width="3.4"/><line x1="0" y1="-9" x2="0" y2="24" stroke-width="4.6"/></g>`;
const KNIFE = `<g><path d="M1.8 -24c-5 3-6.5 12-6.5 21h6.5z" stroke="none"/><line x1="0" y1="-3" x2="0" y2="24" stroke-width="4.6" stroke-linecap="round"/></g>`;
const glyph = () => `<rect x="12" y="6" width="42" height="52" rx="5" fill="${ORANGE}"/>
  <g fill="${DARK_ORANGE}" stroke="${DARK_ORANGE}">
    <rect x="12" y="6" width="8" height="52" rx="3" stroke="none"/>
    <g transform="translate(32 32) scale(0.6)">${FORK}</g>
    <g transform="translate(43 32) scale(0.6)">${KNIFE}</g>
  </g>`;
// Just the drawing (the cover), so it can be centred and sized exactly.
const BOX = { x: 12, y: 6, w: 42, h: 52 };

/**
 * A width x height image: an optional white background (`full`) and the drawing centred, `size` = its
 * longer side (the height) as a fraction of the image's shorter side.
 */
const svg = ({ width, height = width, size, background = null }) => {
  const side = Math.min(width, height);
  const scale = (side * size) / Math.max(BOX.w, BOX.h);
  const w = BOX.w * scale;
  const h = BOX.h * scale;
  const backgrounds = {
    full: `<rect width="${width}" height="${height}" fill="${WHITE}"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${background ? backgrounds[background] : ''}
  <svg x="${(width - w) / 2}" y="${(height - h) / 2}" width="${w}" height="${h}" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}">${glyph()}</svg>
</svg>
`;
};

// The browser tab and the side bar show the drawing as big as the square allows.
const TIGHT = 0.98;

// The browser tab icon: a square around the notebook.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BOX.x - (BOX.h - BOX.w) / 2 - 1} ${BOX.y - 1} ${BOX.h + 2} ${BOX.h + 2}" width="64" height="64">
  ${glyph()}
</svg>
`;

const png = [
  { file: 'public/icons/icon-192.png', size: 192, svg: svg({ width: 192, size: 0.94 }) },
  { file: 'public/icons/icon-512.png', size: 512, svg: svg({ width: 512, size: 0.94 }) },
  // iOS rounds the corners itself and turns transparent pixels black, so this one sits on white.
  {
    file: 'public/icons/apple-touch-icon.png',
    size: 180,
    svg: svg({ width: 180, size: 0.72, background: 'full' }),
  },
];

// The Android app, once android/ exists (npx cap add android).
const RES = 'android/app/src/main/res';
if (existsSync(RES)) {
  // The launcher icon (ic_launcher / ic_launcher_round): the drawing alone, transparent. There is
  // deliberately no adaptive icon (mipmap-anydpi-v26): launcher icon packs draw their own tile and a
  // dark halo behind adaptive icons they don't know, and leave a plain transparent icon as it is.
  // ic_launcher_foreground (108dp canvas) is only the Android 12+ launch-screen icon.
  for (const [density, scale] of Object.entries({
    mdpi: 1,
    hdpi: 1.5,
    xhdpi: 2,
    xxhdpi: 3,
    xxxhdpi: 4,
  })) {
    png.push(
      {
        file: `${RES}/mipmap-${density}/ic_launcher_foreground.png`,
        size: 108 * scale,
        svg: svg({ width: 108 * scale, size: 0.62 }),
      },
      {
        file: `${RES}/mipmap-${density}/ic_launcher.png`,
        size: 48 * scale,
        svg: svg({ width: 48 * scale, size: 0.7 }),
      },
      {
        file: `${RES}/mipmap-${density}/ic_launcher_round.png`,
        size: 48 * scale,
        svg: svg({ width: 48 * scale, size: 0.7 }),
      },
    );
  }
  // Launch screens for Android 11 and older (12+ draws its own from the theme's splash colour and icon).
  const splashes = {
    drawable: [480, 320],
    'drawable-land-mdpi': [480, 320],
    'drawable-land-hdpi': [800, 480],
    'drawable-land-xhdpi': [1280, 720],
    'drawable-land-xxhdpi': [1600, 960],
    'drawable-land-xxxhdpi': [1920, 1280],
    'drawable-port-mdpi': [320, 480],
    'drawable-port-hdpi': [480, 800],
    'drawable-port-xhdpi': [720, 1280],
    'drawable-port-xxhdpi': [960, 1600],
    'drawable-port-xxxhdpi': [1280, 1920],
  };
  for (const [dir, [width, height]] of Object.entries(splashes)) {
    png.push({
      file: `${RES}/${dir}/splash.png`,
      width,
      height,
      svg: svg({ width, height, size: 0.32, background: 'full' }),
    });
  }
  writeFileSync(
    `${RES}/values/ic_launcher_background.xml`,
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#00000000</color>
    <color name="splash_background">${WHITE}</color>
</resources>
`,
  );
}

// The favicon, rendered separately at each size (no blurry downscaling).
const faviconSizes = [16, 32, 48];

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(markup, width, height = width) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{width:${width}px;height:${height}px;display:block}</style>${markup}`,
  );
  return page.screenshot({ omitBackground: true });
}

for (const job of png) {
  mkdirSync(dirname(job.file), { recursive: true });
  writeFileSync(job.file, await render(job.svg, job.width ?? job.size, job.height ?? job.size));
}
const favicons = [];
for (const size of faviconSizes)
  favicons.push({ size, data: await render(svg({ width: size, size: TIGHT }), size) });
await browser.close();

writeFileSync('public/icons/icon.svg', svg({ width: 512, size: TIGHT }));
writeFileSync('public/icons/favicon.svg', faviconSvg);

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
