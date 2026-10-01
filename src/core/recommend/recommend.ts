import { corridorAt, slotWindows, type SlotWindow } from '../schedule';
import {
  type CandidateFilter,
  type CandidateScorer,
  type DayStatus,
  type NextMeal,
  type Recommendation,
  type RecommendationNote,
  type RecommendInput,
  type ScoringContext,
  type SlotBudget,
  type Suggestion,
} from './types';

/** Tunables of the recommendation engine (docs/NUTRITION_RULES.md F.6). */
export const RECOMMEND_CONFIG = {
  /** Tolerance around the corridor: max(toleranceFloorKcal, toleranceFraction x target). */
  toleranceFloorKcal: 100,
  toleranceFraction: 0.06,
  /** A slot counts as done once this share of its planned calories was eaten. */
  slotDoneFraction: 0.5,
  /** A single meal never gets more than min(capFactor x planned, capFractionOfTarget x target). */
  capFactor: 1.5,
  capFractionOfTarget: 0.45,
  /** Below this there is nothing worth suggesting. */
  minRecommendKcal: 150,
  /** After the last window, an optional snack is at most this share of the target. */
  lightSnackMaxFraction: 0.2,
  /** Unallocated budget above this share of the target triggers the `skipped_meals` note. */
  skippedNoteFraction: 0.25,
  /** Intake above this multiple of the target triggers the `excess_large` note. */
  excessLargeFactor: 1.5,
  suggestionCount: 3,
  portionStep: 0.25,
  /** Protein counts as lagging when its remaining share exceeds the calories' remaining share by this much. */
  proteinBehindMargin: 0.1,
  /** A "high protein" idea gets >= 30% of its calories from protein. */
  proteinDensityMin: 0.3,
  /** Suggested times are rounded up to this many minutes. */
  roundMinutes: 5,
} as const;

const cfg = RECOMMEND_CONFIG;
const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

function roundUp(instant: number): number {
  const step = cfg.roundMinutes * 60_000;
  return Math.ceil(instant / step) * step;
}

function suggest(input: RecommendInput, context: ScoringContext, budgetKcal: number): Suggestion[] {
  const filters: readonly CandidateFilter[] = input.filters ?? [];
  const scorers: readonly CandidateScorer[] = input.scorers ?? [];
  const suggestions: Suggestion[] = [];

  for (const candidate of input.candidates) {
    if (candidate.kcal <= 0 || !filters.every((keep) => keep(candidate, context))) continue;

    // Scale the portion to fit: never above the budget, in realistic steps, within the idea's range.
    const rawFactor = Math.min(candidate.maxPortionFactor, budgetKcal / candidate.kcal);
    const portionFactor = Math.floor(rawFactor / cfg.portionStep + 1e-9) * cfg.portionStep;
    if (portionFactor < candidate.minPortionFactor) continue;

    const scaled = {
      kcal: candidate.kcal * portionFactor,
      proteinG: candidate.proteinG * portionFactor,
      carbsG: candidate.carbsG * portionFactor,
      fatG: candidate.fatG * portionFactor,
    };
    let score = 1 - Math.abs(scaled.kcal - budgetKcal) / budgetKcal;
    if (context.slot !== null && candidate.slots.length > 0) {
      score += candidate.slots.includes(context.slot) ? 0.1 : -0.2;
    }
    if (context.proteinBehind && (scaled.proteinG * 4) / scaled.kcal >= cfg.proteinDensityMin) {
      score += 0.25;
    }
    for (const scorer of scorers) score += scorer(candidate, scaled, context);

    suggestions.push({
      candidateId: candidate.id,
      name: candidate.name,
      portionFactor,
      ...scaled,
      score,
    });
  }

  suggestions.sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId));
  return suggestions.slice(0, cfg.suggestionCount);
}

/**
 * What to eat next and how it compares to the plan so far. A pure function of its input - editing,
 * deleting or back-dating a meal simply changes the input, so there is no hidden state to go stale
 * (docs/NUTRITION_RULES.md F.6, tests REC-01..REC-12).
 *
 * Principles: never recommend more than what is left; never push the user to "make up for" skipped
 * meals beyond a modest cap; never offer calories once the target is exceeded.
 */
