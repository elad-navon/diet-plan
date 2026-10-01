import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, fromEpochDay, toEpochDay } from '../time';
import {
  NUTRITION_CONFIG,
  bmi,
  computeMacros,
  computePlan,
  computeTrend,
  mifflinBmr,
  minHealthyWeightKg,
  projectWeight,
  referenceWeightKg,
  shouldSuggestRecalc,
  type ActivityLevel,
  type Plan,
  type PlanInputs,
  type PlanOutcome,
  type Sex,
} from './index';

const TODAY = '2026-10-01';

/** V1: the reference "normal user" - female 34, 165 cm, 71 kg, light activity, 71 -> 62 kg at 0.5 kg/week. */
const v1: PlanInputs = {
  sex: 'female',
  birthDate: '1992-03-15',
  onDate: TODAY,
  heightCm: 165,
  weightKg: 71,
  activity: 'light',
  goal: { type: 'lose', targetWeightKg: 62, request: { mode: 'rate', weeklyRateKg: 0.5 } },
};

function planOf(outcome: PlanOutcome): Plan {
  if (outcome.kind !== 'plan' && outcome.kind !== 'needs_confirmation') {
    throw new Error(`expected a plan, got ${outcome.kind}`);
  }
  return outcome.plan;
}

describe('BMR / TDEE (NUT-01)', () => {
  it('matches hand-computed Mifflin-St Jeor values for each sex constant', () => {
    expect(mifflinBmr({ sex: 'female', weightKg: 71, heightCm: 165, ageYears: 34 })).toBeCloseTo(
      1410.25,
      2,
    );
    expect(mifflinBmr({ sex: 'male', weightKg: 105, heightCm: 190, ageYears: 28 })).toBeCloseTo(
      2102.5,
      2,
    );
    // "unspecified" is the midpoint of the male (+5) and female (-161) constants.
    expect(
      mifflinBmr({ sex: 'unspecified', weightKg: 71, heightCm: 165, ageYears: 34 }),
    ).toBeCloseTo(1493.25, 2);
  });

  it('computes BMI, the minimum healthy weight and the protein reference weight', () => {
    expect(bmi(71, 165)).toBeCloseTo(26.08, 2);
    expect(minHealthyWeightKg(170)).toBe(53.5); // 18.5 x 1.7^2 = 53.465 -> rounded up to 0.1
    expect(referenceWeightKg(71, 165)).toBeCloseTo(68.0625, 4);
    expect(referenceWeightKg(60, 165)).toBe(60); // lighter than the BMI-25 weight: unchanged
  });
});

describe('V1: normal user (NUT-02)', () => {
  it('produces the documented plan', () => {
    const plan = planOf(computePlan(v1));
    expect(plan.ageYears).toBe(34);
    expect(plan.bmr).toBe(1410.25);
    expect(plan.tdee).toBe(1939.09);
    expect(plan.weeklyRateKg).toBe(0.5);
    expect(plan.kcalTarget).toBe(1390);
    expect(plan.macros).toEqual({ proteinG: 122, carbsG: 133, fatG: 41 });
    expect(plan.macroState).toBe('ok');
    expect(plan.planState).toBe('ok');
    expect(plan.projectedDays).toBe(126);
    expect(plan.projectedDate).toBe(addDays(TODAY, 126));
    expect(plan.warnings).toEqual([]);
  });
});

describe('V2: TDEE too close to the floor (NUT-03)', () => {
  it('refuses a weight-loss plan instead of going below the safe floor', () => {
    const outcome = computePlan({
      sex: 'female',
      birthDate: '1971-01-01',
      onDate: TODAY,
      heightCm: 155,
      weightKg: 52,
      activity: 'sedentary',
      goal: { type: 'lose', targetWeightKg: 49, request: { mode: 'rate', weeklyRateKg: 0.5 } },
    });
    expect(outcome.kind).toBe('not_feasible');
    if (outcome.kind === 'not_feasible') {
      expect(outcome.tdee).toBeCloseTo(1263.3, 1);
      expect(outcome.kcalFloor).toBe(1200);
      expect(outcome.maxRateKgPerWeek).toBeLessThan(NUTRITION_CONFIG.rate.minKgPerWeek);
    }
  });
});

