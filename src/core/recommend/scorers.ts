import { ADDED_SUGAR_BANDS } from '../food/sugar';
import { type CandidateScorer } from './types';

/**
 * Prefers ideas without added sugar, and steers away from one that would take the day past the "worth a look"
 * line. A nudge, never a ban: when every idea has some sugar the least sweet still comes first (docs/DIABETES.md).
 * Ideas whose sugar is not known are left alone.
 */
export function sugarScorer(
  addedSugarToday: number,
  limitG: number = ADDED_SUGAR_BANDS.okMaxG,
): CandidateScorer {
  return (candidate, scaled) => {
    if (candidate.addedSugarG === undefined) return 0;
    const portion = candidate.kcal > 0 ? scaled.kcal / candidate.kcal : 1;
    const sugar = candidate.addedSugarG * portion;
    if (sugar <= 0) return 0.05;
    if (addedSugarToday + sugar > limitG) return -0.6;
    return -Math.min(0.3, (sugar / limitG) * 0.3);
  };
}

/** The white-flour carbohydrate (g) at which the nudge reaches its full size. */
const REFINED_CARBS_FULL_NUDGE_G = 50;

/**
 * Prefers ideas whose bread, pasta or rice is whole grain over white flour (docs/DIABETES.md). A small nudge: no
 * rule about how much white flour is too much, and an idea without any grain food is left alone.
 */
export function grainScorer(): CandidateScorer {
  return (candidate, scaled) => {
    if (candidate.refinedCarbsG === undefined) return 0;
    const portion = candidate.kcal > 0 ? scaled.kcal / candidate.kcal : 1;
    const refined = candidate.refinedCarbsG * portion;
    if (refined <= 0) return (candidate.wholeCarbsG ?? 0) > 0 ? 0.05 : 0;
    return -Math.min(0.2, (refined / REFINED_CARBS_FULL_NUDGE_G) * 0.2);
  };
}
