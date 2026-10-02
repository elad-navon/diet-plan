import { type FoodRecord } from './types';

export const FOOD_LIMITS = {
  gramsMin: 1,
  gramsMax: 5000,
  countMin: 0.25,
  countMax: 50,
  countStep: 0.25,
} as const;

/** How much of a food was eaten: a weight, or a number of the database's units (e.g. 2 x "כף"). */
export type Quantity =
  { kind: 'grams'; grams: number } | { kind: 'unit'; unit: string; count: number };

/** One food in a meal, with its values already calculated and rounded (a snapshot, not a link). */
export interface FoodEntry {
  foodId: string;
  name: string;
  grams: number;
  unit?: string;
  count?: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Total sugars, estimated ADDED sugar and fiber of this amount; absent when the database has no value. */
  sugarG?: number;
  addedSugarG?: number;
  fiberG?: number;
}

export type EntryError =
  'grams_out_of_range' | 'count_out_of_range' | 'count_not_in_steps' | 'unknown_unit';

export type EntryResult = { ok: true; entry: FoodEntry } | { ok: false; error: EntryError };

/**
 * Rounds half up after discarding floating-point noise, so 0.7 x 1.5 (stored as 1.0499999999999998)
 * rounds to 1.1 like the decimal arithmetic it stands for.
 */
const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(Number((value * factor).toPrecision(12))) / factor;
};
const round1 = (value: number): number => roundTo(value, 1);

/**
 * Calories and macros for a quantity of a food. Each item is rounded exactly once (calories to a
 * whole number, macros to 0.1 g) so a meal's total is simply the sum of its rounded items.
 */
export function computeEntry(food: FoodRecord, quantity: Quantity): EntryResult {
  let grams: number;
  let unit: string | undefined;
  let count: number | undefined;

  if (quantity.kind === 'grams') {
    grams = quantity.grams;
  } else {
    const found = food.units.find((candidate) => candidate.name === quantity.unit);
    if (!found) return { ok: false, error: 'unknown_unit' };
    if (
      !Number.isFinite(quantity.count) ||
      quantity.count < FOOD_LIMITS.countMin ||
      quantity.count > FOOD_LIMITS.countMax
    ) {
      return { ok: false, error: 'count_out_of_range' };
    }
    const steps = quantity.count / FOOD_LIMITS.countStep;
    if (Math.abs(steps - Math.round(steps)) > 1e-9) {
      return { ok: false, error: 'count_not_in_steps' };
    }
    grams = found.grams * quantity.count;
    unit = found.name;
    count = quantity.count;
  }

  if (!Number.isFinite(grams) || grams < FOOD_LIMITS.gramsMin || grams > FOOD_LIMITS.gramsMax) {
    return { ok: false, error: 'grams_out_of_range' };
  }

  const scale = grams / 100;
  return {
    ok: true,
    entry: {
      foodId: food.id,
      name: food.name,
      grams: round1(grams),
      ...(unit !== undefined && count !== undefined ? { unit, count } : {}),
      kcal: roundTo(food.kcal100 * scale, 0),
      proteinG: round1(food.protein100 * scale),
      carbsG: round1(food.carbs100 * scale),
      fatG: round1(food.fat100 * scale),
      ...(food.sugar100 !== undefined ? { sugarG: round1(food.sugar100 * scale) } : {}),
      ...(food.addedSugar100 !== undefined
        ? { addedSugarG: round1(food.addedSugar100 * scale) }
        : {}),
      ...(food.fiber100 !== undefined ? { fiberG: round1(food.fiber100 * scale) } : {}),
    },
  };
}

export interface EntryTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Sums over the items that have the value; null when none does. */
  sugarG: number | null;
  addedSugarG: number | null;
  fiberG: number | null;
  /** How many items had no sugar value (the added-sugar total then covers only the others). */
  itemsWithoutSugar: number;
}

/** Meal totals: the sum of the already-rounded items (no second rounding of calories). */
export function sumEntries(entries: readonly FoodEntry[]): EntryTotals {
  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  let sugarG: number | null = null;
  let addedSugarG: number | null = null;
  let fiberG: number | null = null;
  let itemsWithoutSugar = 0;
  for (const entry of entries) {
    kcal += entry.kcal;
    proteinG += entry.proteinG;
    carbsG += entry.carbsG;
    fatG += entry.fatG;
    if (entry.sugarG !== undefined) sugarG = (sugarG ?? 0) + entry.sugarG;
    if (entry.addedSugarG !== undefined) addedSugarG = (addedSugarG ?? 0) + entry.addedSugarG;
    else itemsWithoutSugar += 1;
    if (entry.fiberG !== undefined) fiberG = (fiberG ?? 0) + entry.fiberG;
  }
  return {
    kcal,
    proteinG: round1(proteinG),
    carbsG: round1(carbsG),
    fatG: round1(fatG),
    sugarG: sugarG === null ? null : round1(sugarG),
    addedSugarG: addedSugarG === null ? null : round1(addedSugarG),
    fiberG: fiberG === null ? null : round1(fiberG),
    itemsWithoutSugar,
  };
}

/** The part of a database name before the first comma: "ביצה קשה שלמה, ללא קליפה" -> "ביצה קשה שלמה". */
export function shortFoodName(name: string): string {
  const head = name.split(',')[0]?.trim() ?? '';
  return head.length >= 2 ? head : name.trim();
}

const MEAL_NAME_MAX = 80;

/** A default meal name from its foods ("ביצה קשה שלמה + לחם"), cut to the 80-character limit. */
export function mealNameFromEntries(entries: readonly FoodEntry[]): string {
  const names = [...new Set(entries.map((entry) => shortFoodName(entry.name)))];
  const joined = names.join(' + ');
  return joined.length <= MEAL_NAME_MAX
    ? joined
    : `${joined.slice(0, MEAL_NAME_MAX - 1).trimEnd()}…`;
}
