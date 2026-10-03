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

test('E2E-04b: a food typed by hand can be added to a meal that already has foods from the database', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  await page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByLabel(he.addMeal.searchLabel).fill('ביצה');
  await sheet
    .getByRole('button', { name: /ביצה שלמה בלי קליפה/ })
    .first()
    .click();
  await sheet.getByLabel(he.addMeal.count).fill('2'); // 142 kcal
  await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();

  // The manual tab stays open for more foods.
  await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();
  await sheet.getByLabel(he.addMeal.itemName).fill('שניצל');
  await sheet.getByLabel(he.addMeal.kcalField).fill('300');

  // Saving with a food typed but not added would drop it silently: it asks first.
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(sheet.getByText(he.addMeal.itemPending)).toBeVisible();

  await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();
  await expect(sheet.getByText(he.addMeal.byHand)).toBeVisible();
  await expect(sheet.getByLabel(he.addMeal.itemName)).toHaveValue('');
  await expect(sheet.getByText(he.addMeal.macrosMissing(1))).toBeVisible();
  // The foods from the database still show their macros in the total, with the note beside it.
  await expect(sheet.locator('p', { hasText: he.addMeal.total })).toContainText(he.today.protein);

  // And a second one, in a row.
  await sheet.getByLabel(he.addMeal.itemName).fill('סלט');
  await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();
  await expect(sheet.getByText(he.errors.kcal_invalid)).toBeVisible();
  await sheet.getByLabel(he.addMeal.kcalField).fill('50');
  await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();

  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(page.getByText(he.today.saved)).toBeVisible();
  await expect(remaining(page)).toHaveAttribute('aria-label', /898/); // 1,390 - 142 - 300 - 50
  // ...and they are saved with the meal and counted in the day.
  await expect(page.locator('li.card', { hasText: 'שניצל' })).toContainText(he.today.protein);
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

test('SUGAR-04: a meal saved before sugar was tracked still counts, from the foods it holds', async ({
  page,
}) => {
  await openApp(page, { seed: { withOldFoodMealToday: true } });
  // 240 g of apple juice has 12 g of added sugar per 100 g: 28.8 g, past the 25 g line.
  await expect(page.getByRole('img', { name: /סוכר מוסף היום: 28.8 גרם/ })).toBeVisible();
  await expect(page.getByText(he.sugar.band.review).first()).toBeVisible();
  await expect(page.getByText(he.sugar.mealTotal('28.8'))).toBeVisible();
});

test('a meal saved earlier with empty macros, because of a hand-typed food, gets the macros of its other foods', async ({
  page,
}) => {
  await openApp(page, { seed: { withMixedMealWithoutMacrosToday: true } });
  await expect(page.locator('li.card', { hasText: 'מיץ וחטיף' })).toContainText(he.today.protein);
});

test('FLOUR-01: the day tells white flour from whole grain and suggests what to try instead', async ({
  page,
  isMobile,
}) => {
  await openApp(page, { seed: { withBreadMealsToday: true } });
  const card = page.getByRole('region', { name: he.flour.title });
  await expect(card.getByRole('img', { name: he.flour.summary('44.7', '30') })).toBeVisible();
  // a phone shows what to try instead right away; a computer keeps it one click away
  if (!isMobile) await card.locator('summary', { hasText: he.flour.swapTitle }).click();
  await expect(card.getByText(he.flour.swap.bread).locator('visible=true')).toBeVisible();
});

test('FLOUR-02: a food says whether it is white flour or whole grain, and what to try instead', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  await expect(page.getByText(he.flour.empty)).toBeVisible();
  await page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByLabel(he.addMeal.searchLabel).fill('לחם לבן');
  await expect(sheet.getByText(new RegExp(he.flour.tag.refined)).first()).toBeVisible();
  await sheet
    .getByRole('button', { name: /^לחם לבן, קלוי/ })
    .first()
    .click();
  await expect(sheet.getByText(he.flour.swapHint(he.flour.swap.bread))).toBeVisible();
});