describe('V3: rate capped by the 30% deficit limit (NUT-04)', () => {
  it('uses the capped rate without nagging about a negligible shortfall', () => {
    const plan = planOf(
      computePlan({
        sex: 'male',
        birthDate: '1998-05-20',
        onDate: TODAY,
        heightCm: 190,
        weightKg: 105,
        activity: 'high', // factor 1.725, as in docs/NUTRITION_RULES.md V3
        goal: { type: 'lose', targetWeightKg: 95, request: { mode: 'rate', weeklyRateKg: 1.0 } },
      }),
    );
    expect(plan.bmr).toBe(2102.5);
    expect(plan.tdee).toBeCloseTo(3626.81, 2);
    expect(plan.weeklyRateKg).toBeCloseTo(0.9891, 4);
    expect(plan.kcalTarget).toBe(2540);
    expect(plan.macros).toEqual({ proteinG: 162, carbsG: 313, fatG: 71 });
    expect(plan.planState).toBe('ok');
    expect(plan.warnings).not.toContain('rate_adjusted');
  });

  it('flags a rate that is clearly capped (rate mode)', () => {
    const plan = planOf(
      computePlan({
        ...v1,
        goal: { type: 'lose', targetWeightKg: 62, request: { mode: 'rate', weeklyRateKg: 1.0 } },
      }),
    );
    expect(plan.planState).toBe('adjusted_rate');
    expect(plan.warnings).toContain('rate_adjusted');
    expect(plan.weeklyRateKg).toBeLessThan(1.0);
  });
});

describe('V6: unrealistic target date (NUT-05)', () => {
  const rushed: PlanInputs = {
    sex: 'female',
    birthDate: '1992-03-15',
    onDate: TODAY,
    heightCm: 165,
    weightKg: 80,
    activity: 'light',
    goal: {
      type: 'lose',
      targetWeightKg: 70,
      request: { mode: 'date', targetDate: addDays(TODAY, 28) },
    },
  };

  it('does not silently adopt an unsafe date: it proposes a realistic one and waits for confirmation', () => {
    const outcome = computePlan(rushed);
    expect(outcome.kind).toBe('needs_confirmation');
    const plan = planOf(outcome);
    expect(plan.planState).toBe('date_adjusted');
    expect(plan.weeklyRateKg).toBeCloseTo(0.5626, 3);
    expect(plan.projectedDays).toBe(124);
    expect(plan.projectedDate).toBe(addDays(TODAY, 124));
  });

  it('saves the realistic plan once the user confirms', () => {
    const outcome = computePlan({ ...rushed, confirmAdjustedDate: true });
    expect(outcome.kind).toBe('plan');
    expect(planOf(outcome).planState).toBe('date_adjusted');
  });

  it('accepts a comfortable date as requested', () => {
    const outcome = computePlan({
      ...rushed,
      goal: {
        type: 'lose',
        targetWeightKg: 70,
        request: { mode: 'date', targetDate: addDays(TODAY, 140) },
      },
    });
    expect(outcome.kind).toBe('plan');
    const plan = planOf(outcome);
    expect(plan.planState).toBe('ok');
    expect(plan.projectedDays).toBe(140);
  });

  it('only raises a very slow requested rate to the minimum, which finishes earlier', () => {
    const plan = planOf(
      computePlan({
        ...rushed,
        goal: {
          type: 'lose',
          targetWeightKg: 79,
          request: { mode: 'date', targetDate: addDays(TODAY, 700) },
        },
      }),
    );
    expect(plan.weeklyRateKg).toBe(NUTRITION_CONFIG.rate.minKgPerWeek);
    expect(plan.warnings).toContain('rate_raised_to_minimum');
    expect(plan.projectedDays).toBe(70);
  });
});

