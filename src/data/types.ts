import { type MealRecord, type TargetPlanSnapshot } from '../core/dayview';
import { type AddedSugarBasis, type FoodEntry, type UserProduct } from '../core/food';
import { type Macros, type Plan, type PlanInputs, type Sex } from '../core/nutrition';
import { type MealSlot } from '../core/schedule';
import { type Instant, type LocalDate, type Tz } from '../core/time';

/** Identity and settings that do not change the daily target (docs/DATA_MODEL.md E.1 `profiles`). */
export interface Profile {
  sex: Sex;
  birthDate: LocalDate;
  heightCm: number;
  /** The zone that defines the user's day boundaries. */
  timezone: Tz;
  /** When the user confirmed the 18+ / not-medical-advice declaration. */
  disclaimerAckAt: Instant;
}

/** A target plan in force from `effectiveFrom`, with the inputs and full result it came from. */
export interface StoredPlan extends TargetPlanSnapshot {
  id: string;
  inputs: PlanInputs;
  plan: Plan;
  createdAt: Instant;
}

export type MealSource = 'food_db' | 'manual' | 'favorite' | 'copy';

export interface StoredMeal extends MealRecord {
  tz: Tz;
  source: MealSource;
  /** Snapshot of the foods the meal was built from; empty for manual meals. */
  items: FoodEntry[];
  /** Added sugar of the whole meal in grams (an estimate for foods from the database); null = not known. */
  addedSugarG: number | null;
  /**
   * A meal typed by hand: the grams of its carbohydrate the person said come from white flour and from whole
   * grains (parts of `carbsG`); absent or null = not typed. A meal of foods has none: its foods say it.
   */
  refinedCarbsG?: number | null;
  wholeCarbsG?: number | null;
  foodDbVersion?: string;
  /** Bumped on every change; used to detect edits from another device. */
  version: number;
  /** When the entry was made (server/store time) - tells back-dated entries apart. */
  enteredAt: Instant;
}

export interface NewMeal {
  /** Created by the client, so a retry of the same request cannot create a second meal. */
  id: string;
  name: string;
  eatenAt: Instant;
  slot: MealSlot;
  kcal: number;
  macros: Macros | null;
  items: FoodEntry[];
  /** Added sugar of the whole meal in grams; leave out when not known. */
  addedSugarG?: number | null;
  /** The split of a manual meal's carbohydrate into white flour and whole grains; leave out when not typed. */
  refinedCarbsG?: number | null;
  wholeCarbsG?: number | null;
  source: MealSource;
  foodDbVersion?: string;
}

export type MealPatch = Partial<Omit<NewMeal, 'id' | 'source'>>;

export interface WeightRecord {
  id: string;
  localDate: LocalDate;
  kg: number;
  measuredAt: Instant;
  version: number;
}

export interface FavoriteRecord {
  id: string;
  name: string;
  kcal: number;
  macros: Macros | null;
  items: FoodEntry[];
  /** Added sugar in grams (typed for a meal entered by hand); null = not known. */
  addedSugarG: number | null;
  /** The split of a meal typed by hand into white flour and whole grains (grams of carbohydrate); absent or null = not typed. */
  refinedCarbsG?: number | null;
  wholeCarbsG?: number | null;
  foodDbVersion?: string;
  /** The place given by hand in the list of saved meals (1 = top); absent or null = never placed by hand. */
  sortOrder?: number | null;
  useCount: number;
  lastUsedAt: Instant | null;
  version: number;
}

export type NewFavorite = Omit<
  FavoriteRecord,
  'useCount' | 'lastUsedAt' | 'version' | 'addedSugarG'
> & { addedSugarG?: number | null };

/** A product to save from its label (values per 100 g or 100 ml). `id` is `product:<uuid>`, made by the client. */
export interface NewProduct {
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
}

export type ProductPatch = Omit<NewProduct, 'id'>;

