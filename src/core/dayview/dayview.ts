import { type MacroState, type Macros } from '../nutrition';
import {
  recommendNext,
  type MealCandidate,
  type MealForRecommendation,
  type Recommendation,
} from '../recommend';
import { type MealSchedule, type MealSlot } from '../schedule';
import { addDays, diffDays, localDateOf, type Instant, type LocalDate, type Tz } from '../time';

/** A logged meal as the UI knows it. `localDate` is the server-derived day (authoritative). */
export interface MealRecord extends MealForRecommendation {
  id: string;
  name: string;
  localDate: LocalDate;
  /** Soft-deleted meals are ignored everywhere. */
  deletedAt?: Instant | null;
}

/**
 * The daily target that was in force from `effectiveFrom` on - a snapshot, so changing the profile
 * later never rewrites past days (docs/DATA_MODEL.md E.2).
 */
export interface TargetPlanSnapshot {
  effectiveFrom: LocalDate;
  kcalTarget: number;
  kcalFloor: number;
  macros: Macros | null;
  macroState: MacroState;
  schedule: MealSchedule;
}

/** The plan in force on `date`: the one with the latest `effectiveFrom` that is not after it. */
export function resolvePlanForDate(
  plans: readonly TargetPlanSnapshot[],
  date: LocalDate,
): TargetPlanSnapshot | null {
  let best: TargetPlanSnapshot | null = null;
  for (const plan of plans) {
    if (plan.effectiveFrom <= date && (!best || plan.effectiveFrom > best.effectiveFrom)) {
      best = plan;
    }
  }
  return best;
}

export interface DaySummary {
  mealCount: number;
  kcal: number;
  /** Sums over meals that carry macro data only - see `macroCoverage`. */
  macros: Macros;
  macroCoverage: { mealsWithMacros: number; meals: number };
  kcalBySlot: Record<MealSlot, number>;
}

const hasMacros = (meal: MealRecord): boolean =>
  meal.proteinG !== null && meal.carbsG !== null && meal.fatG !== null;

/** Totals for a day's active meals. Macro totals are partial when some meals have no macro data. */
export function summarizeDay(meals: readonly MealRecord[]): DaySummary {
  const active = meals.filter((meal) => !meal.deletedAt);
  const kcalBySlot: Record<MealSlot, number> = {
    breakfast: 0,
    lunch: 0,
    snack: 0,
    dinner: 0,
    other: 0,
  };
  const macros: Macros = { proteinG: 0, carbsG: 0, fatG: 0 };
  let kcal = 0;
  let mealsWithMacros = 0;
  for (const meal of active) {
    kcal += meal.kcal;
    kcalBySlot[meal.slot] += meal.kcal;
    if (hasMacros(meal)) {
      mealsWithMacros += 1;
      macros.proteinG += meal.proteinG ?? 0;
      macros.carbsG += meal.carbsG ?? 0;
      macros.fatG += meal.fatG ?? 0;
    }
  }
  return {
    mealCount: active.length,
    kcal,
    macros,
    macroCoverage: { mealsWithMacros, meals: active.length },
    kcalBySlot,
  };
}

export interface DayViewInput {
  date: LocalDate;
  now: Instant;
  tz: Tz;
  /** All known target snapshots; the right one for `date` is picked automatically. */
  plans: readonly TargetPlanSnapshot[];
  /** Any meals; only active ones whose `localDate` is `date` are used. */
  meals: readonly MealRecord[];
  candidates?: readonly MealCandidate[];
}

export interface DayView {
  date: LocalDate;
  isToday: boolean;
  /** Days before the first plan have no target: consumption is shown without a status. */
  target: Pick<TargetPlanSnapshot, 'kcalTarget' | 'macros' | 'macroState' | 'kcalFloor'> | null;
  summary: DaySummary;
  /** consumed / target, not capped (>1 means over); null without a target. */
  ringFraction: number | null;
  /** Only for today and only with a target; past days are summaries, not advice. */
  recommendation: Recommendation | null;
}

/**
 * Everything the "today" screen shows, computed in one place from plain data. The UI renders it and
 * never computes calories, time or advice itself, so an edit/delete/back-dated meal just changes the
 * input and every widget stays consistent (docs/PRODUCT_SPEC.md C.2).
 */
export function buildDayView(input: DayViewInput): DayView {
  const meals = input.meals.filter((meal) => !meal.deletedAt && meal.localDate === input.date);
  const plan = resolvePlanForDate(input.plans, input.date);
  const summary = summarizeDay(meals);
  const isToday = localDateOf(input.now, input.tz) === input.date;

  return {
    date: input.date,
    isToday,
    target: plan
      ? {
          kcalTarget: plan.kcalTarget,
          macros: plan.macros,
          macroState: plan.macroState,
          kcalFloor: plan.kcalFloor,
        }
      : null,
    summary,
    ringFraction: plan ? summary.kcal / plan.kcalTarget : null,
    recommendation:
      plan && isToday
        ? recommendNext({
            now: input.now,
            tz: input.tz,
            date: input.date,
            schedule: plan.schedule,
            kcalTarget: plan.kcalTarget,
            kcalFloor: plan.kcalFloor,
            macros: plan.macros,
            meals,
            candidates: input.candidates ?? [],
          })
        : null,
  };
}

export interface RangeDay {
  date: LocalDate;
  /** False for days with no meals: shown as "not logged", never as a 0-calorie success. */
  logged: boolean;
  kcal: number;
  kcalTarget: number | null;
}

export interface RangeSummary {
  days: RangeDay[];
  daysLogged: number;
  /** Average over logged days only. Null when nothing was logged. */
  averageKcalLogged: number | null;
}

/** Per-day totals for a date range (the weekly chart), with unlogged days kept out of the average. */
export function summarizeRange(input: {
  from: LocalDate;
  to: LocalDate;
  plans: readonly TargetPlanSnapshot[];
  meals: readonly MealRecord[];
}): RangeSummary {
  const days: RangeDay[] = [];
  const dayCount = diffDays(input.to, input.from) + 1;
  const byDate = new Map<LocalDate, MealRecord[]>();
  for (const meal of input.meals) {
    if (meal.deletedAt) continue;
    byDate.set(meal.localDate, [...(byDate.get(meal.localDate) ?? []), meal]);
  }
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(input.from, offset);
    const dayMeals = byDate.get(date) ?? [];
    days.push({
      date,
      logged: dayMeals.length > 0,
      kcal: summarizeDay(dayMeals).kcal,
      kcalTarget: resolvePlanForDate(input.plans, date)?.kcalTarget ?? null,
    });
  }
  const logged = days.filter((day) => day.logged);
  return {
    days,
    daysLogged: logged.length,
    averageKcalLogged:
      logged.length === 0 ? null : logged.reduce((sum, day) => sum + day.kcal, 0) / logged.length,
  };
}
