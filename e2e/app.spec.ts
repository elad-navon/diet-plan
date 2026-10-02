import { expect, test, type Page } from '@playwright/test';
import { he } from '../src/i18n/he';
import { TODAY, openApp } from './helpers';

/** The critical user journeys (docs/TEST_PLAN.md E2E-01 ... E2E-12) that exist so far. */

const remaining = (page: Page) =>
  page.getByRole('img', { name: new RegExp(he.today.ringRemaining) });

test('E2E-01: a new user signs up and gets a daily target', async ({ page }) => {
  await openApp(page, { seed: false, path: '/' });
  await expect(page).toHaveURL(/\/welcome$/);

  // step 1: who
  await page.getByText(he.sex.female, { exact: true }).click();
  await page.getByLabel(he.onboarding.birthDate).fill('1992-03-15');
  await page.getByRole('button', { name: he.next }).click();

  // step 2: measures
  await page.getByLabel(he.onboarding.height).fill('165');
  await page.getByLabel(he.onboarding.weight).fill('71');
  await page.getByRole('button', { name: he.next }).click();

  // step 3: activity and goal
  await page.getByText(he.activity.light.name, { exact: true }).click();
  await page.getByLabel(he.onboarding.targetWeight).fill('62');
  await page.getByRole('button', { name: he.next }).click();

  // step 4: the result - the documented vector: 1,390 kcal
  await expect(page.getByRole('heading', { name: he.onboarding.stepResult })).toBeVisible();
  await expect(page.getByText('1,390')).toBeVisible();
  await expect(page.getByText(he.onboarding.projectionNote)).toBeVisible();
  const start = page.getByRole('button', { name: he.onboarding.start });
  await expect(start).toBeDisabled(); // needs the declaration first
  await page.getByLabel(he.onboarding.acknowledge).check();
  await start.click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,390/);
});

test('E2E-01: onboarding explains why a goal is blocked', async ({ page }) => {
  await openApp(page, { seed: false, path: '/welcome' });
  await page.getByText(he.sex.female, { exact: true }).click();
  await page.getByLabel(he.onboarding.birthDate).fill('2012-01-01'); // a child
  await page.getByRole('button', { name: he.next }).click();
  await expect(page.getByText(he.validation.age_under_18)).toBeVisible();
  await expect(page).toHaveURL(/\/welcome$/);
});

test('E2E-02: add a meal from the food database, then see the day update', async ({ page }) => {
  await openApp(page, { seed: {} });
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,390/);

  await page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByLabel(he.addMeal.searchLabel).fill('ביצה');
  await sheet
    .getByRole('button', { name: /ביצה שלמה בלי קליפה/ })
    .first()
    .click();

  // two medium eggs (the database's own unit): 99 g -> 142 kcal
  await sheet.getByLabel(he.addMeal.count).fill('2');
  await expect(sheet.getByText('142')).toBeVisible();
  await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();

  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(page.getByText(he.today.saved)).toBeVisible();
  await expect(
    page.getByRole('button', { name: he.today.deleteMeal('ביצה שלמה בלי קליפה') }),
  ).toBeVisible();
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,248/); // 1,390 - 142
});

test('E2E-04: add a manual meal and see validation', async ({ page }) => {
  await openApp(page, { seed: {} });
  await page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();

  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(sheet.getByText(he.errors.name_required)).toBeVisible();
  await expect(sheet.getByText(he.errors.kcal_invalid)).toBeVisible();

  await sheet.getByLabel(he.addMeal.name).fill('שייק חלבון');
  await sheet.getByLabel(he.addMeal.kcalField).fill('3001');
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(sheet.getByText(he.errors.kcal_out_of_range)).toBeVisible();

  await sheet.getByLabel(he.addMeal.kcalField).fill('250');
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(page.getByRole('button', { name: he.today.deleteMeal('שייק חלבון') })).toBeVisible();
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,140/);
});