/** What an export file contains (docs/PRODUCT_SPEC.md C.2 "יצוא"). */
export interface ExportDocument {
  schemaVersion: 1;
  exportedAt: Instant;
  timezone: Tz | null;
  profile: Profile | null;
  plans: StoredPlan[];
  meals: StoredMeal[];
  weights: WeightRecord[];
  favorites: FavoriteRecord[];
  /** The person's own products (without their photos). */
  products?: UserProduct[];
}

export type DataErrorCode =
  | 'id_conflict'
  | 'version_conflict'
  | 'not_found'
  | 'invalid'
  | 'limit_reached'
  | 'no_profile'
  | 'plan_in_past'
  /** The server's clock says the time is too far ahead / too long ago (checked there, not on the phone). */
  | 'in_future'
  | 'too_old'
  /** Not signed in, or the sign-in expired. */
  | 'unauthenticated'
  /** The server could not be reached. */
  | 'network'
  /** The server failed in a way the user cannot fix. */
  | 'server';

/** A failure the UI knows how to explain (maps to HTTP-style conflicts once a server is involved). */
export class DataError extends Error {
  constructor(
    readonly code: DataErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'DataError';
  }
}

export interface ProfileRepository {
  get(): Promise<Profile | null>;
  save(profile: Profile): Promise<void>;
}

export interface PlanRepository {
  list(): Promise<StoredPlan[]>;
  /** Adds or replaces the plan starting on `plan.effectiveFrom`; never touches a day before `today`. */
  save(plan: StoredPlan, today: LocalDate): Promise<void>;
}

export interface MealRepository {
  /** Every meal of the day, including soft-deleted ones (so a deletion can be undone). */
  listByDate(date: LocalDate): Promise<StoredMeal[]>;
  listRange(from: LocalDate, to: LocalDate): Promise<StoredMeal[]>;
  /** Idempotent: the same `id` with the same content returns the existing meal. */
  add(meal: NewMeal): Promise<StoredMeal>;
  update(id: string, baseVersion: number, patch: MealPatch): Promise<StoredMeal>;
  softDelete(id: string, baseVersion: number): Promise<StoredMeal>;
  restore(id: string, baseVersion: number): Promise<StoredMeal>;
  /** How often each food was logged recently (food id -> count): feeds search ranking. */
  foodUsage(): Promise<Map<string, number>>;
}

export interface WeightRepository {
  list(): Promise<WeightRecord[]>;
  /** One reading per day; a later one replaces the earlier. */
  upsert(entry: { id: string; kg: number; measuredAt: Instant }): Promise<WeightRecord>;
  remove(id: string): Promise<void>;
}

export interface FavoriteRepository {
  list(): Promise<FavoriteRecord[]>;
  add(favorite: NewFavorite): Promise<FavoriteRecord>;
  remove(id: string): Promise<void>;
  markUsed(id: string): Promise<void>;
  /** Puts these favorites in this order, the first at the top (the person's own order of the saved meals). */
  reorder(ids: readonly string[]): Promise<void>;
}

export interface ProductRepository {
  list(): Promise<UserProduct[]>;
  /** Idempotent: the same `id` again returns the product already saved. */
  add(product: NewProduct): Promise<UserProduct>;
  update(id: string, baseVersion: number, patch: ProductPatch): Promise<UserProduct>;
  /** Deletes the product and its photo. Meals that hold it keep their own copy of its values. */
  remove(id: string): Promise<void>;
  /** The label photo (a JPEG data URL), or null when there is none. */
  photo(id: string): Promise<string | null>;
  /** Puts or replaces the label photo; null removes it. */
  setPhoto(id: string, dataUrl: string | null): Promise<void>;
}

export interface Repositories {
  profile: ProfileRepository;
  plans: PlanRepository;
  meals: MealRepository;
  weights: WeightRepository;
  favorites: FavoriteRepository;
  products: ProductRepository;
  exportAll(): Promise<ExportDocument>;
  /** Deletes everything stored for the user. */
  reset(): Promise<void>;
}
