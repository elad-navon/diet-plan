import { type LocalDate } from '../time';

export type Sex = 'female' | 'male' | 'unspecified';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high';
/** `gain` is deliberately absent in v1 (docs/PRODUCT_SPEC.md B2). */
export type GoalType = 'lose' | 'maintain';

export type RateRequest =
  { mode: 'rate'; weeklyRateKg: number } | { mode: 'date'; targetDate: LocalDate };

export type Goal =
  { type: 'maintain' } | { type: 'lose'; targetWeightKg: number; request: RateRequest };

export interface PlanInputs {
  sex: Sex;
  birthDate: LocalDate;
  /** The day the plan starts (the user's local "today"). */
  onDate: LocalDate;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  /** Manual calorie target; only valid within [floor, 1.3 x TDEE]. */
  overrideKcal?: number;
  /** The user explicitly accepted the realistic date offered for an infeasible requested date. */
  confirmAdjustedDate?: boolean;
}

export interface Macros {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** ok: ideal split · relaxed: fat/protein lowered to keep carbs ≥100 g · low_carb: carbs 50-100 g · conflict: no safe split. */
export type MacroState = 'ok' | 'relaxed' | 'low_carb' | 'conflict';
export type PlanState = 'ok' | 'adjusted_rate' | 'date_adjusted';

export type PlanWarning =
  | 'rate_adjusted'
  | 'rate_raised_to_minimum'
  | 'large_total_loss'
  | 'override_used'
  | 'override_no_deficit'
  | 'maintenance_below_floor'
  | 'capped_at_max';

export interface Plan {
  engineVersion: string;
  ageYears: number;
  bmr: number;
  tdee: number;
  goalType: GoalType;
  /** 0 for maintain. */
  weeklyRateKg: number;
  kcalFloor: number;
  kcalTarget: number;
  macros: Macros | null;
  macroState: MacroState;
  planState: PlanState;
  startWeightKg: number;
  startDate: LocalDate;
  targetWeightKg: number | null;
  /** Estimated, not promised. Null for maintain or when there is no deficit. */
  projectedDays: number | null;
  projectedDate: LocalDate | null;
  warnings: PlanWarning[];
}

export type ValidationErrorCode =
  | 'invalid_number'
  | 'invalid_date'
  | 'age_under_18'
  | 'age_over_100'
  | 'height_out_of_range'
  | 'weight_out_of_range'
  | 'bmi_underweight_for_loss'
  | 'target_below_bmi_18_5'
  | 'target_not_below_current'
  | 'target_date_not_in_future'
  | 'rate_out_of_range'
  | 'override_out_of_range';

export interface ValidationError {
  code: ValidationErrorCode;
  /** For `target_below_bmi_18_5`: the lowest acceptable target weight. For `override_out_of_range`: the lowest acceptable kcal. */
  min?: number;
  /** For `override_out_of_range`: the highest acceptable kcal. */
  max?: number;
}

export type PlanOutcome =
  | { kind: 'plan'; plan: Plan }
  /** The requested date is unrealistic; `plan` holds the realistic alternative. Not saveable until confirmed. */
  | { kind: 'needs_confirmation'; plan: Plan }
  /** TDEE is too close to the safe floor for any weight-loss deficit. */
  | { kind: 'not_feasible'; tdee: number; kcalFloor: number; maxRateKgPerWeek: number }
  | { kind: 'invalid'; errors: ValidationError[] };
