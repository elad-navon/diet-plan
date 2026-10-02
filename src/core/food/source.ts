import { estimateAddedSugar } from './sugar';
import { type FoodRecord, type FoodUnit } from './types';

/**
 * Converts the Ministry of Health's raw tables (data.gov.il dataset "nutrition-database") into the
 * compact records the app ships. Pure and deterministic: the same input always gives the same output
 * (docs/ARCHITECTURE.md D.9, tests FOOD-04).
 */

export interface RawFoodRow {
  /** Food code; the key the weights table refers to. */
  Code: number | string | null;
  shmmitzrach: string | null;
  food_energy: number | string | null;
  protein: number | string | null;
  total_fat: number | string | null;
  carbohydrates: number | string | null;
  alcohol?: number | string | null;
  /** The 8-digit item code; its first two digits are the food group. */
  smlmitzrach?: number | string | null;
  total_sugars?: number | string | null;
  total_dietary_fiber?: number | string | null;
}

export interface RawUnitRow {
  smlmida: number | string;
  shmmida: string;
}

export interface RawWeightRow {
  /** Food code. */
  mmitzrach: number | string;
  /** Unit code. */
  mida: number | string;
  /** Grams in one such unit. */
  mishkal: number | string | null;
}

export interface RawFoodTables {
  foods: readonly RawFoodRow[];
  units: readonly RawUnitRow[];
  weights: readonly RawWeightRow[];
}

export type SkipReason =
  | 'bad_code'
  | 'duplicate_code'
  | 'no_name'
  | 'no_energy'
  | 'energy_out_of_range'
  | 'negative_macro'
  | 'macros_exceed_100g';

export interface AtwaterOutlier {
  id: string;
  name: string;
  kcal: number;
  fromMacros: number;
}

export interface BuildReport {
  inputFoods: number;
  kept: number;
  skipped: Record<SkipReason, number>;
  skippedExamples: { code: string; name: string; reason: SkipReason }[];
  /** Foods where a protein/fat/carbohydrate value was missing and treated as 0. */
  macroMissing: number;
  foodsWithUnits: number;
  /** Calories that disagree with 4P+4C+9F(+7 alcohol) by more than max(25, 20%): reported, not removed. */
  atwaterOutliers: AtwaterOutlier[];
}

export const SOURCE_LIMITS = {
  maxKcal100: 900,
  maxUnitGrams: 5000,
  /** Protein + carbohydrate + fat cannot exceed the 100 g they are measured in (a little slack for rounding). */
  maxMacroSumG: 105,
  /** The build fails if more than this share of input foods had to be skipped. */
  maxSkippedFraction: 0.02,
  /** ...or if more than this share of kept foods has implausible energy (suggests a column mix-up). */
  maxOutlierFraction: 0.25,
  atwaterFloorKcal: 25,
  atwaterFraction: 0.2,
} as const;

/** Units that are not real measures: grams are always available, kilograms add nothing. */
const IGNORED_UNIT_NAMES = new Set(['גרמים', 'קילוגרם']);
const DEFAULT_UNIT_PREFERENCE = [
  'יחידה',
  'מנה',
  'יחידה בינונית',
  'מנה בינונית',
  'פרוסה',
  'פרוסה בינונית',
  'כף',
  'כוס',
];

const cleanText = (text: string): string => text.replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

function emptyReport(inputFoods: number): BuildReport {
  return {
    inputFoods,
    kept: 0,
    skipped: {
      bad_code: 0,
      duplicate_code: 0,
      no_name: 0,
      no_energy: 0,
      energy_out_of_range: 0,
      negative_macro: 0,
      macros_exceed_100g: 0,
    },
    skippedExamples: [],
    macroMissing: 0,
    foodsWithUnits: 0,
    atwaterOutliers: [],
  };
}

function unitsByFood(tables: RawFoodTables): Map<string, FoodUnit[]> {
  const unitNames = new Map<string, string>();
  for (const unit of tables.units) {
    unitNames.set(String(unit.smlmida), cleanText(unit.shmmida));
  }
  const byFood = new Map<string, FoodUnit[]>();
  for (const row of tables.weights) {
    const name = unitNames.get(String(row.mida));
    const grams = toNumber(row.mishkal);
    if (!name || IGNORED_UNIT_NAMES.has(name)) continue;
    if (grams === null || grams <= 0 || grams > SOURCE_LIMITS.maxUnitGrams) continue;
    const key = String(row.mmitzrach);
    const list = byFood.get(key) ?? [];
    if (!list.some((existing) => existing.name === name)) {
      list.push({ name, grams: Math.round(grams * 100) / 100 });
    }
    byFood.set(key, list);
  }
  for (const list of byFood.values()) {
    list.sort((a, b) => a.grams - b.grams || a.name.localeCompare(b.name, 'he'));
  }
  return byFood;
}