describe('V7: safety blocks (NUT-08)', () => {
  const codes = (outcome: PlanOutcome): string[] =>
    outcome.kind === 'invalid' ? outcome.errors.map((e) => e.code) : [];

  it('blocks users under 18', () => {
    expect(codes(computePlan({ ...v1, birthDate: '2009-10-02' }))).toContain('age_under_18');
    expect(codes(computePlan({ ...v1, birthDate: '2008-10-01' }))).not.toContain('age_under_18');
  });

  it('blocks weight loss for an underweight user', () => {
    const outcome = computePlan({
      ...v1,
      heightCm: 170,
      weightKg: 52,
      goal: { type: 'lose', targetWeightKg: 50, request: { mode: 'rate', weeklyRateKg: 0.25 } },
    });
    expect(bmi(52, 170)).toBeLessThan(18.5);
    expect(codes(outcome)).toContain('bmi_underweight_for_loss');
  });

  it('rejects a target below BMI 18.5 and says what the minimum is', () => {
    const outcome = computePlan({
      ...v1,
      heightCm: 170,
      weightKg: 60,
      goal: { type: 'lose', targetWeightKg: 53.1, request: { mode: 'rate', weeklyRateKg: 0.25 } },
    });
    expect(outcome.kind).toBe('invalid');
    if (outcome.kind === 'invalid') {
      expect(outcome.errors).toContainEqual({ code: 'target_below_bmi_18_5', min: 53.5 });
    }
  });

  it('rejects out-of-range or nonsensical numbers and dates', () => {
    expect(codes(computePlan({ ...v1, weightKg: 20 }))).toContain('weight_out_of_range');
    expect(codes(computePlan({ ...v1, heightCm: 260 }))).toContain('height_out_of_range');
    expect(codes(computePlan({ ...v1, weightKg: Number.NaN }))).toEqual(['invalid_number']);
    expect(codes(computePlan({ ...v1, birthDate: '1992-02-30' }))).toEqual(['invalid_date']);
    expect(
      codes(
        computePlan({
          ...v1,
          goal: { type: 'lose', targetWeightKg: 71, request: { mode: 'rate', weeklyRateKg: 0.5 } },
        }),
      ),
    ).toContain('target_not_below_current');
    expect(
      codes(
        computePlan({
          ...v1,
          goal: { type: 'lose', targetWeightKg: 62, request: { mode: 'date', targetDate: TODAY } },
        }),
      ),
    ).toContain('target_date_not_in_future');
    expect(
      codes(
        computePlan({
          ...v1,
          goal: { type: 'lose', targetWeightKg: 62, request: { mode: 'rate', weeklyRateKg: 0 } },
        }),
      ),
    ).toContain('rate_out_of_range');
  });
});

describe('maintenance and manual override', () => {
  it('sets the target to maintenance calories with no projection', () => {
    const plan = planOf(computePlan({ ...v1, goal: { type: 'maintain' } }));
    expect(plan.kcalTarget).toBe(1940);
    expect(plan.weeklyRateKg).toBe(0);
    expect(plan.projectedDays).toBeNull();
    expect(plan.projectedDate).toBeNull();
    expect(plan.targetWeightKg).toBeNull();
    expect(plan.macros).not.toBeNull();
  });

  it('never targets less than the floor, even for tiny maintenance needs', () => {
    const plan = planOf(
      computePlan({
        sex: 'female',
        birthDate: '1926-01-01',
        onDate: TODAY,
        heightCm: 120,
        weightKg: 35,
        activity: 'sedentary',
        goal: { type: 'maintain' },
      }),
    );
    expect(plan.kcalTarget).toBe(1200);
    expect(plan.warnings).toContain('maintenance_below_floor');
  });

  it('honours a valid manual override and rejects one outside [floor, 1.3 x TDEE]', () => {
    const ok = planOf(computePlan({ ...v1, overrideKcal: 1500 }));
    expect(ok.kcalTarget).toBe(1500);
    expect(ok.warnings).toContain('override_used');
    // The implied deficit drives the projection: (1939.09 - 1500) / 1100 per week.
    expect(ok.weeklyRateKg).toBeCloseTo(0.3992, 3);

    for (const overrideKcal of [1100, 2600]) {
      const outcome = computePlan({ ...v1, overrideKcal });
      expect(outcome.kind).toBe('invalid');
      if (outcome.kind === 'invalid') {
        expect(outcome.errors[0]?.code).toBe('override_out_of_range');
        expect(outcome.errors[0]?.min).toBe(1200);
      }
    }
  });
});

describe('macro constraint resolution (NUT-06)', () => {
  it('V4: relaxes fat then protein to their floors and reports low_carb', () => {
    const result = computeMacros({ kcal: 1200, refWeightKg: 81, goal: 'lose' });
    expect(result.state).toBe('low_carb');
    expect(result.macros).toEqual({ proteinG: 97, carbsG: 93, fatG: 49 });
  });

  it('V5: returns conflict and NO macros when even the floors do not fit', () => {
    const result = computeMacros({ kcal: 1500, refWeightKg: 132.25, goal: 'lose' });
    expect(result.state).toBe('conflict');
    expect(result.macros).toBeNull();
  });

  it('V5 through computePlan: a manual override that cannot fit the floors yields no macro targets', () => {
    const plan = planOf(
      computePlan({
        sex: 'male',
        birthDate: '1996-01-01',
        onDate: TODAY,
        heightCm: 230,
        weightKg: 140,
        activity: 'moderate',
        goal: { type: 'maintain' },
        overrideKcal: 1500,
      }),
    );
    expect(plan.kcalTarget).toBe(1500);
    expect(plan.macroState).toBe('conflict');
    expect(plan.macros).toBeNull();
  });

  it('keeps the protein floor when it exceeds the 35% cap', () => {
    const result = computeMacros({ kcal: 1200, refWeightKg: 81, goal: 'lose' });
    // cap = 0.35 x 1200 / 4 = 105 g; floor = 1.2 x 81 = 97.2 g -> the solver may go down to the floor, not below.
    expect(result.macros?.proteinG).toBeGreaterThanOrEqual(97);
  });
});

