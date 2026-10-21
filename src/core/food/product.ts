import { PRODUCT_PREFIX } from './compute';
import { manualGrain, manualSwap, WHOLE_FIBER_PER_100 } from './grain';
import { type AddedSugarBasis, type UserProduct } from './types';

/** `product:<uuid>` <-> `<uuid>` (the server keeps the plain uuid). */
export const productFoodId = (uuid: string): string => `${PRODUCT_PREFIX}${uuid}`;
export const productUuid = (foodId: string): string =>
  foodId.startsWith(PRODUCT_PREFIX) ? foodId.slice(PRODUCT_PREFIX.length) : foodId;

/** What is stored for a product (already checked), whichever way it is stored. */
export interface ProductFields {
  /** `product:<uuid>`. */
  id: string;
  name: string;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  sugar100: number | null;
  fiber100: number | null;
  addedSugar100: number | null;
  addedSugarBasis: AddedSugarBasis | null;
  grain: 'refined' | 'whole' | null;
  basis: 'g' | 'ml';
  units: { name: string; grams: number }[];
  version: number;
}

/** A stored product as a food the app can search, measure and sum. */
export function toUserProduct(fields: ProductFields): UserProduct {
  return {
    id: fields.id,
    name: fields.name,
    kcal100: fields.kcal100,
    protein100: fields.protein100,
    carbs100: fields.carbs100,
    fat100: fields.fat100,
    units: fields.units,
    ...(fields.sugar100 !== null ? { sugar100: fields.sugar100 } : {}),
    ...(fields.addedSugar100 !== null ? { addedSugar100: fields.addedSugar100 } : {}),
    ...(fields.fiber100 !== null ? { fiber100: fields.fiber100 } : {}),
    ...(fields.grain !== null ? { grain: fields.grain } : {}),
    ...(fields.grain === 'refined' ? { swap: manualSwap(fields.name) } : {}),
    ...(fields.units[0] ? { defaultUnit: fields.units[0].name } : {}),
    ...(fields.basis === 'ml' ? { basis: 'ml' as const } : {}),
    addedSugarBasis: fields.addedSugarBasis,
    version: fields.version,
  };
}

/** The fields of a stored product back, e.g. to edit it. */
export function productFields(product: UserProduct): ProductFields {
  return {
    id: product.id,
    name: product.name,
    kcal100: product.kcal100,
    protein100: product.protein100,
    carbs100: product.carbs100,
    fat100: product.fat100,
    sugar100: product.sugar100 ?? null,
    fiber100: product.fiber100 ?? null,
    addedSugar100: product.addedSugar100 ?? null,
    addedSugarBasis: product.addedSugarBasis,
    grain: product.grain ?? null,
    basis: product.basis ?? 'g',
    units: product.units,
    version: product.version,
  };
}

/**
 * The added sugar of a product, and where it comes from. Labels in Israel usually print only the total sugars
 * ("מתוכן סוכרים"), which hold the food's own sugar too (lactose, fruit); the app cannot tell the two apart for a
 * product of its own, so without a printed or typed value it counts ALL the sugars as added - an estimate on the
 * high side, shown as an estimate.
 */
export function productAddedSugar(input: {
  sugar100: number | null;
  /** Printed on the label ("סוכרים מוספים") or typed; null when neither. */
  given: number | null;
  givenBasis: 'label' | 'user';
}): { addedSugar100: number | null; addedSugarBasis: AddedSugarBasis | null } {
  if (input.given !== null)
    return { addedSugar100: input.given, addedSugarBasis: input.givenBasis };
  if (input.sugar100 !== null)
    return { addedSugar100: input.sugar100, addedSugarBasis: 'estimate' };
  return { addedSugar100: null, addedSugarBasis: null };
}

/**
 * The flour mark a product suggests: bread, pasta, rice... by its name, as for a food typed by hand; and, as for the
 * database's bread, a high fiber content means whole grain even when the name does not say so ("לחם אנג'ל" with
 * 8.8 g fiber). Null when the name holds no grain word.
 */
export function suggestedGrain(name: string, fiber100: number | null): 'refined' | 'whole' | null {
  const kind = manualGrain(name)?.kind ?? null;
  if (kind === 'refined' && fiber100 !== null && fiber100 >= WHOLE_FIBER_PER_100) return 'whole';
  return kind;
}
