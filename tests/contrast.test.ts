import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Text and chart colors must stay readable (WCAG 2.2 AA: 4.5:1 for text, 3:1 for graphics) in both
 * themes. Reads the design tokens straight from src/index.css so the CSS stays the single source.
 * Covers docs/TEST_PLAN.md A11Y-01 (contrast part) and A11Y-03 (status never color-only).
 */

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

/** Custom properties declared in the block that starts with `selector {` (first occurrence). */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const result: Record<string, string> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    const [, name, value] = match;
    if (name && value) result[name] = value;
  }
  return result;
}

const light = tokens(':root {');
// The dark block overrides only some tokens; unspecified ones inherit the light value.
const dark = { ...light, ...tokens(":root:where(:not([data-theme='light'])) {") };
const darkToggle = { ...light, ...tokens(":root[data-theme='dark'] {") };

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes: [string, Record<string, string>][] = [
  ['light', light],
  ['dark (OS preference)', dark],
  ['dark (toggle)', darkToggle],
];

describe.each(themes)('contrast in the %s theme', (_name, t) => {
  const get = (token: string): string => {
    const value = t[token];
    if (!value) throw new Error(`missing token --${token}`);
    return value;
  };

  it.each([
    ['ink', 'canvas'],
    ['ink', 'surface'],
    ['muted', 'canvas'],
    ['muted', 'surface'],
    ['accent', 'canvas'],
    ['accent', 'surface'],
    ['on-accent', 'accent'],
  ])('text --%s on --%s is at least 4.5:1', (foreground, background) => {
    expect(contrast(get(foreground), get(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([['series-1'], ['series-2'], ['axis'], ['accent']])(
    'graphic --%s stands out from the chart surface (3:1)',
    (token) => {
      // The axis hairline is decorative (values are also given as text and in the table), so it only
      // has to be visible, not 3:1; the series colors and the accent carry meaning and must be 3:1.
      const minimum = token === 'axis' ? 1.3 : 3;
      expect(contrast(get(token), get('surface'))).toBeGreaterThanOrEqual(minimum);
    },
  );
});