describe('property: macro solver never returns impossible values (NUT-07)', () => {
  it('holds its invariants over the whole input space', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1200, max: 6000 }),
        fc.integer({ min: 300, max: 1400 }).map((x) => x / 10),
        fc.constantFrom('lose' as const, 'maintain' as const),
        (kcal, refWeightKg, goal) => {
          const { state, macros } = computeMacros({ kcal, refWeightKg, goal });
          if (macros === null) {
            expect(state).toBe('conflict');
            return;
          }
          const { proteinG, carbsG, fatG } = macros;
          const proteinFloor = NUTRITION_CONFIG.protein.floorPerKg * refWeightKg;
          const fatFloor = Math.max(
            NUTRITION_CONFIG.fat.floorPerKg * refWeightKg,
            (NUTRITION_CONFIG.fat.floorFractionOfKcal * kcal) / 9,
          );
          // Rounding to whole grams may land at most half a gram under a floor.
          expect(proteinG).toBeGreaterThanOrEqual(proteinFloor - 0.5);
          expect(fatG).toBeGreaterThanOrEqual(fatFloor - 0.5);
          expect(carbsG).toBeGreaterThanOrEqual(NUTRITION_CONFIG.carbs.hardFloorG);
          expect(Math.abs(4 * proteinG + 4 * carbsG + 9 * fatG - kcal)).toBeLessThanOrEqual(5);
          if (state === 'ok') {
            expect(carbsG).toBeGreaterThanOrEqual(NUTRITION_CONFIG.carbs.softFloorG - 2);
          }
          for (const grams of [proteinG, carbsG, fatG]) {
            expect(Number.isInteger(grams)).toBe(true);
            expect(grams).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe('property: plans are safe and well-formed (NUT-07)', () => {
  const sexArb = fc.constantFrom<Sex>('female', 'male', 'unspecified');
  const activityArb = fc.constantFrom<ActivityLevel>(
    'sedentary',
    'light',
    'moderate',
    'high',
    'very_high',
  );
  const bodyArb = fc
    .record({
      heightCm: fc.integer({ min: 140, max: 210 }),
      bmiTimes10: fc.integer({ min: 190, max: 450 }),
    })
    .map(({ heightCm, bmiTimes10 }) => ({
      heightCm,
      weightKg: Math.min(
        300,
        Math.max(35, Math.round((bmiTimes10 / 10) * (heightCm / 100) ** 2 * 10) / 10),
      ),
    }));
  const birthDateFor = (ageYears: number): string =>
    fromEpochDay(toEpochDay(TODAY) - Math.round(ageYears * 365.25));

  const inputArb = fc
    .record({
      sex: sexArb,
      activity: activityArb,
      ageYears: fc.integer({ min: 20, max: 90 }),
      body: bodyArb,
      lose: fc.boolean(),
      lossKg: fc.integer({ min: 1, max: 40 }),
      rate: fc.integer({ min: 5, max: 150 }).map((x) => x / 100),
    })
    .map(({ sex, activity, ageYears, body, lose, lossKg, rate }): PlanInputs => {
      const target = Math.max(minHealthyWeightKg(body.heightCm), body.weightKg - lossKg);
      return {
        sex,
        activity,
        birthDate: birthDateFor(ageYears),
        onDate: TODAY,
        heightCm: body.heightCm,
        weightKg: body.weightKg,
        goal: lose
          ? {
              type: 'lose',
              targetWeightKg: Math.round(target * 10) / 10,
              request: { mode: 'rate', weeklyRateKg: rate },
            }
          : { type: 'maintain' },
      };
    })
    .filter(
      (input) => input.goal.type === 'maintain' || input.goal.targetWeightKg < input.weightKg,
    );

  it('never returns a target below the floor or above TDEE, and never invented macros', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const outcome = computePlan(input);
        expect(outcome.kind).not.toBe('invalid');
        if (outcome.kind === 'not_feasible') {
          expect(input.goal.type).toBe('lose');
          return;
        }
        const plan = planOf(outcome);
        expect(Number.isInteger(plan.kcalTarget)).toBe(true);
        expect(plan.kcalTarget).toBeGreaterThanOrEqual(plan.kcalFloor);
        expect(plan.kcalTarget).toBeLessThanOrEqual(NUTRITION_CONFIG.kcalMax);
        if (plan.goalType === 'lose') {
          expect(plan.kcalTarget).toBeLessThanOrEqual(Math.round(plan.tdee / 10) * 10);
          expect(plan.weeklyRateKg).toBeGreaterThanOrEqual(
            NUTRITION_CONFIG.rate.minKgPerWeek - 1e-9,
          );
          expect(plan.weeklyRateKg).toBeLessThanOrEqual(
            NUTRITION_CONFIG.rate.maxAbsKgPerWeek + 1e-9,
          );
          expect(plan.weeklyRateKg).toBeLessThanOrEqual(0.01 * input.weightKg + 1e-9);
          expect(plan.projectedDays).toBeGreaterThan(0);
        } else {
          expect(plan.weeklyRateKg).toBe(0);
        }
        expect(plan.macros === null).toBe(plan.macroState === 'conflict');
        if (plan.macros) {
          const { proteinG, carbsG, fatG } = plan.macros;
          expect(carbsG).toBeGreaterThanOrEqual(NUTRITION_CONFIG.carbs.hardFloorG);
          expect(
            Math.abs(4 * proteinG + 4 * carbsG + 9 * fatG - plan.kcalTarget),
          ).toBeLessThanOrEqual(5);
        }
        for (const value of [plan.bmr, plan.tdee, plan.weeklyRateKg, plan.kcalTarget]) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }),
      { numRuns: 1500 },
    );
  });

  it('a faster requested rate never gives a higher calorie target', () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 1, max: 60 }), (input, extra) => {
        fc.pre(input.goal.type === 'lose');
        if (input.goal.type !== 'lose' || input.goal.request.mode !== 'rate') return;
        const slower = computePlan(input);
        const faster = computePlan({
          ...input,
          goal: {
            ...input.goal,
            request: { mode: 'rate', weeklyRateKg: input.goal.request.weeklyRateKg + extra / 100 },
          },
        });
        fc.pre(slower.kind === 'plan' && faster.kind === 'plan');
        expect(planOf(faster).kcalTarget).toBeLessThanOrEqual(planOf(slower).kcalTarget);
      }),
      { numRuns: 800 },
    );
  });
});

