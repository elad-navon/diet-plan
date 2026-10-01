import { NUTRITION_CONFIG } from './config';
import { type GoalType, type MacroState, type Macros } from './types';

export interface MacroResult {
  state: MacroState;
  /** Null only in the `conflict` state: no safe split exists, so no numbers are invented. */
  macros: Macros | null;
}

const { protein, fat, carbs, kcalPerGram } = NUTRITION_CONFIG;

/**
 * Splits `kcal` into protein / carbs / fat, resolving conflicts by priority
 * (docs/NUTRITION_RULES.md F.4):
 *   1. the calorie target never moves;
 *   2. protein and fat have floors (relaxed fat first, then protein, never below the floor);
 *   3. carbs are the flexible remainder - soft floor 100 g, hard floor 50 g.
 * If even the floors do not fit, returns `conflict` with no macros.
 */
export function computeMacros(input: {
  kcal: number;
  refWeightKg: number;
  goal: GoalType;
}): MacroResult {
  const { kcal, refWeightKg, goal } = input;

  const proteinFloor = protein.floorPerKg * refWeightKg;
  const proteinCap = (protein.capFractionOfKcal * kcal) / kcalPerGram.protein;
  const fatFloor = Math.max(
    fat.floorPerKg * refWeightKg,
    (fat.floorFractionOfKcal * kcal) / kcalPerGram.fat,
  );

  // The protein floor beats the protein cap when the two disagree.
  let p = Math.max(
    proteinFloor,
    Math.min(protein.targetPerKg[goal] * refWeightKg, Math.max(proteinFloor, proteinCap)),
  );
  let f = Math.max(fatFloor, (fat.targetFractionOfKcal * kcal) / kcalPerGram.fat);
  const carbsFor = (pg: number, fg: number): number =>
    (kcal - kcalPerGram.protein * pg - kcalPerGram.fat * fg) / kcalPerGram.carbs;

  let state: MacroState = 'ok';
  let c = carbsFor(p, f);

  if (c < carbs.softFloorG) {
    // Relax fat first (down to its floor)...
    f = Math.max(
      fatFloor,
      (kcal - kcalPerGram.protein * p - kcalPerGram.carbs * carbs.softFloorG) / kcalPerGram.fat,
    );
    c = carbsFor(p, f);
    state = 'relaxed';
  }
  if (c < carbs.softFloorG) {
    // ...then protein (down to its floor).
    p = Math.max(
      proteinFloor,
      (kcal - kcalPerGram.fat * f - kcalPerGram.carbs * carbs.softFloorG) / kcalPerGram.protein,
    );
    c = carbsFor(p, f);
  }
  if (c < carbs.softFloorG) {
    state = c >= carbs.hardFloorG ? 'low_carb' : 'conflict';
  }
  if (state === 'conflict') {
    return { state, macros: null };
  }

  const proteinG = Math.round(p);
  const fatG = Math.round(f);
  const carbsG = Math.round(carbsFor(proteinG, fatG));
  if (carbsG < carbs.hardFloorG) {
    return { state: 'conflict', macros: null };
  }
  return { state, macros: { proteinG, carbsG, fatG } };
}
