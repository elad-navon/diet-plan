import { expect, test } from '@playwright/test';
import { he } from '../src/i18n/he';
import { openApp } from './helpers';

/** The installable app: manifest and icons, the offline shell and the install hint (docs/TEST_PLAN.md H.5). */

test.describe('manifest', () => {
  test('describes a standalone, right-to-left Hebrew app with working icons', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const response = await request.get(new URL(href ?? '', page.url()).href);
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      name: string;
      lang: string;
      dir: string;
      display: string;
      start_url: string;
      scope: string;
      theme_color: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };
    expect(manifest).toMatchObject({
      name: he.appName,
      lang: 'he',
      dir: 'rtl',
      display: 'standalone',
    });
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const image = await request.get(new URL(icon.src, new URL(href ?? '', page.url())).href);
      expect(image.ok(), icon.src).toBe(true);
      expect(image.headers()['content-type']).toContain('image/png');
    }
  });

  test('links an icon and a theme colour for the browser', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
      'content',
      /#[0-9a-f]{6}/i,
    );
  });
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  test('after one visit the app opens without a connection (PWA-02)', async ({ page, context }) => {
    await openApp(page, { seed: {}, path: '/today' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Wait for the service worker to take over, then reload once so it controls the page.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: he.nav.label })).toBeVisible();

    // Other screens work too, including the food database for search.
    await page.getByRole('link', { name: he.nav.progress }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('install hint', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  test('iPhone users are told how to add the app to the home screen', async ({ page }) => {
    await openApp(page, { seed: {}, path: '/settings' });
    await expect(page.getByRole('heading', { name: he.pwa.installTitle })).toBeVisible();
    await expect(page.getByText(he.pwa.installIos)).toBeVisible();
  });
});
