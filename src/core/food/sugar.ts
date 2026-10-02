/**
 * Added sugar, estimated from the national database (docs/DIABETES.md).
 *
 * The database gives TOTAL sugars per 100 g, with no split between sugar that is part of the food (fruit,
 * vegetables, the lactose of milk) and sugar that was added or released (table sugar, honey, syrups, juice,
 * sweetened products). The person's approach is: whole fruit and the sugar that belongs to a food do not count;
 * added sugar does - as low as possible, 0-10 g a day very low, 10-25 g fits a balanced diet, above 25 g regularly
 * is worth a look. So each food gets an ESTIMATE of its added sugar, from its food group (the first two digits of
 * the database's item code) and its name. The estimate is shown as an estimate, and the rules are in one place.
 */

export interface SugarInput {
  /** First two digits of the database item code ("11" dairy, "63" fruit, "91" sugars and sweets...). */
  group: string;
  name: string;
  /** Total sugars in 100 g; null when the database has no value. */
  sugarsPer100: number | null;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Groups whose sugar is the food's own: meat, fish, eggs, legumes, nuts, flours, vegetables, fats, water, spices. */
const OWN_SUGAR_GROUPS = new Set([
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28', // meat, poultry, fish dishes
  '31',
  '32',
  '33',
  '34', // eggs
  '41',
  '42',
  '43', // legumes, nuts, seeds
  '50', // flours
  '67',
  '76', // baby purees
  '71',
  '72',
  '73',
  '74',
  '75',
  '77', // vegetables
  '81',
  '82', // fats and oils
  '94',
  '95', // water, spices
]);

/** Bread, pasta, rice, pastry dough: a little sugar is part of the grain or the dough. */
const GRAIN_GROUPS = new Set(['51', '52', '56', '58']);
const GRAIN_OWN_SUGAR = 3;

const FRESH_FRUIT_GROUPS = new Set(['61', '63', '65']);
const DRIED_FRUIT_GROUP = '62';
const JUICE_GROUP = '64';
const DAIRY_GROUPS = new Set(['11', '12', '13', '14']);
const COFFEE_AND_DRINKS_GROUP = '92';
const ALCOHOL_GROUP = '93';
const COMPOSITE_GROUP = '90';

/** The lactose that milk products contain by themselves (g per 100 g); everything above it was added. */
const LACTOSE = { milk: 4.7, ice_cream: 3, cheese: 3 } as const;

/** Wording that says sugar was added or the product is sweetened. */
const SWEETENED = /ממותק|עם סוכר|בתוספת סוכר|מסוכר|בסירופ|סירופ|ריבה|קרמל|דבש|מצופה|מסוכרים/;
/** Wording that says it was NOT sweetened. */
const UNSWEETENED = /ללא תוספת סוכר|לא ממותק|ללא סוכר|ממתיק דל קלוריות|במים\b/;
const SYRUP_OR_JAM = /קטשופ|ריבה|ממרח|קונפיטורה|מרמלדה/;
const DAIRY_WORDS = /חלב|יוגורט|לבן|גבינה|מעדן|שוקו|קוטג|שמנת/;
const FRUIT_PROCESSED = /משומר|(?:^|[\s,])רסק|לפתן|קומפוט|מבושל או משומר|סלט פירות/;
const MILK_COFFEE = /חלב|לאטה|קפוצ|הפוך/;

/** The fruit's own sugar (g per 100 g), used to take the natural part out of canned or cooked fruit. */
const FRUIT_OWN_SUGAR = 8;
const DRIED_FRUIT_OWN_SUGAR = 35;

function above(sugars: number, own: number): number {
  return Math.max(0, sugars - own);
}

/**
 * Estimated added sugar in grams per 100 g, or null when the total sugars are unknown. Never more than the
 * total, never negative.
 */
export function estimateAddedSugar({ group, name, sugarsPer100 }: SugarInput): number | null {
  if (sugarsPer100 === null || !Number.isFinite(sugarsPer100)) return null;
  const sugars = Math.min(Math.max(sugarsPer100, 0), 100);
  const sweetened = SWEETENED.test(name) && !UNSWEETENED.test(name);
  let added: number;

  if (SYRUP_OR_JAM.test(name) && group !== '11') {
    added = sugars; // jam, syrup, ketchup: sugar was put in
  } else if (OWN_SUGAR_GROUPS.has(group)) {
    added = sweetened ? sugars : 0; // e.g. candied nuts
  } else if (FRESH_FRUIT_GROUPS.has(group)) {
    const processed = sweetened || FRUIT_PROCESSED.test(name);
    added = processed && !UNSWEETENED.test(name) ? above(sugars, FRUIT_OWN_SUGAR) : 0;
  } else if (group === DRIED_FRUIT_GROUP) {
    added = sweetened ? above(sugars, DRIED_FRUIT_OWN_SUGAR) : 0; // dried whole fruit is still the fruit
  } else if (group === JUICE_GROUP) {
    added = sugars; // sugar from juice is released sugar, not whole fruit
  } else if (DAIRY_GROUPS.has(group) || (group === COMPOSITE_GROUP && DAIRY_WORDS.test(name))) {
    const own = group === '13' ? LACTOSE.ice_cream : group === '14' ? LACTOSE.cheese : LACTOSE.milk;
    added = above(sugars, own);
  } else if (GRAIN_GROUPS.has(group)) {
    added = above(sugars, GRAIN_OWN_SUGAR);
  } else if (group === COFFEE_AND_DRINKS_GROUP && MILK_COFFEE.test(name)) {
    added = above(sugars, 3.5);
  } else if (group === ALCOHOL_GROUP && /^(בירה|יין)/.test(name)) {
    added = 0;
  } else {
    added = sugars; // cakes, cookies, cereals, sweets, sauces, drinks, anything unknown: counted in full
  }
  return round1(Math.min(added, sugars));
}

// --- the daily picture -----------------------------------------------------------------------------------

/** Daily added sugar in three bands, from the person's own guidance (the edges can be changed). */
export const ADDED_SUGAR_BANDS = { veryLowMaxG: 10, okMaxG: 25 } as const;

export type SugarBand = 'very_low' | 'ok' | 'review';

export function sugarBand(
  addedSugarG: number,
  bands: { veryLowMaxG: number; okMaxG: number } = ADDED_SUGAR_BANDS,
): SugarBand {
  if (addedSugarG <= bands.veryLowMaxG) return 'very_low';
  if (addedSugarG <= bands.okMaxG) return 'ok';
  return 'review';
}
