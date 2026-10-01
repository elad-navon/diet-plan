import { diffDays, type LocalDate } from '../time';
import { NUTRITION_CONFIG } from './config';
import { type Plan } from './types';

const { trend: trendCfg, projection } = NUTRITION_CONFIG;

export interface WeightEntry {
  date: LocalDate;
  kg: number;
}

export interface TrendPoint extends WeightEntry {
  trendKg: number;
}

/**
 * Smoothed weight (exponential moving average) so a single water-weight swing does not look like
 * progress or failure. A weigh-in `n` days after the previous one moves the trend by
 * `1 - (1 - alpha)^n`; for daily weigh-ins that is exactly `alpha`, and days with no weigh-in do not
 * move the trend (docs/NUTRITION_RULES.md F.5). Entries may arrive in any order.
 */
export function computeTrend(entries: readonly WeightEntry[]): TrendPoint[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const points: TrendPoint[] = [];
  let previous: TrendPoint | undefined;
  for (const entry of sorted) {
    let trendKg = entry.kg;
    if (previous) {
      const days = Math.max(1, diffDays(entry.date, previous.date));
      const weight = 1 - (1 - trendCfg.alpha) ** days;
      trendKg = previous.trendKg + weight * (entry.kg - previous.trendKg);
    }
    previous = { ...entry, trendKg };
    points.push(previous);
  }
  return points;
}

/**
 * True when the smoothed weight has drifted far enough from the weight the plan was built on that
 * suggesting a recalculation makes sense. A weigh-in alone never changes the target.
 */
export function shouldSuggestRecalc(planWeightKg: number, trendKg: number): boolean {
  const threshold = Math.max(trendCfg.recalcMinKg, trendCfg.recalcFraction * planWeightKg);
  return Math.abs(trendKg - planWeightKg) >= threshold;
}

export interface ProjectionPoint {
  date: LocalDate;
  /** Planned weight on `date` following the plan's rate. */
  plannedKg: number;
  /** If the user loses faster / slower than planned: the edges of the uncertainty cone. */
  fastKg: number;
  slowKg: number;
}

/**
 * The projected weight on `date` for a losing plan, with an uncertainty cone. It is an estimate:
 * the UI must label it as such, never as a promise (docs/NUTRITION_RULES.md F.5).
 * Returns null for plans without a projection (maintain / no deficit).
 */
export function projectWeight(plan: Plan, date: LocalDate): ProjectionPoint | null {
  if (plan.targetWeightKg === null || plan.weeklyRateKg <= 0) {
    return null;
  }
  const weeks = Math.max(0, diffDays(date, plan.startDate)) / 7;
  const at = (rate: number): number =>
    Math.max(plan.targetWeightKg ?? 0, plan.startWeightKg - rate * weeks);
  return {
    date,
    plannedKg: at(plan.weeklyRateKg),
    fastKg: at(plan.weeklyRateKg * projection.fastRateFactor),
    slowKg: at(plan.weeklyRateKg * projection.slowRateFactor),
  };
}
