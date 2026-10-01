import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MEAL_IDEAS, buildMealIdeas, type FoodDb } from '../src/core/food';

/** The meal ideas must be built from foods that really exist, with believable totals. */
const db = JSON.parse(
  readFileSync(new URL('../src/assets/food-db/food-db.json', import.meta.url), 'utf8'),
) as FoodDb;
const ideas = buildMealIdeas(db.foods);

describe('meal ideas', () => {
  it('builds every idea (every food id exists in the database)', () => {
    expect(ideas.map((i) => i.id)).toEqual(MEAL_IDEAS.map((i) => i.id));
  });

  it('has unique ids and names', () => {
    expect(new Set(ideas.map((i) => i.id)).size).toBe(ideas.length);
    expect(new Set(ideas.map((i) => i.name)).size).toBe(ideas.length);
  });

  it('has believable calories and macros for its slot', () => {
    for (const idea of ideas) {
      const [min, max] = idea.slots.includes('snack') ? [50, 300] : [200, 750];
      expect(idea.kcal, `${idea.name} (${idea.kcal} kcal)`).toBeGreaterThanOrEqual(min);
      expect(idea.kcal, `${idea.name} (${idea.kcal} kcal)`).toBeLessThanOrEqual(max);
      expect(4 * idea.proteinG + 4 * idea.carbsG + 9 * idea.fatG).toBeLessThan(idea.kcal * 1.35);
      expect(idea.proteinG + idea.carbsG + idea.fatG).toBeGreaterThan(0);
      expect(idea.minPortionFactor).toBeLessThan(idea.maxPortionFactor);
    }
  });

  it('covers every slot with enough variety to choose from', () => {
    const count = (slot: string) => ideas.filter((i) => i.slots.includes(slot as never)).length;
    expect(count('breakfast')).toBeGreaterThanOrEqual(5);
    expect(count('lunch')).toBeGreaterThanOrEqual(8);
    expect(count('dinner')).toBeGreaterThanOrEqual(8);
    expect(count('snack')).toBeGreaterThanOrEqual(8);
  });

  it('skips an idea whose food is missing instead of guessing', () => {
    const without = buildMealIdeas(db.foods.filter((f) => f.id !== '1573'));
    expect(without.find((i) => i.id === 'omelette-salad')).toBeUndefined();
    expect(without.length).toBe(ideas.length - 1);
  });
});
