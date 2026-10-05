import { expect, test, type Page } from '@playwright/test';
import { he } from '../src/i18n/he';
import { TODAY, openApp, openNewMeal } from './helpers';

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

  await openNewMeal(page);
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
  await openNewMeal(page);
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
  await openNewMeal(page);
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

  await openNewMeal(page);
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
  await openNewMeal(page);
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
  await openNewMeal(page);
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

test('FLOUR-01: the day tells white flour from whole grain', async ({ page }) => {
  await openApp(page, { seed: { withBreadMealsToday: true } });
  const card = page.getByRole('region', { name: he.flour.title });
  await expect(card.getByRole('img', { name: he.flour.summary('44.7', '30') })).toBeVisible();
  // the card does not suggest what to eat instead (that hint is only in the food editor)
  await expect(card.getByText(he.flour.swap.bread)).toHaveCount(0);
});

test('FLOUR-02: a food says whether it is white flour or whole grain, and what to try instead', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  await expect(page.getByText(he.flour.empty)).toBeVisible();
  await openNewMeal(page);
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByLabel(he.addMeal.searchLabel).fill('לחם לבן');
  await expect(sheet.getByText(new RegExp(he.flour.tag.refined)).first()).toBeVisible();
  await sheet
    .getByRole('button', { name: /^לחם לבן, קלוי/ })
    .first()
    .click();
  await expect(sheet.getByText(he.flour.swapHint(he.flour.swap.bread))).toBeVisible();
});

test('FLOUR-03: a meal typed by hand splits its carbohydrate into white flour and whole grains', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  const card = page.getByRole('region', { name: he.flour.title });
  await openNewMeal(page);
  const sheet = page.getByRole('dialog', { name: he.addMeal.title });
  await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();
  await sheet.getByLabel(he.addMeal.name).fill('כריך ביתי');
  await sheet.getByLabel(he.addMeal.kcalField).fill('420');
  await sheet.getByLabel(he.addMeal.macrosToggle).check();
  await sheet.getByLabel(he.addMeal.proteinField, { exact: true }).fill('15');
  await sheet.getByLabel(he.addMeal.fatField, { exact: true }).fill('12');
  await sheet.getByLabel(he.addMeal.refinedCarbsField, { exact: true }).fill('20');
  await sheet.getByLabel(he.addMeal.wholeCarbsField, { exact: true }).fill('15,5');

  // With the carbohydrate field left empty, the total is the sum of the two parts.
  await expect(sheet.getByLabel(he.addMeal.carbsField, { exact: true })).toHaveAttribute(
    'placeholder',
    /35[.,]5/,
  );

  // Two parts that are more than the carbohydrate typed are refused, and say so.
  await sheet.getByLabel(he.addMeal.carbsField, { exact: true }).fill('30');
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(sheet.getByText(he.errors.grain_exceeds_carbs)).toBeVisible();

  await sheet.getByLabel(he.addMeal.carbsField, { exact: true }).fill('');
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(card.getByRole('img', { name: he.flour.summary('20', '15.5') })).toBeVisible();
  // The meal itself has the sum as its carbohydrate (and so does the day).
  await expect(page.locator('li.card', { hasText: 'כריך ביתי' })).toBeVisible();
});

test('FLOUR-04: a meal entered earlier gets the split when it is edited, and it is there next time', async ({
  page,
}) => {
  await openApp(page, { seed: { withMealsToday: true } }); // "חביתה וסלט": 12 g of carbohydrate, no split
  const card = page.getByRole('region', { name: he.flour.title });
  await expect(card.getByText(he.flour.empty)).toBeVisible();

  await page.getByRole('button', { name: he.today.editMeal('חביתה וסלט') }).click();
  let sheet = page.getByRole('dialog', { name: he.addMeal.editTitle });
  await expect(sheet.getByLabel(he.addMeal.refinedCarbsField, { exact: true })).toHaveValue('');
  await sheet.getByLabel(he.addMeal.refinedCarbsField, { exact: true }).fill('5');
  await sheet.getByLabel(he.addMeal.wholeCarbsField, { exact: true }).fill('7');
  await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
  await expect(card.getByRole('img', { name: he.flour.summary('5', '7') })).toBeVisible();

  await page.getByRole('button', { name: he.today.editMeal('חביתה וסלט') }).click();
  sheet = page.getByRole('dialog', { name: he.addMeal.editTitle });
  await expect(sheet.getByLabel(he.addMeal.refinedCarbsField, { exact: true })).toHaveValue('5');
  await expect(sheet.getByLabel(he.addMeal.wholeCarbsField, { exact: true })).toHaveValue('7');
});

