/** One way to measure a food besides grams, e.g. "יחידה בינונית" = 49.5 g. */
export interface FoodUnit {
  name: string;
  grams: number;
}

/** A food from the national nutrition database, nutrients per 100 g. */
export interface FoodRecord {
  /** The database's own food code, as a string. */
  id: string;
  name: string;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  units: FoodUnit[];
  /** Total sugars in 100 g, when the database has a value. */
  sugar100?: number;
  /**
   * Estimated ADDED sugar in 100 g (sugar that is not the food's own; whole fruit and lactose are not counted).
   * An estimate from the food group and name - see core/food/sugar.ts.
   */
  addedSugar100?: number;
  /** Dietary fiber in 100 g, when the database has a value. */
  fiber100?: number;
  /** White flour or whole grain, for bread, pasta, rice, cereals and bakery - see core/food/grain.ts. Absent otherwise. */
  grain?: 'refined' | 'whole';
  /** For a refined food: which whole-grain alternative to suggest, when one is obvious. */
  swap?: 'bread' | 'pasta' | 'rice' | 'cereal' | 'cracker';
  /** Name of the unit to preselect (one of `units`); absent when the food only has grams. */
  defaultUnit?: string;
  /** The values are per 100 ml (a drink); absent = per 100 g. Amounts of it are then in ml. */
  basis?: 'ml';
}

/** Where a product's added sugar comes from: printed on the label, typed by the person, or estimated. */
export type AddedSugarBasis = 'label' | 'user' | 'estimate';

/**
 * A product the person saved from its nutrition label ("המוצרים שלי"). It is a food like those of the database
 * (values per 100 g or 100 ml, its own units), so it is searched, measured and summed the same way. Its id is
 * `product:<uuid>`.
 */
export interface UserProduct extends FoodRecord {
  /** How `addedSugar100` was found; null when there is no sugar value at all. */
  addedSugarBasis: AddedSugarBasis | null;
  /** Bumped on every change; used to detect edits from another device. */
  version: number;
}

export interface FoodDbMeta {
  source: string;
  sourceUrl: string;
  license: string;
  /** Last modification date reported by the source portal. */
  sourceModified: string;
  retrievedAt: string;
  count: number;
}

/** The static asset shipped with the app (docs/ARCHITECTURE.md D.9). */
export interface FoodDb {
  /** Content hash; saved with each meal item so history stays traceable. */
  version: string;
  meta: FoodDbMeta;
  foods: FoodRecord[];
}