export function buildFoodRecords(tables: RawFoodTables): {
  foods: FoodRecord[];
  report: BuildReport;
} {
  const report = emptyReport(tables.foods.length);
  const units = unitsByFood(tables);
  const seen = new Set<string>();
  const foods: FoodRecord[] = [];

  const skip = (code: string, name: string, reason: SkipReason): void => {
    report.skipped[reason] += 1;
    if (report.skippedExamples.length < 10) report.skippedExamples.push({ code, name, reason });
  };

  for (const row of tables.foods) {
    const code = toNumber(row.Code);
    const name = cleanText(row.shmmitzrach ?? '');
    if (code === null || !Number.isInteger(code) || code <= 0) {
      skip(String(row.Code), name, 'bad_code');
      continue;
    }
    const id = String(code);
    if (seen.has(id)) {
      skip(id, name, 'duplicate_code');
      continue;
    }
    if (name === '') {
      skip(id, name, 'no_name');
      continue;
    }
    const kcal = toNumber(row.food_energy);
    if (kcal === null) {
      skip(id, name, 'no_energy');
      continue;
    }
    if (kcal < 0 || kcal > SOURCE_LIMITS.maxKcal100) {
      skip(id, name, 'energy_out_of_range');
      continue;
    }

    const protein = toNumber(row.protein);
    const fat = toNumber(row.total_fat);
    const carbs = toNumber(row.carbohydrates);
    if ([protein, fat, carbs].some((value) => value !== null && value < 0)) {
      skip(id, name, 'negative_macro');
      continue;
    }
    if ((protein ?? 0) + (carbs ?? 0) + (fat ?? 0) > SOURCE_LIMITS.maxMacroSumG) {
      skip(id, name, 'macros_exceed_100g');
      continue;
    }
    if (protein === null || fat === null || carbs === null) report.macroMissing += 1;

    const foodUnits = units.get(id) ?? [];
    const defaultUnit = DEFAULT_UNIT_PREFERENCE.find((preferred) =>
      foodUnits.some((unit) => unit.name === preferred),
    );
    const sugars = toNumber(row.total_sugars);
    const fiber = toNumber(row.total_dietary_fiber);
    const group = String(row.smlmitzrach ?? '').slice(0, 2);
    const added = estimateAddedSugar({ group, name, sugarsPer100: sugars });
    const record: FoodRecord = {
      id,
      name,
      kcal100: round1(kcal),
      protein100: round1(protein ?? 0),
      carbs100: round1(carbs ?? 0),
      fat100: round1(fat ?? 0),
      units: foodUnits,
      ...(sugars !== null && sugars >= 0 ? { sugar100: round1(sugars) } : {}),
      ...(added !== null ? { addedSugar100: added } : {}),
      ...(fiber !== null && fiber >= 0 ? { fiber100: round1(fiber) } : {}),
      ...(defaultUnit !== undefined ? { defaultUnit } : {}),
    };
    seen.add(id);
    foods.push(record);
    if (foodUnits.length > 0) report.foodsWithUnits += 1;

    const fromMacros =
      4 * record.protein100 +
      4 * record.carbs100 +
      9 * record.fat100 +
      7 * (toNumber(row.alcohol) ?? 0);
    const allowed = Math.max(
      SOURCE_LIMITS.atwaterFloorKcal,
      SOURCE_LIMITS.atwaterFraction * record.kcal100,
    );
    if (Math.abs(record.kcal100 - fromMacros) > allowed) {
      report.atwaterOutliers.push({
        id,
        name,
        kcal: record.kcal100,
        fromMacros: round1(fromMacros),
      });
    }
  }

  foods.sort((a, b) => Number(a.id) - Number(b.id));
  report.kept = foods.length;
  return { foods, report };
}

/** Reasons the build must fail (empty = the data passed the quality gate). */
export function qualityFailures(report: BuildReport): string[] {
  const failures: string[] = [];
  if (report.kept === 0) failures.push('no foods were kept');
  const skipped = Object.values(report.skipped).reduce((a, b) => a + b, 0);
  if (report.inputFoods > 0 && skipped / report.inputFoods > SOURCE_LIMITS.maxSkippedFraction) {
    failures.push(`${skipped} of ${report.inputFoods} foods skipped (over the allowed share)`);
  }
  if (
    report.kept > 0 &&
    report.atwaterOutliers.length / report.kept > SOURCE_LIMITS.maxOutlierFraction
  ) {
    failures.push(`${report.atwaterOutliers.length} foods have calories far from their macros`);
  }
  return failures;
}