test('DRAFT-01: a click beside the sheet does not hide a meal being typed; closing keeps it, and it can be dropped', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  const open = () => openNewMeal(page);
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
  const open = () => openNewMeal(page);
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
  const open = () => openNewMeal(page);
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
  const row = sheet.getByRole('button', { name: /^יוגורט פרו של דנונה/ });
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
  const open = () => openNewMeal(page);
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

  // There is no list of its own for remembered foods: it is removed where it is found, after asking.
  await sheet.getByRole('button', { name: he.addMeal.removeFavorite('עוגיות בית') }).click();
  await sheet.getByRole('button', { name: he.cancel }).click(); // keeps it
  await expect(remembered).toHaveCount(1);
  await sheet.getByRole('button', { name: he.addMeal.removeFavorite('עוגיות בית') }).click();
  await sheet.getByRole('button', { name: he.addMeal.removeFavoriteYes }).click();
  await expect(sheet.getByText(he.addMeal.myFoods)).toHaveCount(0);
  await expect(remembered).toHaveCount(0);
});

test('REMEMBER-03: a food typed by hand into a meal of foods can be remembered, and joins the next meal', async ({
  page,
}) => {
  await openApp(page, { seed: {} });
  const open = () => openNewMeal(page);
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
  if (isMobile) {
    // each meal has a whole row of its own: never two side by side
    const list = await chart.getByRole('list', { name: he.today.mealsListLabel }).boundingBox();
    for (const index of [0, 1, 2]) {
      const box = await rows.nth(index).boundingBox();
      expect(Math.abs((box?.width ?? 0) - (list?.width ?? 1e6))).toBeLessThan(2);
    }
  }
  // the numbers on the line are the same 1, 2, 3
  await expect(chart.locator('svg[role="img"] text', { hasText: /^[123]$/ })).toHaveText([
    '1',
    '2',
    '3',
  ]);
});

test('CHART-09: the word "now" sits half way, in height, between the legend and the top line of the grid', async ({
  page,
}) => {
  await openApp(page, { seed: { withMealsToday: true } });
  const chart = page.getByRole('figure', { name: he.today.chartTitle });
  const drawing = chart.locator('svg[role="img"]');
  const now = drawing.locator('text', { hasText: new RegExp(`^${he.today.now}$`) });
  await expect(now).toBeVisible();
  await page.waitForTimeout(400); // the drawing and the legend have settled
  const [legend, word, topLine] = await Promise.all([
    chart.getByRole('list', { name: 'מקרא' }).boundingBox(),
    now.boundingBox(),
    drawing.locator('line[stroke="var(--faint)"]').last().boundingBox(), // the highest number on the scale
  ]);
  const middle = ((legend?.y ?? 0) + (legend?.height ?? 0) + (topLine?.y ?? 0)) / 2;
  const wordMiddle = (word?.y ?? 0) + (word?.height ?? 0) / 2;
  expect(Math.abs(wordMiddle - middle)).toBeLessThan(3);
});

