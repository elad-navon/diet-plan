import { addDays, ageOn, diffDays, isValidLocalDate, type LocalDate } from '../time';
import { NUTRITION_CONFIG, ENGINE_VERSION } from './config';
import { computeMacros } from './macros';
import {
  type Plan,
  type PlanInputs,
  type PlanOutcome,
  type PlanWarning,
  type Sex,
  type ValidationError,
} from './types';

const cfg = NUTRITION_CONFIG;
/** kcal per day that correspond to one kg per week (7700 / 7 = 1100). */
const KCAL_PER_DAY_PER_KG_WEEK = cfg.kcalPerKg / 7;

const round10 = (value: number): number => Math.round(value / 10) * 10;
const round2 = (value: number): number => Math.round(value * 100) / 100;
const heightMeters = (heightCm: number): number => heightCm / 100;

/** Mifflin-St Jeor resting energy expenditure, kcal/day. */
export function mifflinBmr(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}): number {
  return (
    10 * input.weightKg +
    6.25 * input.heightCm -
    5 * input.ageYears +
    cfg.mifflinSexConstant[input.sex]
  );
}

export function bmi(weightKg: number, heightCm: number): number {
  return weightKg / heightMeters(heightCm) ** 2;
}

/** The lowest weight (rounded up to 0.1 kg) that still has BMI >= 18.5. */
export function minHealthyWeightKg(heightCm: number): number {
  return Math.ceil(cfg.limits.minBmi * heightMeters(heightCm) ** 2 * 10) / 10;
}

/** Weight protein is based on: the user's weight, or the weight at BMI 25 if they are heavier. */
export function referenceWeightKg(weightKg: number, heightCm: number): number {
  return Math.min(weightKg, cfg.limits.referenceBmi * heightMeters(heightCm) ** 2);
}

function inRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}

/** Blocking validation: nothing here is silently "corrected" (docs/NUTRITION_RULES.md F.2 step 1). */
export function validatePlanInputs(input: PlanInputs): ValidationError[] {
  const errors: ValidationError[] = [];

  const numbers: number[] = [input.heightCm, input.weightKg];
  if (input.overrideKcal !== undefined) numbers.push(input.overrideKcal);
  if (input.goal.type === 'lose') {
    numbers.push(input.goal.targetWeightKg);
    if (input.goal.request.mode === 'rate') numbers.push(input.goal.request.weeklyRateKg);
  }
  if (numbers.some((n) => !Number.isFinite(n))) {
    return [{ code: 'invalid_number' }];
  }
  if (!isValidLocalDate(input.birthDate) || !isValidLocalDate(input.onDate)) {
    return [{ code: 'invalid_date' }];
  }
  if (
    input.goal.type === 'lose' &&
    input.goal.request.mode === 'date' &&
    !isValidLocalDate(input.goal.request.targetDate)
  ) {
    return [{ code: 'invalid_date' }];
  }

  const age = ageOn(input.birthDate, input.onDate);
  if (age < cfg.limits.age.min) errors.push({ code: 'age_under_18' });
  if (age > cfg.limits.age.max) errors.push({ code: 'age_over_100' });
  if (!inRange(input.heightCm, cfg.limits.heightCm)) errors.push({ code: 'height_out_of_range' });
  if (!inRange(input.weightKg, cfg.limits.weightKg)) errors.push({ code: 'weight_out_of_range' });
  if (errors.length > 0) return errors;

  if (input.goal.type === 'lose') {
    const { targetWeightKg, request } = input.goal;
    if (bmi(input.weightKg, input.heightCm) < cfg.limits.minBmi) {
      errors.push({ code: 'bmi_underweight_for_loss' });
    }
    if (targetWeightKg >= input.weightKg) {
      errors.push({ code: 'target_not_below_current' });
    } else if (bmi(targetWeightKg, input.heightCm) < cfg.limits.minBmi) {
      errors.push({ code: 'target_below_bmi_18_5', min: minHealthyWeightKg(input.heightCm) });
    }
    if (request.mode === 'rate' && request.weeklyRateKg <= 0) {
      errors.push({ code: 'rate_out_of_range' });
    }
    if (request.mode === 'date' && diffDays(request.targetDate, input.onDate) < 1) {
      errors.push({ code: 'target_date_not_in_future' });
    }
  }
  return errors;
}

/**
 * Daily calorie target, macros and a *projection* (an estimate, never a promise) from the user's
 * profile and goal. Pure: depends only on its inputs (docs/NUTRITION_RULES.md F.2).
 */
