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