describe('weight trend and recalculation (NUT-10, NUT-11)', () => {
  it('smooths daily weigh-ins with alpha 0.1', () => {
    const trend = computeTrend([
      { date: '2026-10-01', kg: 80 },
      { date: '2026-10-02', kg: 82 },
      { date: '2026-10-03', kg: 81 },
    ]).map((p) => p.trendKg);
    expect(trend[0]).toBe(80);
    expect(trend[1]).toBeCloseTo(80.2, 10);
    expect(trend[2]).toBeCloseTo(80.28, 10);
  });

  it('weights a weigh-in after a gap by the days it spans, and accepts unsorted input', () => {
    const trend = computeTrend([
      { date: '2026-10-08', kg: 78 },
      { date: '2026-10-01', kg: 80 },
    ]);
    expect(trend.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-08']);
    expect(trend[1]?.trendKg).toBeCloseTo(80 + (1 - 0.9 ** 7) * -2, 10);
  });

  it('only suggests recalculating after a meaningful drift, never on a single reading', () => {
    expect(shouldSuggestRecalc(71, 69.0)).toBe(false); // 2.0 < max(2, 2.13)
    expect(shouldSuggestRecalc(71, 68.8)).toBe(true);
    expect(shouldSuggestRecalc(71, 73.5)).toBe(true);
    expect(shouldSuggestRecalc(100, 97.5)).toBe(false); // threshold = max(2, 3) = 3
    expect(shouldSuggestRecalc(100, 96.9)).toBe(true);
  });
});

describe('weight projection (NUT-12)', () => {
  const plan = planOf(computePlan(v1));

  it('draws the planned line and an uncertainty cone around it', () => {
    const point = projectWeight(plan, addDays(TODAY, 14));
    expect(point?.plannedKg).toBeCloseTo(70, 10);
    expect(point?.fastKg).toBeCloseTo(71 - 0.5 * 1.15 * 2, 10);
    expect(point?.slowKg).toBeCloseTo(71 - 0.5 * 0.6 * 2, 10);
    expect(point!.fastKg).toBeLessThan(point!.plannedKg);
    expect(point!.slowKg).toBeGreaterThan(point!.plannedKg);
  });

  it('never projects below the target weight', () => {
    expect(projectWeight(plan, addDays(TODAY, 2000))?.plannedKg).toBe(62);
  });

  it('has no projection for maintenance', () => {
    const maintain = planOf(computePlan({ ...v1, goal: { type: 'maintain' } }));
    expect(projectWeight(maintain, addDays(TODAY, 14))).toBeNull();
  });
});
