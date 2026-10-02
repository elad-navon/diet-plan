import { type Page } from '@playwright/test';
import { type StoredMeal, type StoredPlan, type WeightRecord } from '../src/data';
import { computePlan, type PlanInputs } from '../src/core/nutrition';
import { DEFAULT_SCHEDULE } from '../src/core/schedule';
import { wallToInstant } from '../src/core/time';

export const TZ = 'Asia/Jerusalem';
/** "Today" in every test: a Friday morning, before the clock-change dates. */
export const TODAY = '2026-10-02';
export const STORAGE_KEY = 'diet-plan.v1';

const inputs: PlanInputs = {
  sex: 'female',
  birthDate: '1992-03-15',
  onDate: '2026-09-25',
  heightCm: 165,
  weightKg: 71,
  activity: 'light',
  goal: { type: 'lose', targetWeightKg: 62, request: { mode: 'rate', weeklyRateKg: 0.5 } },
};

function meal(
  id: string,
  date: string,
  time: string,
  name: string,
  kcal: number,
  macros: [number, number, number] | null = null,
): StoredMeal {
  const eatenAt = wallToInstant(date, time, TZ);
  return {
    id,
    name,
    localDate: date,
    eatenAt,
    tz: TZ,
    slot: 'breakfast',
    kcal,
    proteinG: macros?.[0] ?? null,
    carbsG: macros?.[1] ?? null,
    fatG: macros?.[2] ?? null,
    items: [],
    addedSugarG: null,
    source: 'manual',
    version: 1,
    enteredAt: eatenAt,
    deletedAt: null,
  };
}

export interface SeedOptions {
  withMealsToday?: boolean;
  /** A meal from the food database, saved before sugar was tracked: its items carry no sugar fields. */
  withOldFoodMealToday?: boolean;
}

/** A glass (240 g) of apple juice, saved the way the app did before added sugar existed. */
const oldJuiceMeal = (): StoredMeal => ({
  ...meal('o1', TODAY, '09:00', 'מיץ תפוחים', 115, [0.2, 28.8, 0]),
  source: 'food_db',
  items: [
    {
      foodId: '3371',
      name: 'מיץ תפוחים, משקה סיידר הגליל',
      grams: 240,
      unit: 'כוס',
      count: 1,
      kcal: 115,
      proteinG: 0.2,
      carbsG: 28.8,
      fatG: 0,
    },
  ],
});

/** A user who finished onboarding a week ago: a plan, a few weigh-ins and some meals. */
export function seedDocument(options: SeedOptions = {}): string {
  const outcome = computePlan(inputs);
  if (outcome.kind !== 'plan') throw new Error('seed plan failed');
  const { plan } = outcome;
  const stored: StoredPlan = {
    id: 'plan-1',
    effectiveFrom: '2026-09-25',
    kcalTarget: plan.kcalTarget,
    kcalFloor: plan.kcalFloor,
    macros: plan.macros,
    macroState: plan.macroState,
    schedule: DEFAULT_SCHEDULE,
    inputs,
    plan,
    createdAt: 0,
  };
  const weights: WeightRecord[] = [
    ['2026-09-25', 71],
    ['2026-09-29', 70.6],
    ['2026-10-01', 70.4],
  ].map(([date, kg], i) => ({
    id: `w${i}`,
    localDate: date as string,
    kg: kg as number,
    measuredAt: wallToInstant(date as string, '07:00', TZ),
    version: 1,
  }));
  const meals: StoredMeal[] = [
    meal('y1', '2026-10-01', '08:00', 'קוטג׳ ולחם', 320, [22, 30, 10]),
    meal('y2', '2026-10-01', '13:00', 'עוף ואורז', 620, [45, 65, 14]),
    meal('y3', '2026-10-01', '19:30', 'סלט טונה', 430, [32, 20, 22]),
    meal('y4', '2026-09-30', '13:00', 'פסטה', 700),
    ...(options.withMealsToday
      ? [meal('t1', TODAY, '08:30', 'חביתה וסלט', 280, [18, 12, 18])]
      : []),
    ...(options.withOldFoodMealToday ? [oldJuiceMeal()] : []),
  ];
  return JSON.stringify({
    version: 1,
    profile: {
      sex: 'female',
      birthDate: '1992-03-15',
      heightCm: 165,
      timezone: TZ,
      disclaimerAckAt: 0,
    },
    plans: [stored],
    meals,
    weights,
    favorites: [],
  });
}

/** Fixes the browser clock and, if asked, pre-fills the app's storage before the page loads. */
export async function openApp(
  page: Page,
  options: { seed?: SeedOptions | false; time?: string; path?: string } = {},
): Promise<void> {
  await page.clock.setFixedTime(options.time ?? `${TODAY}T10:00:00+03:00`);
  if (options.seed !== false) {
    const document_ = seedDocument(options.seed ?? {});
    await page.addInitScript(
      ({ key, value }) => {
        if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
      },
      { key: STORAGE_KEY, value: document_ },
    );
  }
  await page.goto(options.path ?? '/today');
}
