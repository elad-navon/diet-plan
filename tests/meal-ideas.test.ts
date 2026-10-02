import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MEAL_IDEAS,
  buildMealIdeas,
  portionParts,
  sumEntries,
  type FoodDb,
} from '../src/core/food';

/** The meal ideas must be built from foods that really exist, with believable totals. */
const db = JSON.parse(
  readFileSync(new URL('../src/assets/food-db/food-db.json', import.meta.url), 'utf8'),
) as FoodDb;
const ideas = buildMealIdeas(db.foods);
const byId = new Map(db.foods.map((food) => [food.id, food]));

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

  it('lists real ingredients for every idea, and their totals are the idea totals', () => {
    for (const idea of ideas) {
      const parts = portionParts(idea.recipe ?? [], 1, byId);
      expect(parts, idea.name).not.toBeNull();
      const totals = sumEntries((parts ?? []).map((part) => part.entry));
      expect(totals.kcal, idea.name).toBe(idea.kcal);
      expect(parts?.length, idea.name).toBeGreaterThanOrEqual(1);
    }
  });

  it('prefers household measures to bare grams where the database has them', () => {
    const withMeasure = ideas.filter((idea) =>
      (idea.recipe ?? []).some((item) => item.quantity.kind === 'unit'),
    );
    expect(withMeasure.length).toBeGreaterThanOrEqual(ideas.length - 3);
    // The example that prompted this: a toast names the bread and counts the slices.
    const toast = ideas.find((idea) => idea.id === 'cheese-toast-tomato');
    const parts = portionParts(toast?.recipe ?? [], 1, byId) ?? [];
    expect(parts.map((part) => [part.label, part.entry.unit, part.entry.count])).toEqual([
      ['לחם מחיטה מלאה', 'פרוסה בינונית', 2],
      ['גבינה צהובה 15%', 'פרוסה', 2],
      ['עגבנייה', 'יחידה קטנה', 1],
    ]);
  });

  it('scales a portion in measurable steps and stays within the calories of the scaled idea (apart from rounding)', () => {
    for (const idea of ideas) {
      for (let factor = idea.minPortionFactor; factor <= idea.maxPortionFactor; factor += 0.25) {
        const parts = portionParts(idea.recipe ?? [], factor, byId);
        expect(parts, `${idea.name} x${factor}`).not.toBeNull();
        const kcal = sumEntries((parts ?? []).map((part) => part.entry)).kcal;
        // Amounts are rounded down, so only the rounding of each ingredient's calories (under 1 kcal each)
        // can lift the total above what the engine budgeted for this factor.
        const rounding = parts?.length ?? 0;
        expect(kcal, `${idea.name} x${factor}`).toBeLessThanOrEqual(idea.kcal * factor + rounding);
        for (const part of parts ?? []) {
          if (part.entry.count !== undefined) {
            expect(part.entry.count % 0.25, `${idea.name} ${part.entry.name}`).toBe(0);
          } else {
            expect(part.entry.grams % 5, `${idea.name} ${part.entry.name}`).toBe(0);
          }
        }
      }
    }
  });

  it('offers fruit, not only vegetables: in snacks, breakfasts and main meals', () => {
    const fruit = ideas.filter((idea) => idea.tags.includes('fruit'));
    const inSlot = (slot: string) => fruit.filter((idea) => idea.slots.includes(slot as never));
    expect(inSlot('snack').length).toBeGreaterThanOrEqual(8);
    expect(inSlot('breakfast').length).toBeGreaterThanOrEqual(5);
    expect(inSlot('lunch').length).toBeGreaterThanOrEqual(3);
  });

  it('skips an idea whose food is missing instead of guessing', () => {
    const without = buildMealIdeas(db.foods.filter((f) => f.id !== '1573'));
    expect(without.find((i) => i.id === 'omelette-salad')).toBeUndefined();
    expect(without.length).toBe(ideas.length - 1);
  });
});
