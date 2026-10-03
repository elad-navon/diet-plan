import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { he } from '../src/i18n/he';
import { openApp } from './helpers';

/** Automated accessibility scan of every main screen, light and dark (docs/TEST_PLAN.md A11Y-01). */

async function scan(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    });

    test('welcome (first step)', async ({ page }) => {
      await openApp(page, { seed: false, path: '/welcome' });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await scan(page)).toEqual([]);
    });

    test('today', async ({ page }) => {
      await openApp(page, { seed: { withMealsToday: true, withBreadMealsToday: true } });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await scan(page)).toEqual([]);
    });

    test('add-meal sheet', async ({ page }) => {
      await openApp(page, { seed: {} });
      await page.getByRole('button', { name: he.today.addMeal }).first().click();
      const sheet = page.getByRole('dialog', { name: he.addMeal.title });
      await expect(sheet).toBeVisible();
      expect(await scan(page)).toEqual([]);
      await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();
      // The manual form is longer than the window and ends with a sticky save bar. Scroll to its
      // end, as a person (or the keyboard) would, and check that the last control clears the bar.
      await sheet
        .getByText(he.addMeal.moreOptions, { exact: true })
        .evaluate((element) => element.scrollIntoView({ block: 'nearest' }));
      expect(await scan(page)).toEqual([]);
    });

    test('progress', async ({ page }) => {
      await openApp(page, { seed: {}, path: '/progress' });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await scan(page)).toEqual([]);
    });

    test('settings', async ({ page }) => {
      await openApp(page, { seed: {}, path: '/settings' });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await scan(page)).toEqual([]);
    });
  });
}

test('keyboard: the add-meal sheet traps focus, closes on Escape and returns focus', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  const opener = page.getByRole('button', { name: he.today.addMeal }).first();
  await opener.focus();
  await opener.press('Enter');
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await expect(sheet).toBeVisible();

  // Tab never reaches the page behind the dialog. (Past the last control the browser may hand focus to its own
  // toolbar, which leaves the document's active element on <body> - that is fine.)
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    const behindDialog = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      const active = document.activeElement;
      return active !== document.body && !(dialog?.contains(active) ?? false);
    });
    expect(behindDialog).toBe(false);
  }

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
});
