import { type Macros } from '../nutrition';
import { type MealSchedule, type MealSlot, type SlotId } from '../schedule';
import { type Instant, type LocalDate, type Tz } from '../time';

/** The part of a logged meal the recommendation engine looks at. */
export interface MealForRecommendation {
  eatenAt: Instant;
  slot: MealSlot;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

/** How much of one food an idea uses at its normal portion. */
export type RecipeQuantity =
  | { kind: 'grams'; grams: number }
  /** A count of one of the food's household measures (e.g. 2 x "פרוסה בינונית"), scaled in `step`s. */
  | { kind: 'unit'; unit: string; count: number; step: number };

/** One ingredient of an idea: a database food and its amount (the "what exactly and how much" shown to the user). */
export interface RecipeItem {
  foodId: string;
  quantity: RecipeQuantity;
  /** Name to show instead of the database's (which can be long or say too little: "בשר עוף"). */
  label?: string;
}

/** A meal idea the engine may suggest. The static library lives elsewhere; favorites can be added later. */
export interface MealCandidate {
  id: string;
  name: string;
  /** Slots it suits; empty = any slot. */
  slots: readonly SlotId[];
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Free-form labels (e.g. `vegetarian`, `dairy`, `favorite`) that filters and scorers can use. */
  tags: readonly string[];
  /** The portion can be scaled within this range so the idea fits the remaining budget. */
  minPortionFactor: number;
  maxPortionFactor: number;
  /** The ingredients behind the totals, when the idea is built from real foods. */
  recipe?: readonly RecipeItem[];
  /** Estimated added sugar of the idea at its normal portion, in grams; absent when not known. */
  addedSugarG?: number;
}

export type DayStatus = 'on_track' | 'behind' | 'ahead' | 'over_budget' | 'day_complete';

export type RecommendationNote =
  /** Eaten exactly the target. */
  | 'target_reached'
  /** A large part of today's budget is left unallocated because meals were skipped - never "make up for it". */
  | 'skipped_meals'
  /** Far above the target; worth double-checking the entries. */
  | 'excess_large'
  /** The day is over and intake was below the safe minimum - neutral note, never praise. */
  | 'below_safe_floor'
  /** A meal is due but no idea in the library fits its budget. */
  | 'no_suggestions_fit';

export interface SlotBudget {
  slot: SlotId;
  plannedKcal: number;
  budgetKcal: number;
  windowStart: Instant;
  windowEnd: Instant;
  suggestedAt: Instant;
}

export interface Suggestion {
  candidateId: string;
  name: string;
  /** Portion scale applied to the candidate (steps of 0.25). */
  portionFactor: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  score: number;
}

export interface NextMeal {
  /** Null for the optional light snack offered after the last window of the day. */
  slot: SlotId | null;
  optional: boolean;
  budgetKcal: number;
  suggestedAt: Instant;
  suggestions: Suggestion[];
}

export interface Recommendation {
  status: DayStatus;
  consumedKcal: number;
  /** Negative when over the target. */
  remainingKcal: number;
  toleranceKcal: number;
  corridor: { lowerKcal: number; upperKcal: number };
  budgets: SlotBudget[];
  unallocatedKcal: number;
  next: NextMeal | null;
  notes: RecommendationNote[];
}

export interface ScoringContext {
  slot: SlotId | null;
  budgetKcal: number;
  remainingKcal: number;
  proteinBehind: boolean;
}

/** Return false to drop a candidate (diets, dislikes, available ingredients...). */
export type CandidateFilter = (candidate: MealCandidate, context: ScoringContext) => boolean;
/** Extra score for a candidate (favorites, frequently eaten, ...). */
export type CandidateScorer = (
  candidate: MealCandidate,
  scaled: { kcal: number; proteinG: number; carbsG: number; fatG: number },
  context: ScoringContext,
) => number;

export interface RecommendInput {
  now: Instant;
  tz: Tz;
  /** The local date being evaluated (the day `meals` belong to). */
  date: LocalDate;
  schedule: MealSchedule;
  kcalTarget: number;
  /** The safe minimum, used only for the end-of-day note. */
  kcalFloor?: number;
  macros: Macros | null;
  /** Active (non-deleted) meals of `date`. */
  meals: readonly MealForRecommendation[];
  candidates: readonly MealCandidate[];
  filters?: readonly CandidateFilter[];
  scorers?: readonly CandidateScorer[];
}
