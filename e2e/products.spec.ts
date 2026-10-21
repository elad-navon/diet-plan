import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { he } from '../src/i18n/he';
import { openApp, openNewMeal } from './helpers';

/**
 * PROD-01: a product from its nutrition label. The label's text (what Google Lens copied from the user's photo of
 * Angel whole-wheat bread) fills the values; the product is saved with its photo and a unit, used in a meal
 * at once, and found first in the search the next time.
 */

const ANGEL_TEXT = readFileSync(
  new URL('../tests/fixtures/labels/angel-bread.txt', import.meta.url),
  'utf8',
);
/** A 1x1 PNG: enough to stand for a photo of the label. */
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const remaining = (page: Page) =>
  page.getByRole('img', { name: new RegExp(he.today.ringRemaining) });

test('PROD-01: save a product from its label text, eat two slices, find it again', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,390/);

  await openNewMeal(page);
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByLabel(he.addMeal.searchLabel).fill('לחם אנג׳ל');
  await sheet.getByRole('button', { name: he.products.fromSearch('לחם אנג׳ל') }).click();

  await expect(sheet.getByLabel(he.products.name)).toHaveValue('לחם אנג׳ל');
  await sheet.locator('input[type=file]').setInputFiles({
    name: 'label.png',
    mimeType: 'image/png',
    buffer: PHOTO,
  });
  await expect(sheet.getByRole('img', { name: he.products.photoAlt })).toBeVisible();

  await sheet.getByLabel(he.products.textLabel).fill(ANGEL_TEXT);
  await expect(sheet.getByText(he.products.filled(6))).toBeVisible();
  await expect(sheet.getByLabel(he.products.kcal, { exact: true })).toHaveValue('225');
  await expect(sheet.getByLabel(he.products.protein)).toHaveValue('12.4');
  await expect(sheet.getByLabel(he.products.carbs)).toHaveValue('30.5');
  await expect(sheet.getByLabel(he.products.fat)).toHaveValue('4');
  await expect(sheet.getByLabel(he.products.sugar)).toHaveValue('1.1');
  await expect(sheet.getByLabel(he.products.fiber)).toHaveValue('8.8');

  await sheet.getByRole('button', { name: he.products.addUnit }).click();
  await sheet.getByLabel(he.products.unitName).fill('פרוסה');
  await sheet.getByLabel(he.products.unitGrams(false)).fill('30');

  // Saving asks for a look at the values first.
  await sheet.getByRole('button', { name: he.products.saveAndAdd }).click();
  await expect(sheet.getByText(he.products.confirmNeeded)).toBeVisible();
  await sheet.getByLabel(he.products.confirm).check();
  await sheet.getByRole('button', { name: he.products.saveAndAdd }).click();

  // Straight to the amount: 2 slices of 30 g = 60 g -> 135 kcal.
  await expect(sheet.getByLabel(he.addMeal.unit)).toHaveValue('פרוסה');
  await sheet.getByLabel(he.addMeal.count).fill('2');
  await expect(sheet.getByText('135')).toBeVisible();
  await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(page.getByText(he.today.saved)).toBeVisible();
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,255/); // 1,390 - 135

  // Next time it is the first thing the search offers.
  await openNewMeal(page);
  const again = page.getByRole('dialog', { name: he.addMeal.title });
  await again.getByLabel(he.addMeal.searchLabel).fill('אנג׳ל');
  await expect(again.getByRole('heading', { name: he.products.title })).toBeVisible();
  await expect(again.getByRole('button', { name: /לחם אנג׳ל/ }).first()).toBeVisible();
});

test('PROD-02: text with fewer numbers than rows fills nothing and says why', async ({ page }) => {
  await openApp(page, { seed: {} });
  await openNewMeal(page);
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByRole('button', { name: he.products.addNew }).click();
  await sheet
    .getByLabel(he.products.textLabel)
    .fill(
      ['סימון תזונתי ב-100 גרם', 'אנרגיה', 'חלבונים', 'פחמימות', 'שומנים', '90', '3'].join('\n'),
    );
  await expect(sheet.getByText(he.products.issues.count_mismatch)).toBeVisible();
  await expect(sheet.getByLabel(he.products.kcal, { exact: true })).toHaveValue('');
});