export function computePlan(input: PlanInputs): PlanOutcome {
  const errors = validatePlanInputs(input);
  if (errors.length > 0) {
    return { kind: 'invalid', errors };
  }

  const ageYears = ageOn(input.birthDate, input.onDate);
  const bmr = mifflinBmr({
    sex: input.sex,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    ageYears,
  });
  const tdee = bmr * cfg.activityFactor[input.activity];
  const kcalFloor = cfg.kcalFloor[input.sex];
  const warnings: PlanWarning[] = [];

  if (input.overrideKcal !== undefined) {
    const min = kcalFloor;
    const max = Math.round(cfg.overrideMaxTdeeFactor * tdee);
    if (input.overrideKcal < min || input.overrideKcal > max) {
      return { kind: 'invalid', errors: [{ code: 'override_out_of_range', min, max }] };
    }
  }

  const goalType = input.goal.type;
  let weeklyRateKg = 0;
  let planState: Plan['planState'] = 'ok';
  let needsConfirmation = false;
  let kcal: number;

  if (input.goal.type === 'lose') {
    const weightToLose = input.weightKg - input.goal.targetWeightKg;
    const request = input.goal.request;
    const requestedRate =
      request.mode === 'rate'
        ? request.weeklyRateKg
        : weightToLose / (diffDays(request.targetDate, input.onDate) / 7);

    const maxRate = Math.min(
      cfg.rate.maxBodyFractionPerWeek * input.weightKg,
      cfg.rate.maxAbsKgPerWeek,
      (cfg.rate.maxDeficitFraction * tdee) / KCAL_PER_DAY_PER_KG_WEEK,
      Math.max(0, tdee - kcalFloor) / KCAL_PER_DAY_PER_KG_WEEK,
    );
    // With a manual override the user chose the calories themselves, so "no safe deficit" does not block.
    if (maxRate < cfg.rate.minKgPerWeek && input.overrideKcal === undefined) {
      return {
        kind: 'not_feasible',
        tdee: round2(tdee),
        kcalFloor,
        maxRateKgPerWeek: round2(maxRate),
      };
    }

    weeklyRateKg = Math.min(requestedRate, maxRate);
    if (requestedRate < cfg.rate.minKgPerWeek) {
      weeklyRateKg = cfg.rate.minKgPerWeek;
      warnings.push('rate_raised_to_minimum');
    }
    if (requestedRate - weeklyRateKg > cfg.rate.shortfallTolerance) {
      if (request.mode === 'date') {
        planState = 'date_adjusted';
        needsConfirmation = !input.confirmAdjustedDate;
      } else {
        planState = 'adjusted_rate';
      }
      warnings.push('rate_adjusted');
    }
    if (weightToLose / input.weightKg > cfg.limits.largeLossFraction) {
      warnings.push('large_total_loss');
    }
    kcal = Math.max(kcalFloor, round10(tdee - KCAL_PER_DAY_PER_KG_WEEK * weeklyRateKg));
  } else {
    kcal = round10(tdee);
    if (kcal < kcalFloor) {
      kcal = kcalFloor;
      warnings.push('maintenance_below_floor');
    }
  }

  if (input.overrideKcal !== undefined) {
    kcal = Math.round(input.overrideKcal);
    warnings.push('override_used');
    if (goalType === 'lose') {
      // The user's own target replaces the computed one; the projection follows from the deficit it implies.
      weeklyRateKg = Math.max(0, (tdee - kcal) / KCAL_PER_DAY_PER_KG_WEEK);
      planState = 'ok';
      needsConfirmation = false;
      if (weeklyRateKg < cfg.rate.minKgPerWeek) {
        weeklyRateKg = 0;
        warnings.push('override_no_deficit');
      }
    }
  }
  if (kcal > cfg.kcalMax) {
    kcal = cfg.kcalMax;
    warnings.push('capped_at_max');
  }

  const refWeightKg = referenceWeightKg(input.weightKg, input.heightCm);
  const { state: macroState, macros } = computeMacros({ kcal, refWeightKg, goal: goalType });

  let projectedDays: number | null = null;
  let projectedDate: LocalDate | null = null;
  let targetWeightKg: number | null = null;
  if (input.goal.type === 'lose') {
    targetWeightKg = input.goal.targetWeightKg;
    if (weeklyRateKg > 0) {
      projectedDays = Math.round(((input.weightKg - targetWeightKg) / weeklyRateKg) * 7);
      projectedDate = addDays(input.onDate, projectedDays);
    }
  }

  const plan: Plan = {
    engineVersion: ENGINE_VERSION,
    ageYears,
    bmr: round2(bmr),
    tdee: round2(tdee),
    goalType,
    weeklyRateKg: Math.round(weeklyRateKg * 10_000) / 10_000,
    kcalFloor,
    kcalTarget: kcal,
    macros,
    macroState,
    planState,
    startWeightKg: input.weightKg,
    startDate: input.onDate,
    targetWeightKg,
    projectedDays,
    projectedDate,
    warnings,
  };
  return needsConfirmation ? { kind: 'needs_confirmation', plan } : { kind: 'plan', plan };
}