test('SUGAR-01: the day shows added sugar in its bands, and a typed value moves it', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  const meter = (grams: string) =>
    page.getByRole('img', { name: new RegExp(`סוכר מוסף היום: ${grams} גרם`) });
  await expect(meter('0')).toBeVisible();
  await expect(page.getByText(he.sugar.band.very_low).first()).toBeVisible();

  await page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();
  await sheet.getByLabel(he.addMeal.name).fill('עוגיות');
  await sheet.getByLabel(he.addMeal.kcalField).fill('250');
  await sheet.getByLabel(he.sugar.field).fill('12,5');
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();

  await expect(meter('12.5')).toBeVisible();
  await expect(page.getByText(he.sugar.band.ok).first()).toBeVisible();
  await expect(page.getByText(he.sugar.mealTotal('12.5'))).toBeVisible(); // on the meal itself
});

test('SUGAR-02: a food from the database brings its added sugar into the meal and the day', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  await page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByLabel(he.addMeal.searchLabel).fill('מיץ תפוחים');
  // The list says how much added sugar there is in 100 g before the food is even chosen.
  await expect(sheet.getByText(/סוכר מוסף [\d.]+ ג' ל-100 ג'/).first()).toBeVisible();
  await sheet
    .getByRole('button', { name: /^מיץ תפוחים/ })
    .first()
    .click();
  await sheet.getByLabel(he.addMeal.unit).selectOption({ label: he.addMeal.grams });
  await sheet.getByLabel(he.addMeal.quantity).fill('200');
  await expect(sheet.getByText(/סוכר מוסף [\d.]+ ג'/).first()).toBeVisible();
  await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(page.getByText(he.today.saved)).toBeVisible();
  // A glass of apple juice is added sugar: the day moves out of the "very low" band.
  await expect(page.getByText(he.sugar.band.very_low)).toHaveCount(0);
});

test('SUGAR-03: whole fruit does not count as added sugar', async ({ page }) => {
  await openApp(page, { seed: {} });
  await page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByLabel(he.addMeal.searchLabel).fill('בננה');
  await expect(sheet.getByText(he.sugar.none100).first()).toBeVisible();
  await sheet
    .getByRole('button', { name: /^בננה, טריה/ })
    .first()
    .click();
  await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(page.getByText(he.today.saved)).toBeVisible();
  await expect(page.getByRole('img', { name: /סוכר מוסף היום: 0 גרם/ })).toBeVisible();
});

test('E2E-05: delete a meal and undo', async ({ page }) => {
  await openApp(page, { seed: { withMealsToday: true } });
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,110/); // 1,390 - 280

  await page.getByRole('button', { name: he.today.deleteMeal('חביתה וסלט') }).click();
  await expect(page.getByText(he.today.deleted)).toBeVisible();
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,390/);

  await page.getByRole('button', { name: he.undo }).click();
  await expect(page.getByRole('button', { name: he.today.deleteMeal('חביתה וסלט') })).toBeVisible();
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,110/);
});

test('INT-05: pressing save twice quickly creates only one meal', async ({ page }) => {
  await openApp(page, { seed: {} });
  await page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();
  await sheet.getByLabel(he.addMeal.name).fill('פרי');
  await sheet.getByLabel(he.addMeal.kcalField).fill('100');
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).dblclick();

  await expect(page.getByText(he.today.saved)).toBeVisible();
  await expect(page.getByRole('button', { name: he.today.deleteMeal('פרי') })).toHaveCount(1);
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,290/);
});

test('E2E-08: add a weigh-in and see it in the progress screen', async ({ page }) => {
  await openApp(page, { seed: {}, path: '/progress' });
  await page.getByRole('button', { name: he.progress.addWeight }).click();
  const sheet = page.getByRole('dialog', { name: he.progress.addWeight });
  await sheet.getByLabel(he.progress.weightField).fill('70.1');
  await sheet.getByRole('button', { name: he.progress.saveWeight }).click();
  await expect(page.getByText(he.progress.weightSaved)).toBeVisible();

  await page.locator('summary', { hasText: he.progress.weighIns }).click();
  await expect(page.getByRole('cell', { name: '70.1' })).toBeVisible();
});