test.describe('the phone layout', () => {
  test.skip(({ isMobile }) => !isMobile, 'a computer has its own layout');

  test('PHONE-01: the week is at the bottom of the day, and a day in it opens on the whole screen', async ({
    page,
  }) => {
    await openApp(page, { seed: { withMealsToday: true } });
    const week = page.getByRole('region', { name: he.today.weekTitle });
    const meals = page.getByRole('region', { name: he.today.mealsTitle });
    await expect(week).toBeVisible();
    // it comes after the meals of the day
    const [mealsBox, weekBox] = await Promise.all([meals.boundingBox(), week.boundingBox()]);
    expect((weekBox?.y ?? 0) > (mealsBox?.y ?? 1e6)).toBe(true);
    // the days of the last week with meals are there, with the average
    await expect(week.getByText(/ממוצע: .* קק"ל \(\d+ ימים\)/)).toBeVisible();
    await expect(week.getByText('1,370', { exact: true })).toBeVisible(); // yesterday: 320 + 620 + 430
    // no sideways scroll
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
    await expect(meals).toContainText('חביתה וסלט'); // today's meal

    // Pressing yesterday brings its meals to the screen, from the top.
    await week.getByRole('button', { name: /1 באוק/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('1 באוקטובר');
    await expect(page.getByText(he.today.viewingPast)).toBeVisible();
    await expect(meals).toContainText('קוטג׳ ולחם');
    await expect(meals).not.toContainText('חביתה וסלט');
    await expect(week.getByRole('button', { name: /1 באוק/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);

    // "back to today" is right under the title.
    await page.getByRole('button', { name: he.today.backToToday }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('2 באוקטובר');
    await expect(meals).toContainText('חביתה וסלט');
    await expect(page.getByRole('button', { name: he.today.backToToday })).toHaveCount(0);
  });
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

  await openNewMeal(page);
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

test('E2E-05: deleting a meal asks first, and there is no undo afterwards', async ({ page }) => {
  await openApp(page, { seed: { withMealsToday: true } });
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,110/); // 1,390 - 280
  const deleteButton = page.getByRole('button', { name: he.today.deleteMeal('חביתה וסלט') });

  // "cancel" leaves the meal where it is
  await deleteButton.click();
  const confirm = page.getByRole('dialog', { name: he.today.deleteConfirmTitle });
  await expect(confirm).toContainText('חביתה וסלט');
  await confirm.getByRole('button', { name: he.cancel }).click();
  await expect(confirm).toBeHidden();
  await expect(deleteButton).toBeVisible();
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,110/);

  // confirming deletes it, with a plain message and no "undo"
  await deleteButton.click();
  await page
    .getByRole('dialog', { name: he.today.deleteConfirmTitle })
    .getByRole('button', { name: he.today.deleteConfirmAction })
    .click();
  await expect(page.getByText(he.today.deleted)).toBeVisible();
  await expect(page.getByRole('button', { name: he.undo })).toHaveCount(0);
  await expect(deleteButton).toHaveCount(0);
  await expect(remaining(page)).toHaveAttribute('aria-label', /1,390/);
});

test('INT-05: pressing save twice quickly creates only one meal', async ({ page }) => {
  await openApp(page, { seed: {} });
  await openNewMeal(page);
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

test('DETAILS-01: pressing a meal shows its details, to read only; edit and delete still work', async ({
  page,
}) => {
  await openApp(page, { seed: { withMealsToday: true } });
  // "חביתה וסלט": 280 kcal, 18 g protein, 12 g carbohydrate, 18 g fat, typed by hand
  await page.getByRole('button', { name: he.today.mealDetails.open('חביתה וסלט') }).click();
  const details = page.getByRole('dialog', { name: 'חביתה וסלט' });
  await expect(details).toBeVisible();
  await expect(details).toContainText('280');
  await expect(details).toContainText(he.today.protein);
  await expect(details).toContainText(he.today.carbs);
  await expect(details).toContainText(he.today.fat);
  await expect(details).toContainText(he.today.mealDetails.typedByHand);
  await expect(details).toContainText(he.today.mealDetails.sugarUnknown);
  // nothing to change in it: the only button is the one that closes it
  await expect(details.getByRole('button')).toHaveCount(1);
  await expect(details.getByRole('button', { name: he.close })).toBeVisible();
  await details.getByRole('button', { name: he.close }).click();
  await expect(details).toBeHidden();

  // the pencil and the bin beside the meal are still their own buttons
  await page.getByRole('button', { name: he.today.editMeal('חביתה וסלט') }).click();
  await expect(page.getByRole('dialog', { name: he.addMeal.editTitle })).toBeVisible();
});

test('DETAILS-02: the details of a meal of foods list each food with its amount and numbers', async ({
  page,
}) => {
  await openApp(page, { seed: { withBreadMealsToday: true } });
  await page.getByRole('button', { name: he.today.mealDetails.open('לחם לבן') }).click();
  const details = page.getByRole('dialog', { name: 'לחם לבן' });
  await expect(details.getByText(he.today.mealDetails.itemsTitle)).toBeVisible();
  await expect(details.getByText('לחם לבן, קלוי')).toBeVisible();
  await expect(details.getByText(/2 × פרוסה בינונית/)).toBeVisible();
  await expect(details.getByText(he.flour.tag.refined, { exact: true })).toBeVisible();
  await expect(details.getByText(new RegExp(`${he.flour.refinedLabel}: 44.7`))).toBeVisible();
});

test.describe('saved meals', () => {
  /** Adds a meal typed by hand, with "save this meal" ticked. */
  async function addAndSave(page: Page, name: string, kcal: string): Promise<void> {
    await openNewMeal(page);
    const sheet = page.getByRole('dialog', { name: he.addMeal.title });
    await sheet.getByText(he.addMeal.tabManual, { exact: true }).click();
    await sheet.getByLabel(he.addMeal.name).fill(name);
    await sheet.getByLabel(he.addMeal.kcalField).fill(kcal);
    await sheet.getByLabel(he.addMeal.saveMealToggle).check();
    await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
    await expect(page.getByText(he.today.savedAndKept)).toBeVisible();
  }

  async function openSavedMeals(page: Page) {
    await page.getByRole('button', { name: he.today.addMeal }).first().click();
    await page.getByRole('button', { name: he.today.addSavedMeal }).click();
    return page.getByRole('dialog', { name: he.saved.title });
  }

  test('SAVED-01: "ate this again" is gone, and the add button offers a new meal or a saved one', async ({
    page,
  }) => {
    await openApp(page, { seed: { withMealsToday: true } });
    await expect(page.getByRole('button', { name: /אכלתי שוב/ })).toHaveCount(0);

    const add = page.getByRole('button', { name: he.today.addMeal }).first();
    await expect(add).toHaveAttribute('aria-expanded', 'false');
    await add.click();
    await expect(add).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: he.today.addNewMeal })).toBeVisible();
    await expect(page.getByRole('button', { name: he.today.addSavedMeal })).toBeVisible();
    await page.keyboard.press('Escape'); // closes the list again
    await expect(page.getByRole('button', { name: he.today.addNewMeal })).toHaveCount(0);
    await expect(add).toBeFocused();
  });

  test('SAVED-02: a saved meal opens ready to confirm, and the window has no tabs or search', async ({
    page,
  }) => {
    await openApp(page, { seed: {} });
    await addAndSave(page, 'ארוחת צהריים של שבת', '600');
    await expect(remaining(page)).toHaveAttribute('aria-label', /790/); // 1,390 - 600

    const saved = await openSavedMeals(page);
    await expect(saved.getByText('ארוחת צהריים של שבת')).toBeVisible();
    // only the saved meals: no tabs, no search box, no foods eaten lately
    await expect(saved.getByText(he.addMeal.tabSearch, { exact: true })).toHaveCount(0);
    await expect(saved.getByLabel(he.addMeal.searchLabel)).toHaveCount(0);

    await saved.getByRole('button', { name: he.saved.useAria('ארוחת צהריים של שבת') }).click();
    const sheet = page.getByRole('dialog', { name: he.addMeal.title });
    await expect(sheet.getByLabel(he.addMeal.name)).toHaveValue('ארוחת צהריים של שבת');
    await expect(sheet.getByLabel(he.addMeal.kcalField)).toHaveValue('600');
    await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
    await expect(page.getByText(he.today.saved, { exact: true })).toBeVisible();
    await expect(remaining(page)).toHaveAttribute('aria-label', /190/); // 1,390 - 2 x 600
  });

  test('SAVED-03: a meal of foods is saved with its foods, and saving the same name again replaces it', async ({
    page,
  }) => {
    await openApp(page, { seed: {} });
    await openNewMeal(page);
    const sheet = page.getByRole('dialog', { name: he.addMeal.title });
    await sheet.getByLabel(he.addMeal.searchLabel).fill('ביצה');
    await sheet
      .getByRole('button', { name: /ביצה שלמה בלי קליפה/ })
      .first()
      .click();
    await sheet.getByLabel(he.addMeal.count).fill('2'); // 142 kcal
    await sheet.getByRole('button', { name: he.addMeal.addToMeal }).click();
    await sheet.getByLabel(he.addMeal.saveMealToggle).check();
    await sheet.getByRole('button', { name: he.addMeal.saveMeal }).click();
    await expect(page.getByText(he.today.savedAndKept)).toBeVisible();

    const saved = await openSavedMeals(page);
    await saved.getByRole('button', { name: he.saved.useAria('ביצה שלמה בלי קליפה') }).click();
    // it comes back with its foods, not as one line of numbers
    const again = page.getByRole('dialog', { name: he.addMeal.title });
    await expect(again.getByRole('heading', { name: he.addMeal.items })).toBeVisible();
    await expect(again.getByText(/142/).first()).toBeVisible();
    // saving it once more under the same name keeps a single saved meal
    await again.getByLabel(he.addMeal.saveMealToggle).check();
    await again.getByRole('button', { name: he.addMeal.saveMeal }).click();
    await expect(page.getByText(he.today.savedAndKept)).toBeVisible();
    const list = await openSavedMeals(page);
    await expect(list.getByRole('listitem')).toHaveCount(1);
  });

  test('SAVED-04: deleting a saved meal asks first; the list says so when it is empty', async ({
    page,
  }) => {
    await openApp(page, { seed: {} });
    const empty = await openSavedMeals(page);
    await expect(empty.getByText(he.saved.empty)).toBeVisible();
    await empty.getByRole('button', { name: he.close }).click();

    await addAndSave(page, 'שייק בוקר', '300');
    const saved = await openSavedMeals(page);
    const trash = saved.getByRole('button', { name: he.saved.remove('שייק בוקר') });
    await trash.click();
    await saved.getByRole('button', { name: he.cancel }).click(); // keeps it
    await expect(saved.getByText('שייק בוקר')).toBeVisible();
    await trash.click();
    await saved.getByRole('button', { name: he.saved.removeYes }).click();
    await expect(saved.getByText(he.saved.empty)).toBeVisible();
  });
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
