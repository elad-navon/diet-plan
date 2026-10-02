import { describe, expect, it } from 'vitest';
import { sugarScorer } from './scorers';
import { type MealCandidate } from './types';

const idea = (addedSugarG: number | undefined, kcal = 400): MealCandidate => ({
  id: 'x',
  name: 'x',
  slots: [],
  kcal,
  proteinG: 20,
  carbsG: 40,
  fatG: 10,
  tags: [],
  minPortionFactor: 0.5,
  maxPortionFactor: 1.5,
  ...(addedSugarG !== undefined ? { addedSugarG } : {}),
});

const scaled = (kcal: number) => ({ kcal, proteinG: 0, carbsG: 0, fatG: 0 });
const context = { slot: null, budgetKcal: 500, remainingKcal: 500, proteinBehind: false };

describe('the sugar nudge on meal suggestions', () => {
  it('leaves an idea alone when its sugar is not known', () => {
    expect(sugarScorer(5)(idea(undefined), scaled(400), context)).toBe(0);
  });

  it('slightly prefers an idea without added sugar', () => {
    expect(sugarScorer(5)(idea(0), scaled(400), context)).toBeGreaterThan(0);
  });

  it('prefers less sugar to more', () => {
    const score = sugarScorer(0);
    expect(score(idea(3), scaled(400), context)).toBeGreaterThan(
      score(idea(10), scaled(400), context),
    );
  });

  it('scales the sugar with the portion', () => {
    const score = sugarScorer(0);
    expect(score(idea(8), scaled(200), context)).toBeGreaterThan(
      score(idea(8), scaled(600), context),
    );
  });

  it('steers strongly away from an idea that takes the day past 25 g, but never forbids it', () => {
    const score = sugarScorer(20);
    const past = score(idea(10), scaled(400), context); // 20 + 10 > 25
    const within = sugarScorer(5)(idea(10), scaled(400), context); // 5 + 10 < 25
    expect(past).toBe(-0.6);
    expect(within).toBeGreaterThan(past);
  });

  it('uses another limit when given', () => {
    expect(sugarScorer(8, 12)(idea(6), scaled(400), context)).toBe(-0.6);
  });
});
