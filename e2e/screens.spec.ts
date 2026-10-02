import { test, type Page } from '@playwright/test';
import { he } from '../src/i18n/he';
import { openApp } from './helpers';

/**
 * Screenshots for human review: `SCREENSHOTS=1 npx playwright test e2e/screens.spec.ts`.
 * Written to test-results/screens/. Skipped in normal runs.
 */
test.skip(!process.env['SCREENSHOTS'], 'set SCREENSHOTS=1 to capture screens');

const OUT = 'test-results/screens';

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(500); // let the ring animation finish
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ viewport: { width: 360, height: 780 } });
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    test('today', async ({ page }) => {
      await openApp(page, { seed: { withMealsToday: true }, time: '2026-10-02T11:40:00+03:00' });
      await page.getByRole('heading', { level: 1 }).waitFor();
      await shot(page, `today-${scheme}`);
      await page
        .locator('figure')
        .first()
        .screenshot({ path: `${OUT}/chart-day-${scheme}.png` });
    });

    test('progress', async ({ page }) => {
      await openApp(page, { seed: {}, path: '/progress' });
      await page.getByRole('heading', { level: 1 }).waitFor();
      await shot(page, `progress-${scheme}`);
      await page
        .locator('figure')
        .first()
        .screenshot({ path: `${OUT}/chart-weight-${scheme}.png` });
      await page
        .locator('figure')
        .nth(1)
        .screenshot({ path: `${OUT}/chart-week-${scheme}.png` });
    });

    test('settings', async ({ page }) => {
      await openApp(page, { seed: {}, path: '/settings' });
      await page.getByRole('heading', { level: 1 }).waitFor();
      await shot(page, `settings-${scheme}`);
    });

    test('welcome and result', async ({ page }) => {
      await openApp(page, { seed: false, path: '/welcome' });
      await shot(page, `welcome-1-${scheme}`);
      await page.getByText(he.sex.female, { exact: true }).click();
      await page.getByLabel(he.onboarding.birthDate).fill('1992-03-15');
      await page.getByRole('button', { name: he.next }).click();
      await page.getByLabel(he.onboarding.height).fill('165');
      await page.getByLabel(he.onboarding.weight).fill('71');
      await page.getByRole('button', { name: he.next }).click();
      await page.getByText(he.activity.light.name, { exact: true }).click();
      await page.getByLabel(he.onboarding.targetWeight).fill('62');
      await shot(page, `welcome-3-${scheme}`);
      await page.getByRole('button', { name: he.next }).click();
      await shot(page, `welcome-4-${scheme}`);
    });

    test('add meal sheet', async ({ page }) => {
      await openApp(page, { seed: {}, time: '2026-10-02T11:40:00+03:00' });
      await page.getByRole('button', { name: he.today.addMeal }).first().click();
      await page.getByLabel(he.addMeal.searchLabel).fill('קוטג');
      await page.waitForTimeout(400);
      await shot(page, `sheet-search-${scheme}`);
    });
  });
}
