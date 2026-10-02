import { describe, expect, it } from 'vitest';
import { DEFAULT_MEAL_ICON, mealIcon } from './meal-icon';

const meal = (name: string, items: string[] = []) => ({
  name,
  items: items.map((item) => ({ name: item })),
});

describe('the picture next to a meal follows the food, not the time of day', () => {
  it.each([
    ['חביתה וסלט', '🍳'],
    ['שקשוקה ופיתה', '🍳'],
    ['טוסט גבינה צהובה ועגבניה', '🥪'],
    ['2 ביצים קשות, לחם מלא וירקות', '🍳'],
    ['חזה עוף אפוי, אורז וסלט', '🍗'],
    ['קבב בקר, אורז וסלט', '🥩'],
    ['סלמון, ברוקולי ואורז', '🐟'],
    ['טונה עם לחם מלא וסלט', '🐟'],
    ['פסטה עם טונה וסלט', '🍝'],
    ['אורז עם ירקות', '🍚'],
    ['יוגורט עם גרנולה ובננה', '🥛'],
    ["קוטג' עם מלפפון", '🥛'],
    ['דגני בוקר עם חלב', '🥣'],
    ['שיבולת שועל עם חלב ובננה', '🥣'],
    ['חומוס עם פיתה ומלפפון', '🫘'],
    ['פלאפל בפיתה', '🧆'],
    ['מרק עגבניות ולחם מלא', '🍲'],
    ['תפוח עץ', '🍎'],
    ['בננה', '🍌'],
    ['ענבים', '🍇'],
    ['תותים', '🍓'],
    ['אבטיח', '🍉'],
    ['קיווי', '🥝'],
    ['חופן שקדים', '🥜'],
    ['במבה', '🥜'],
    ['קפה ועוגה', '☕'],
    ['פיצה', '🍕'],
  ])('%s -> %s', (name, icon) => {
    expect(mealIcon(meal(name))).toBe(icon);
  });

  it('uses the first food named, so the main item decides', () => {
    expect(mealIcon(meal('עוף ואורז'))).toBe('🍗');
    expect(mealIcon(meal('אורז ועוף'))).toBe('🍚');
  });

  it('falls back to the ingredients when the name says nothing, then to a plain plate', () => {
    expect(mealIcon(meal('ארוחת צהריים', ['דג סלמון מטוגן']))).toBe('🐟');
    expect(mealIcon(meal('ארוחה'))).toBe(DEFAULT_MEAL_ICON);
    expect(mealIcon(meal('משהו', ['xyz']))).toBe(DEFAULT_MEAL_ICON);
  });

  it('is not fooled by words that merely start the same: "דגני בוקר" is cereal, not fish', () => {
    expect(mealIcon(meal('דגני בוקר'))).toBe('🥣');
    expect(mealIcon(meal('דג בתנור'))).toBe('🐟');
  });
});
