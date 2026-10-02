// Draws a contact sheet of app-icon ideas (design/icon-ideas.png) with the browser Playwright already installs.
// Run: node scripts/icon-ideas.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BLUE = '#3b82f6'; // a bright, friendly blue (not dark)
const WHITE = '#ffffff';

const ring = (r, width, fraction, opacity = 1) => {
  const c = 2 * Math.PI * r;
  return `<circle cx="256" cy="256" r="${r}" fill="none" stroke="${WHITE}" stroke-width="${width}" stroke-linecap="round"
    stroke-opacity="${opacity}" stroke-dasharray="${(c * fraction).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 256 256)"/>`;
};

const scaleBody = `
  <rect x="98" y="98" width="316" height="316" rx="72" fill="${WHITE}"/>
  <path d="M158 262 A98 98 0 0 1 354 262" fill="none" stroke="${BLUE}" stroke-width="30" stroke-linecap="round"/>
  <path d="M256 262 L297 195" stroke="${BLUE}" stroke-width="22" stroke-linecap="round"/>
  <circle cx="256" cy="262" r="21" fill="${BLUE}"/>
  <rect x="196" y="338" width="120" height="26" rx="13" fill="${BLUE}" fill-opacity="0.35"/>`;

const IDEAS = [
  {
    name: 'משקל אמבטיה',
    note: 'הכי ברור: "משקל"',
    shapes: scaleBody,
  },
  {
    name: 'תפוח',
    note: 'אוכל בריא, פשוט וזכיר',
    shapes: `
      <path d="M256 180 C228 142 150 152 150 252 C150 337 205 407 256 390 C307 407 362 337 362 252 C362 152 284 142 256 180 Z" fill="${WHITE}"/>
      <path d="M256 172 C256 142 264 118 280 100" fill="none" stroke="${WHITE}" stroke-width="18" stroke-linecap="round"/>
      <path d="M270 150 C270 108 300 86 346 90 C346 134 312 160 270 150 Z" fill="${WHITE}"/>`,
  },
  {
    name: 'טבעת קלוריות',
    note: 'כמו הטבעת באפליקציה, עם וי',
    shapes: `
      <circle cx="256" cy="256" r="150" fill="none" stroke="${WHITE}" stroke-opacity="0.3" stroke-width="44"/>
      ${ring(150, 44, 0.74)}
      <path d="M198 262 l46 46 l78 -92" fill="none" stroke="${WHITE}" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    name: 'צלחת וסכו"ם',
    note: 'ארוחה = צלחת, מזלג וסכין',
    shapes: `
      <circle cx="256" cy="256" r="94" fill="${WHITE}"/>
      <circle cx="256" cy="256" r="60" fill="${BLUE}"/>
      <g stroke="${WHITE}" stroke-linecap="round" fill="none">
        <path d="M104 146 V214 M122 146 V214 M140 146 V214" stroke-width="12"/>
        <path d="M104 214 Q122 246 140 214" stroke-width="12"/>
        <path d="M122 236 V372" stroke-width="18"/>
        <path d="M392 372 V262" stroke-width="18"/>
      </g>
      <path d="M392 146 C436 176 436 246 392 266 Z" fill="${WHITE}"/>`,
  },
  {
    name: 'קערה עם עלים',
    note: 'מרגיש בריא וטרי',
    shapes: `
      <path d="M108 268 H404 C404 344 342 400 256 400 C170 400 108 344 108 268 Z" fill="${WHITE}"/>
      <path d="M256 258 C232 224 192 206 168 150 C222 148 262 190 256 258 Z" fill="${WHITE}"/>
      <path d="M256 258 C282 218 322 200 348 144 C294 144 250 188 256 258 Z" fill="${WHITE}"/>`,
  },
  {
    name: 'טבעת עם האות י',
    note: '"י" מ"יומן" — אישי וייחודי',
    shapes: `
      <circle cx="256" cy="256" r="146" fill="none" stroke="${WHITE}" stroke-width="38"/>
      <text x="256" y="330" text-anchor="middle" font-size="240" font-weight="800"
        font-family="Rubik, Arial, sans-serif" fill="${WHITE}">י</text>`,
  },
  {
    name: 'מד (שעון)',
    note: 'מד התקדמות מודרני',
    shapes: `
      <path d="M157 372 A144 144 0 1 1 355 372" fill="none" stroke="${WHITE}" stroke-width="44" stroke-linecap="round"/>
      <path d="M256 276 L316 214" stroke="${WHITE}" stroke-width="28" stroke-linecap="round"/>
      <circle cx="256" cy="276" r="28" fill="${WHITE}"/>`,
  },
  {
    name: 'משקל עם עלה',
    note: 'משקל + בריאות, בשילוב',
    shapes: `<g transform="translate(256 262) scale(0.84) translate(-256 -256)">${scaleBody}
      <path d="M318 116 C318 62 366 40 414 50 C414 104 372 138 318 116 Z" fill="${WHITE}" stroke="${BLUE}" stroke-width="14" stroke-linejoin="round"/></g>`,
  },
];

const icon = (shapes, rounded) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${BLUE}"/>${shapes}</svg>`;

const cards = IDEAS.map(
  (idea, i) => `
  <section class="card">
    <div class="num">${i + 1}</div>
    <div class="big">${icon(idea.shapes, true)}</div>
    <h2>${idea.name}</h2>
    <p>${idea.note}</p>
    <div class="sizes">
      <div class="circle">${icon(idea.shapes, false)}</div>
      <div class="s48">${icon(idea.shapes, true)}</div>
      <div class="s32">${icon(idea.shapes, true)}</div>
      <div class="s16">${icon(idea.shapes, true)}</div>
    </div>
    <small>עגול (אנדרואיד) · 48 · 32 · 16 פיקסלים</small>
  </section>`,
).join('');

const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><style>
  body { margin: 0; padding: 28px; background: #f3f4f8; font-family: Arial, sans-serif; color: #10131c; }
  h1 { margin: 0 0 20px; font-size: 28px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
  .card { position: relative; background: #fff; border-radius: 24px; padding: 20px 16px 14px; text-align: center; box-shadow: 0 6px 24px -12px rgb(0 0 0 / .25); }
  .num { position: absolute; top: 12px; right: 14px; width: 34px; height: 34px; border-radius: 50%; background: #10131c; color: #fff; display: grid; place-items: center; font-weight: 700; }
  .big svg { width: 168px; height: 168px; filter: drop-shadow(0 8px 14px rgb(59 130 246 / .35)); }
  h2 { margin: 12px 0 2px; font-size: 20px; }
  p { margin: 0 0 10px; color: #565b6c; font-size: 14px; min-height: 36px; }
  .sizes { display: flex; align-items: flex-end; justify-content: center; gap: 12px; margin-bottom: 4px; }
  .circle { width: 64px; height: 64px; border-radius: 50%; overflow: hidden; }
  .circle svg, .s48 svg, .s32 svg, .s16 svg { width: 100%; height: 100%; display: block; }
  .s48 { width: 48px; height: 48px; } .s32 { width: 32px; height: 32px; } .s16 { width: 16px; height: 16px; }
  small { color: #565b6c; font-size: 11px; }
</style><body><h1>רעיונות לאייקון — רקע כחול בהיר, צורה לבנה</h1><div class="grid">${cards}</div></body></html>`;

mkdirSync('design', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1180, height: 760 },
  deviceScaleFactor: 2,
});
await page.setContent(html);
await page.screenshot({ path: 'design/icon-ideas.png', fullPage: true });
await browser.close();
console.log('design/icon-ideas.png written');
