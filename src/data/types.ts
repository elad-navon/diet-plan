import { type MealRecord, type TargetPlanSnapshot } from '../core/dayview';
import { type FoodEntry } from '../core/food';
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
  foodDbVersion?: string;
  useCount: number;
  lastUsedAt: Instant | null;
  version: number;
}

export type NewFavorite = Omit<FavoriteRecord, 'useCount' | 'lastUsedAt' | 'version'>;

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
}

export interface Repositories {
  profile: ProfileRepository;
  plans: PlanRepository;
  meals: MealRepository;
  weights: WeightRepository;
  favorites: FavoriteRepository;
  exportAll(): Promise<ExportDocument>;
  /** Deletes everything stored for the user. */
  reset(): Promise<void>;
}