export function recommendNext(input: RecommendInput): Recommendation {
  const { now, kcalTarget } = input;
  const windows: SlotWindow[] = slotWindows(input.schedule, input.date, input.tz);

  const consumedKcal = sum(input.meals.map((meal) => meal.kcal));
  const remainingKcal = kcalTarget - consumedKcal;
  const toleranceKcal = Math.max(cfg.toleranceFloorKcal, cfg.toleranceFraction * kcalTarget);
  const corridor = corridorAt(windows, kcalTarget, now);
  const lastWindowEnd = Math.max(...windows.map((window) => window.endInstant));
  const afterLastWindow = windows.length > 0 && now >= lastWindowEnd;

  let status: DayStatus;
  if (consumedKcal > kcalTarget) status = 'over_budget';
  else if (consumedKcal > corridor.upperKcal + toleranceKcal) status = 'ahead';
  else if (afterLastWindow) status = 'day_complete';
  else if (consumedKcal < corridor.lowerKcal - toleranceKcal) status = 'behind';
  else status = 'on_track';

  // Slots still ahead of us: window not over, and less than half of its plan already eaten.
  const kcalInSlot = (slot: string): number =>
    sum(input.meals.filter((meal) => meal.slot === slot).map((meal) => meal.kcal));
  const open = windows.filter(
    (window) =>
      window.endInstant > now &&
      kcalInSlot(window.id) < cfg.slotDoneFraction * window.weight * kcalTarget,
  );

  const budgets: SlotBudget[] = [];
  if (remainingKcal > 0 && open.length > 0) {
    const totalPlanned = sum(open.map((window) => window.weight * kcalTarget));
    for (const window of open) {
      const plannedKcal = window.weight * kcalTarget;
      const cap = Math.min(cfg.capFactor * plannedKcal, cfg.capFractionOfTarget * kcalTarget);
      budgets.push({
        slot: window.id,
        plannedKcal,
        budgetKcal: Math.min(cap, (plannedKcal / totalPlanned) * remainingKcal),
        windowStart: window.startInstant,
        windowEnd: window.endInstant,
        suggestedAt: Math.min(Math.max(roundUp(now), window.startInstant), window.endInstant),
      });
    }
  }
  const allocatedKcal = sum(budgets.map((budget) => budget.budgetKcal));
  const unallocatedKcal = Math.max(0, remainingKcal - allocatedKcal);

  // Protein is only compared when every meal has macro data; partial data would mislead.
  let proteinBehind = false;
  if (input.macros && input.meals.every((meal) => meal.proteinG !== null)) {
    const proteinEaten = sum(input.meals.map((meal) => meal.proteinG ?? 0));
    const proteinRemainingShare = (input.macros.proteinG - proteinEaten) / input.macros.proteinG;
    proteinBehind = proteinRemainingShare > remainingKcal / kcalTarget + cfg.proteinBehindMargin;
  }

  const notes: RecommendationNote[] = [];
  let next: NextMeal | null = null;
  const first = budgets[0];
  if (first && first.budgetKcal >= cfg.minRecommendKcal) {
    const context: ScoringContext = {
      slot: first.slot,
      budgetKcal: first.budgetKcal,
      remainingKcal,
      proteinBehind,
    };
    const suggestions = suggest(input, context, first.budgetKcal);
    next = {
      slot: first.slot,
      optional: false,
      budgetKcal: first.budgetKcal,
      suggestedAt: first.suggestedAt,
      suggestions,
    };
    if (suggestions.length === 0) notes.push('no_suggestions_fit');
  } else if (afterLastWindow && remainingKcal >= cfg.minRecommendKcal) {
    // The day's windows are over but a meaningful amount is left: offer an optional light snack only.
    const budgetKcal = Math.min(remainingKcal, cfg.lightSnackMaxFraction * kcalTarget);
    const context: ScoringContext = { slot: null, budgetKcal, remainingKcal, proteinBehind };
    next = {
      slot: null,
      optional: true,
      budgetKcal,
      suggestedAt: roundUp(now),
      suggestions: suggest(input, context, budgetKcal),
    };
  }

  if (consumedKcal === kcalTarget) notes.push('target_reached');
  if (remainingKcal > 0 && unallocatedKcal >= cfg.skippedNoteFraction * kcalTarget) {
    notes.push('skipped_meals');
  }
  if (consumedKcal > cfg.excessLargeFactor * kcalTarget) notes.push('excess_large');
  if (
    status === 'day_complete' &&
    input.kcalFloor !== undefined &&
    consumedKcal < input.kcalFloor
  ) {
    notes.push('below_safe_floor');
  }

  return {
    status,
    consumedKcal,
    remainingKcal,
    toleranceKcal,
    corridor,
    budgets,
    unallocatedKcal,
    next,
    notes,
  };
}
