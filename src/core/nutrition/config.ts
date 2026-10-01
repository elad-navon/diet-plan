/**
 * Every tunable number of the nutrition engine, in one place (docs/NUTRITION_RULES.md F.1).
 * Changing any value means bumping ENGINE_VERSION and updating the test vectors.
 */
export const ENGINE_VERSION = '1.0.0';

export const NUTRITION_CONFIG = {
  /** Energy equivalent of 1 kg of body weight. A simplification - plans are estimates, not promises. */
  kcalPerKg: 7700,

  rate: {
    minKgPerWeek: 0.1,
    maxAbsKgPerWeek: 1.0,
    maxBodyFractionPerWeek: 0.01,
    /** Largest deficit allowed as a share of TDEE. */
    maxDeficitFraction: 0.3,
    /** A shortfall below this is not worth telling the user about. */
    shortfallTolerance: 0.02,
  },

  /** Hard floors on the daily calorie target. */
  kcalFloor: { female: 1200, male: 1500, unspecified: 1350 },
  /** Upper bound matching the database CHECK on target_plans.kcal_target. */
  kcalMax: 6000,
  /** A manual override must stay within [floor, overrideMaxTdeeFactor * TDEE]. */
  overrideMaxTdeeFactor: 1.3,

  /** Mifflin-St Jeor sex constant (the "unspecified" value is the midpoint of the other two). */
  mifflinSexConstant: { female: -161, male: 5, unspecified: -78 },
  activityFactor: {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    high: 1.725,
    very_high: 1.9,
  },

  protein: {
    targetPerKg: { lose: 1.8, maintain: 1.6 },
    floorPerKg: 1.2,
    capFractionOfKcal: 0.35,
  },
  fat: { targetFractionOfKcal: 0.25, floorPerKg: 0.6, floorFractionOfKcal: 0.2 },
  carbs: { softFloorG: 100, hardFloorG: 50 },
  kcalPerGram: { protein: 4, carbs: 4, fat: 9 },

  limits: {
    age: { min: 18, max: 100 },
    heightCm: { min: 120, max: 230 },
    weightKg: { min: 35, max: 300 },
    minBmi: 18.5,
    /** Protein is based on the weight at this BMI when the user is heavier than it. */
    referenceBmi: 25,
    /** Warn when a plan asks the user to lose more than this share of body weight. */
    largeLossFraction: 0.3,
  },

  /** The projection chart shows a cone: faster/slower than the plan rate. */
  projection: { fastRateFactor: 1.15, slowRateFactor: 0.6 },

  trend: { alpha: 0.1, recalcMinKg: 2, recalcFraction: 0.03 },
} as const;