test('DRAFT-01: a click beside the sheet does not hide a meal being typed; closing keeps it, and it can be dropped', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  const open = () => page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });

  await open();
  await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();
  await sheet.getByLabel(he.addMeal.name).fill('עוגיות');
  await sheet.getByLabel(he.addMeal.kcalField).fill('250');

  await page.mouse.click(5, 5); // a click beside the sheet does not hide it
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel(he.addMeal.name)).toHaveValue('עוגיות');

  await sheet.getByRole('button', { name: he.close }).click(); // closing on purpose keeps the draft
  await expect(sheet).toBeHidden();

  await open();
  await expect(sheet.getByText(he.addMeal.draftBack)).toBeVisible();
  await expect(sheet.getByLabel(he.addMeal.name)).toHaveValue('עוגיות');
  await expect(sheet.getByLabel(he.addMeal.kcalField)).toHaveValue('250');

  await sheet.getByRole('button', { name: he.addMeal.draftRestart }).click();
  await expect(sheet.getByText(he.addMeal.draftBack)).toHaveCount(0);
  await expect(sheet.getByLabel(he.addMeal.searchLabel)).toBeVisible();
});

test('DRAFT-02: foods already added to a meal are still there after closing, until it is saved', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  const open = () => page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });

  await open();
  await sheet.getByLabel(he.addMeal.searchLabel).fill('בננה');
  await sheet
    .getByRole('button', { name: /^בננה, טריה/ })
    .first()
    .click();
  await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();
  await expect(sheet.getByRole('heading', { name: he.addMeal.items })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await open();
  await expect(sheet.getByText(he.addMeal.draftBack)).toBeVisible();
  await expect(sheet.getByRole('heading', { name: he.addMeal.items })).toBeVisible();
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(page.getByText(he.today.saved)).toBeVisible();

  // Saved: nothing is left to come back to.
  await open();
  await expect(sheet.getByLabel(he.addMeal.searchLabel)).toBeVisible();
  await expect(sheet.getByText(he.addMeal.draftBack)).toHaveCount(0);
});

test('REMEMBER-01: a meal typed by hand is found by name next time, with its numbers', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  const open = () => page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });

  await open();
  await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();
  await sheet.getByLabel(he.addMeal.name).fill('יוגורט פרו של דנונה');
  await sheet.getByLabel(he.addMeal.kcalField).fill('120');
  await sheet.getByLabel(he.sugar.field).fill('7');
  await expect(sheet.getByLabel(he.addMeal.rememberManual)).toBeChecked(); // on by default
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(page.getByText(he.today.saved)).toBeVisible();

  // Next time: typing a piece of the name offers it, with its calories and sugar.
  await open();
  await sheet.getByLabel(he.addMeal.searchLabel).fill('פרו');
  await expect(sheet.getByText(he.addMeal.myFoods)).toBeVisible();
  const row = sheet.getByRole('button', { name: /יוגורט פרו של דנונה/ });
  await expect(row).toContainText(he.sugar.mealTotal('7'));
  await row.click();
  await expect(sheet.getByLabel(he.addMeal.name)).toHaveValue('יוגורט פרו של דנונה');
  await expect(sheet.getByLabel(he.addMeal.kcalField)).toHaveValue('120');
  await expect(sheet.getByLabel(he.sugar.field)).toHaveValue('7');
});

