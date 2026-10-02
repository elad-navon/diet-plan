/**
 * White flour against whole grain, estimated from the national database (docs/DIABETES.md).
 *
 * The database does not say how a bread, a pasta or a cake was made. So each food of the grain and bakery groups
 * (the first two digits of the item code) is marked from its name and its fiber: wording that says whole grain
 * ("מלא", rye, spelt, oats, bran...) or a high fiber content means WHOLE; everything else made of flour, and white
 * rice, means REFINED. A food that is not a grain product, or that cannot be told (a ready dish such as a
 * sandwich, where only part of the carbohydrate is flour), gets no mark at all.
 */

import { type FoodEntry } from './compute';
import { type FoodRecord } from './types';

export type GrainKind = 'refined' | 'whole';

export interface GrainInput {
  /** First two digits of the database item code. */
  group: string;
  name: string;
  /** Dietary fiber in 100 g; null when the database has no value. */
  fiberPer100: number | null;
}

const FLOUR_GROUP = '50';
const PASTA_RICE_GROUP = '56';
const CEREAL_GROUP = '57';
/** Bread, tortilla and matzo, cakes and cookies, crackers, fried doughs, pizza and pastry dough. */
const BAKERY_GROUPS = new Set(['51', '52', '53', '54', '55', '58']);
/** Groups where a high fiber content means the flour was not refined. */
const FIBER_DECIDES_GROUPS = new Set(['51', '52', '54', '57']);
const WHOLE_FIBER_PER_100 = 7;

/** "מלא" as a word of its own ("מחיטה מלאה", "קמח מלא/לבן"), not a piece of another word. */
const SAYS_WHOLE_WORD = /(?<![א-ת])מלא(?:ה|ים)?(?![א-ת])/;
/** Other wording that says the grain is whole: rye, spelt, oats, bran, brown rice... */
const SAYS_WHOLE_GRAIN =
  /שיפון|כוסמין|שיבולת שועל|סובין|כוסמת|קינואה|בורגול|שעורה|גריס|דוחן|פריקה|אחיד|כהה|ALL-BRAN|FIBER ONE|אורז חום|אורז בר|אורז שחור|(?:^|[\s,])טף(?:$|[\s,])/;
const SAYS_WHITE = /לבן|לבנה/;
const PASTA_OR_RICE = /אורז|פסטה|אטריות|ספגטי|פתיתים|קוסקוס|נודלס|מקרוני|פוזילי|לזניה|רביולי|ניוקי/;
/** Snacks and fiber supplements share the groups but are not what a person means by bread or flour. */
const NOT_A_GRAIN_PRODUCT = /^(חטיף|סיבים תזונתיים)/;
/** Cakes, fried doughs and pizza/pastry dough: only an explicit "whole" counts (spelt or oats in a cake is no proof). */
const STRICT_GROUPS = new Set(['53', '55', '58']);

/** Whole grain, white flour, or null when the food is not a grain product (or cannot be told). */
export function grainKind({ group, name, fiberPer100 }: GrainInput): GrainKind | null {
  if (NOT_A_GRAIN_PRODUCT.test(name)) return null;
  const whole =
    SAYS_WHOLE_WORD.test(name) || (!STRICT_GROUPS.has(group) && SAYS_WHOLE_GRAIN.test(name));

  if (group === FLOUR_GROUP) {
    if (!name.startsWith('קמח')) return null; // baking powder, soda, gluten
    return whole ? 'whole' : 'refined';
  }
  if (group === PASTA_RICE_GROUP) {
    if (whole) return 'whole';
    return PASTA_OR_RICE.test(name) ? 'refined' : null;
  }
  if (group === CEREAL_GROUP || BAKERY_GROUPS.has(group)) {
    if (whole) return 'whole';
    if (SAYS_WHITE.test(name)) return 'refined';
    const fibre = fiberPer100 ?? 0;
    if (FIBER_DECIDES_GROUPS.has(group) && fibre >= WHOLE_FIBER_PER_100) return 'whole';
    return 'refined';
  }
  return null;
}

// --- the swap suggestions --------------------------------------------------------------------------------

export type SwapKind = 'bread' | 'pasta' | 'rice' | 'cereal' | 'cracker';

const BREAD = /^(לחם|פיתה|לחמניה|לחמנייה|לחמניות|בגט|חלה|לאפה|טורטיה|טורטייה|ג'בטה|פוקצ'ה|בייגל)/;
const PASTA = /^(אטריות|פסטה|ספגטי|פתיתים|קוסקוס|נודלס|מקרוני)/;
const CRACKER = /^(קרקר|ביסקוויט|טוסטעים)/;

/** What to try instead of a refined food: the kind of whole-grain alternative, or null when none is obvious. */
export function wholeGrainSwap(name: string, group: string): SwapKind | null {
  if (group === CEREAL_GROUP) return 'cereal';
  if (BREAD.test(name)) return 'bread';
  if (PASTA.test(name)) return 'pasta';
  if (/^אורז/.test(name)) return 'rice';
  if (CRACKER.test(name)) return 'cracker';
  return null;
}

// --- what a meal and a day hold --------------------------------------------------------------------------

export interface GrainTotals {
  /** Carbohydrate (g) of the foods that are white flour or white rice. */
  refinedCarbsG: number;
  /** Carbohydrate (g) of the foods that are whole grain or high in fiber. */
  wholeCarbsG: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** The marked foods of a meal, looked up by food id; foods of no kind (and unknown ones) add nothing. */
export function mealGrainCarbs(
  items: readonly Pick<FoodEntry, 'foodId' | 'carbsG'>[],
  foods: ReadonlyMap<string, FoodRecord>,
): GrainTotals {
  let refined = 0;
  let whole = 0;
  for (const item of items) {
    const grain = foods.get(item.foodId)?.grain;
    if (grain === 'refined') refined += item.carbsG;
    else if (grain === 'whole') whole += item.carbsG;
  }
  return { refinedCarbsG: round1(refined), wholeCarbsG: round1(whole) };
}

export interface GrainDay extends GrainTotals {
  /** Whole-grain alternatives for the refined foods eaten, the biggest source first (at most two). */
  swaps: SwapKind[];
}

/** White flour and whole grain over a day's meals (only meals built from database foods can be counted). */
export function summarizeGrain(
  meals: readonly { items: readonly Pick<FoodEntry, 'foodId' | 'carbsG'>[] }[],
  foods: ReadonlyMap<string, FoodRecord>,
): GrainDay {
  let refined = 0;
  let whole = 0;
  const bySwap = new Map<SwapKind, number>();
  for (const meal of meals) {
    for (const item of meal.items) {
      const food = foods.get(item.foodId);
      if (food?.grain === 'refined') {
        refined += item.carbsG;
        if (food.swap) bySwap.set(food.swap, (bySwap.get(food.swap) ?? 0) + item.carbsG);
      } else if (food?.grain === 'whole') {
        whole += item.carbsG;
      }
    }
  }
  const swaps = [...bySwap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([kind]) => kind);
  return { refinedCarbsG: round1(refined), wholeCarbsG: round1(whole), swaps };
}