test('settings: export, theme and delete everything', async ({ page }) => {
  await openApp(page, { seed: {}, path: '/settings' });
  await expect(page.getByText(he.settings.currentTarget('1,390'))).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: he.settings.export }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`diet-plan-${TODAY}.json`);

  await page.getByRole('combobox', { name: he.settings.theme }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: he.settings.deleteAll }).click();
  await page.getByRole('button', { name: he.settings.deleteConfirmAction }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

test('E2E-03: edit a meal and the day updates', async ({ page }) => {
  await openApp(page, { seed: { withMealsToday: true } });
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,110/);

  await page.getByRole('button', { name: he.today.editMeal('חביתה וסלט') }).click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.editTitle });
  await sheet.getByLabel(he.addMeal.kcalField).fill('350');
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();

  await expect(page.getByText(he.today.updated)).toBeVisible();
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,040/); // 1,390 - 350
});

test('"I ate this again" opens the meal ready to confirm', async ({ page }) => {
  await openApp(page, { seed: { withMealsToday: true } });
  await page.getByRole('button', { name: he.today.againMeal('חביתה וסלט') }).click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await expect(sheet.getByLabel(he.addMeal.name)).toHaveValue('חביתה וסלט');
  await expect(sheet.getByLabel(he.addMeal.kcalField)).toHaveValue('280');
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(remaining(page)).toHaveAttribute('aria-label', /830/); // 1,390 - 2 x 280
});

test('E2E-06: a suggestion can be added with one confirmation', async ({ page }) => {
  await openApp(page, { seed: {}, time: `${TODAY}T11:00:00+03:00` });
  const suggestions = page.getByRole('region', { name: he.today.nextMeal });
  await expect(suggestions.getByText(he.slotMeal.lunch)).toBeVisible();
  // Each suggestion says exactly what to put on the plate: which food and how much of it.
  const firstIngredients = suggestions.getByRole('list', { name: /^המרכיבים של/ }).first();
  await expect(firstIngredients.getByRole('listitem').first()).toContainText(/\d+(\.\d+)? ג'/);
  expect(await firstIngredients.getByRole('listitem').count()).toBeGreaterThanOrEqual(1);
  const button = suggestions.getByRole('button', { name: new RegExp(`^${he.add}:`) }).first();
  const suggestionName = ((await button.getAttribute('aria-label')) ?? '').replace(
    `${he.add}: `,
    '',
  );
  await button.click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await expect(sheet.getByLabel(he.addMeal.name)).toHaveValue(suggestionName);
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(page.getByText(he.today.saved)).toBeVisible();
});

test('E2E-07: changing the goal applies from today and leaves earlier days alone', async ({
  page,
}) => {
  await openApp(page, { seed: {}, path: '/settings' });
  await page.getByRole('link', { name: he.settings.editGoal }).click();
  await expect(page.getByText(he.onboarding.updateNote)).toBeVisible();

  await page.getByRole('button', { name: he.next }).click(); // who (already filled)
  await page.getByRole('button', { name: he.next }).click(); // measures
  await page.getByText(he.activity.moderate.name, { exact: true }).click();
  await page.getByRole('button', { name: he.next }).click();
  await expect(page.getByText('1,640')).toBeVisible(); // moderate activity
  await page.getByRole('button', { name: he.onboarding.update }).click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,640/);

  // the weekly table keeps each day's own target
  await page.goto('/progress');
  await page.getByRole('button', { name: he.today.showTable }).click();
  const rows = page.getByRole('row');
  await expect(rows.filter({ hasText: '1 באוק' })).toContainText('1,390');
  await expect(rows.filter({ hasText: '2 באוק' })).toContainText('1,640');
});