test('REMEMBER-02: it can be switched off, a same-name entry replaces the old one, and one can be removed', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  const open = () => page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  const typeManual = async (name: string, kcal: string, remember: boolean) => {
    await open();
    await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();
    await sheet.getByLabel(he.addMeal.name).fill(name);
    await sheet.getByLabel(he.addMeal.kcalField).fill(kcal);
    if (!remember) await sheet.getByLabel(he.addMeal.rememberManual).uncheck();
    await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
    await expect(sheet).toBeHidden();
  };

  await typeManual('חטיף חד פעמי', '90', false);
  await typeManual('עוגיות בית', '200', true);
  await typeManual('עוגיות בית', '260', true); // the same name again: the latest numbers win

  await open();
  await sheet.getByLabel(he.addMeal.searchLabel).fill('חטיף חד');
  await expect(sheet.getByText(he.addMeal.myFoods)).toHaveCount(0); // switched off: not remembered
  await sheet.getByLabel(he.addMeal.searchLabel).fill('עוגיות בית');
  const remembered = sheet.getByRole('button', { name: /^עוגיות בית/ });
  await expect(remembered).toHaveCount(1);
  await expect(remembered).toContainText('260');

  // The favorites tab lists it, and asks before removing it.
  await sheet.getByText(he.addMeal.tabFavorites, { exact: true }).click();
  await sheet.getByRole('button', { name: he.addMeal.removeFavorite('עוגיות בית') }).click();
  await sheet.getByRole('button', { name: he.addMeal.removeFavoriteYes }).click();
  await expect(sheet.getByText(he.addMeal.tabFavorites, { exact: true })).toHaveCount(0);
  await expect(sheet.getByLabel(he.addMeal.searchLabel)).toBeVisible();
});

test('REMEMBER-03: a food typed by hand into a meal of foods can be remembered, and joins the next meal', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  const open = () => page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  const addEgg = async () => {
    await sheet.getByLabel(he.addMeal.searchLabel).fill('ביצה');
    await sheet
      .getByRole('button', { name: /ביצה שלמה בלי קליפה/ })
      .first()
      .click();
    await sheet.getByLabel(he.addMeal.count).fill('2'); // 142 kcal
    await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();
  };

  await open();
  await addEgg();
  await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();
  await expect(sheet.getByLabel(he.addMeal.rememberManual)).toBeChecked(); // on by default
  await sheet.getByLabel(he.addMeal.itemName).fill('עוגיות בית');
  await sheet.getByLabel(he.addMeal.kcalField).fill('200');
  await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();
  await sheet.getByLabel(he.addMeal.rememberManual).uncheck();
  await sheet.getByLabel(he.addMeal.itemName).fill('חטיף חד פעמי');
  await sheet.getByLabel(he.addMeal.kcalField).fill('90');
  await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(page.getByText(he.today.saved)).toBeVisible();

  // Only the one left switched on is remembered.
  await open();
  await sheet.getByLabel(he.addMeal.searchLabel).fill('חטיף חד');
  await expect(sheet.getByText(he.addMeal.myFoods)).toHaveCount(0);
  await sheet.getByLabel(he.addMeal.searchLabel).fill('עוגיות בית');
  const remembered = sheet.getByRole('button', { name: /^עוגיות בית/ });
  await expect(remembered).toHaveCount(1);

  // Picked into a meal that already has foods, it joins them instead of replacing them.
  await sheet.getByLabel(he.addMeal.searchLabel).fill('');
  await addEgg();
  await sheet.getByLabel(he.addMeal.searchLabel).fill('עוגיות בית');
  await remembered.click();
  await expect(sheet.getByText(he.addMeal.byHand)).toBeVisible();
  await expect(sheet.getByText(/ביצה שלמה בלי קליפה/)).toBeVisible();
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(page.getByText(he.today.saved)).toBeVisible();
  // 1,390 - (142 + 200 + 90) - (142 + 200)
  await expect(remaining(page)).toHaveAttribute('aria-label', /616/);
});

test('CHART-08: each meal is a numbered marker on the line, and the list says what each number is', async ({
  page,
  isMobile,
}) => {
  // 08:00 white bread, 08:30 omelette, 13:00 whole-wheat bread: three meals, in time order.
  await openApp(page, { seed: { withMealsToday: true, withBreadMealsToday: true } });
  const chart = page.getByRole('figure', { name: he.today.chartTitle });
  // A phone lists the meals under the chart; a computer has them in the meals card beside it.
  const rows = isMobile
    ? chart.getByRole('list', { name: he.today.mealsListLabel }).getByRole('listitem')
    : page.getByRole('region', { name: he.today.mealsTitle }).getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('לחם לבן');
  await expect(rows.nth(1)).toContainText('חביתה וסלט');
  await expect(rows.nth(2)).toContainText('לחם מלא');
  await expect(rows.nth(1)).toContainText('280');
  for (const [index, number] of ['1', '2', '3'].entries()) {
    await expect(rows.nth(index)).toContainText(number);
  }
  // the numbers on the line are the same 1, 2, 3
  await expect(chart.locator('svg[role="img"] text', { hasText: /^[123]$/ })).toHaveText([
    '1',
    '2',
    '3',
  ]);
});

test.describe('the computer layout', () => {
  test.skip(({ isMobile }) => isMobile, 'a phone keeps its own layout');

  test('DESK-01: the day fits one screen, with my picture, the next meal and the week', async ({
    page,
  }) => {
    await openApp(page, { seed: { withMealsToday: true }, time: `${TODAY}T16:10:00+03:00` });
    await expect(page.getByRole('img', { name: he.nav.avatarAlt })).toBeVisible();
    await expect(page.getByRole('region', { name: he.today.weekTitle })).toBeVisible();
    await expect(page.locator('#next-title')).toBeVisible(); // the next meal, open, above the week
    // nothing to scroll: the whole day is in view
    const overflow = await page.evaluate(() => {
      const main = document.getElementById('main');
      return main ? main.scrollHeight - main.clientHeight : -1;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('DESK-03: clicking a day in the week shows that day, and "back to today" returns', async ({
    page,
  }) => {
    await openApp(page, { seed: { withMealsToday: true }, time: `${TODAY}T16:10:00+03:00` });
    const week = page.getByRole('region', { name: he.today.weekTitle });
    const meals = page.getByRole('region', { name: he.today.mealsTitle });
    await expect(meals).toContainText('חביתה וסלט'); // today's meal

    // yesterday (1 October) has three meals in the seed
    await week.getByRole('button', { name: /1 באוק/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('1 באוקטובר');
    await expect(page.getByText(he.today.viewingPast)).toBeVisible();
    await expect(meals).toContainText('קוטג׳ ולחם');
    await expect(meals).toContainText('סלט טונה');
    await expect(meals).not.toContainText('חביתה וסלט');
    await expect(week.getByRole('button', { name: /1 באוק/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // the ring shows that day's own total: 320 + 620 + 430 = 1,370 of 1,390
    await expect(
      page.getByRole('img', { name: new RegExp(`${he.today.ringRemaining} 20 `) }),
    ).toBeVisible();
    // an earlier day has no next meal: the chart takes its place, so the top row reaches the week's edge
    const chart = page.getByRole('figure', { name: he.today.chartTitle });
    const edgeGap = async (): Promise<number> => {
      const [chartBox, weekBox] = await Promise.all([chart.boundingBox(), week.boundingBox()]);
      return Math.abs((chartBox?.x ?? 0) - (weekBox?.x ?? 1e6));
    };
    expect(await edgeGap()).toBeLessThan(2);

    await page.getByRole('button', { name: he.today.backToToday }).click();
    expect(await edgeGap()).toBeGreaterThan(100); // today: the next meal sits there
    await expect(page.getByRole('heading', { level: 1 })).toContainText('2 באוקטובר');
    await expect(meals).toContainText('חביתה וסלט');
  });

  // The week is always the seven days that end today (never Sunday to Saturday), and it does not move when
  // another day is picked.
  test('DESK-04: on a Sunday the week runs from last Monday to today', async ({ page }) => {
    await openApp(page, { seed: {}, time: '2026-10-04T10:00:00+03:00' }); // a Sunday
    const week = page.getByRole('region', { name: he.today.weekTitle });
    const days = week.getByRole('listitem');
    await expect(days).toHaveCount(7);
    await expect(days.first()).toContainText('28'); // Monday 28 September
    await expect(days.last()).toContainText('4 באוק'); // today
    await expect(week.getByRole('button', { name: /30 בספט/ })).toBeVisible();

    await week.getByRole('button', { name: /1 באוק/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('1 באוקטובר');
    await expect(days.first()).toContainText('28'); // the week stayed where it was
    await expect(days.last()).toContainText('4 באוק');
  });

  test('DESK-05: three days later the week has moved with today', async ({ page }) => {
    await openApp(page, { seed: {}, time: '2026-10-07T10:00:00+03:00' }); // a Wednesday
    const week = page.getByRole('region', { name: he.today.weekTitle });
    const days = week.getByRole('listitem');
    await expect(days).toHaveCount(7);
    await expect(days.first().getByRole('button', { name: /1 באוק/ })).toBeVisible(); // a week back: Thursday 1 October (it has meals)
    await expect(days.last()).toContainText('7 באוק');
    await expect(week.getByRole('button', { name: /30 בספט/ })).toHaveCount(0); // now too old
  });

  test('DESK-02: light and dark are both shown, the one in use is marked, and a click switches', async ({
    page,
  }) => {
    await openApp(page, { seed: {} });
    const group = page.getByRole('group', { name: he.nav.themeLabel });
    const light = group.getByRole('button', { name: he.nav.themeLight });
    const dark = group.getByRole('button', { name: he.nav.themeDark });
    await expect(light).toHaveAttribute('aria-pressed', 'true');
    await expect(dark).toHaveAttribute('aria-pressed', 'false');

    await dark.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(dark).toHaveAttribute('aria-pressed', 'true');
    await expect(light).toHaveAttribute('aria-pressed', 'false');

    // the choice made in Settings shows up on the same switch
    await page.getByRole('link', { name: he.nav.settings }).click();
    await page.getByRole('combobox', { name: he.settings.theme }).selectOption('light');
    await expect(light).toHaveAttribute('aria-pressed', 'true');
  });
});

test('the phone layout has no side bar', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await openApp(page, { seed: {} });
  await expect(page.getByRole('img', { name: he.nav.avatarAlt })).toBeHidden();
  await expect(page.getByRole('group', { name: he.nav.themeLabel })).toBeHidden();
});

test('DAY-01: before 02:00 it is still the day before, and a meal added then belongs to it', async ({
  page,
}) => {
  // 01:00 on the night of 2-3 October: the day on screen is the 2nd.
  await openApp(page, { seed: {}, time: '2026-10-03T01:00:00+03:00' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('2 באוקטובר');
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,390/);

  await page.getByRole('button', { name: he.today.addMeal }).first().click();
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();
  await expect(sheet.getByLabel(he.addMeal.time)).toHaveValue('01:00');
  await sheet.getByLabel(he.addMeal.name).fill('נשנוש לילה');
  await sheet.getByLabel(he.addMeal.kcalField).fill('150');
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();

  // it is in the list of the day on screen, and counts there
  await expect(page.getByRole('button', { name: he.today.deleteMeal('נשנוש לילה') })).toBeVisible();
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,240/); // 1,390 - 150
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

test('E2E-06: a suggestion can be added with one confirmation', async ({ page, isMobile }) => {
  await openApp(page, { seed: {}, time: `${TODAY}T11:00:00+03:00` });
  const suggestions = page.getByRole('region', { name: he.today.nextMeal });
  if (isMobile) {
    // A drop-down on a phone, closed by default: the suggestions are not on the page until they are asked for.
    await expect(suggestions.getByText(he.slotMeal.lunch)).toBeHidden();
    await expect(suggestions.getByRole('button', { name: new RegExp(`^${he.add}:`) })).toHaveCount(
      0,
    );
    await suggestions.locator('summary').click();
  }
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
