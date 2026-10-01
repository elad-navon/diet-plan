import { type MealCandidate } from '../recommend';
import { type SlotId } from '../schedule';
import { computeEntry, sumEntries } from './compute';
import { type FoodRecord } from './types';

/**
 * Meal ideas the recommendation engine can suggest. Each idea is a short list of real foods with
 * weights, so its calories and macros come from the national database instead of being guessed.
 * The list is reviewed by the app owner; a test checks every food exists and totals are believable.
 */
interface IdeaDefinition {
  id: string;
  name: string;
  slots: readonly SlotId[];
  tags: readonly string[];
  /** Database food id and grams. */
  items: readonly (readonly [foodId: string, grams: number])[];
  /** Portion range for scaling to the remaining budget. Defaults to 0.5-1.5. */
  portion?: readonly [min: number, max: number];
}

const MAIN: readonly SlotId[] = ['lunch', 'dinner'];

export const MEAL_IDEAS: readonly IdeaDefinition[] = [
  // --- בוקר
  {
    id: 'eggs-bread-veg',
    name: '2 ביצים קשות, לחם מלא וירקות',
    slots: ['breakfast'],
    tags: ['vegetarian'],
    items: [
      ['1564', 100],
      ['1995', 40],
      ['3663', 80],
      ['3793', 80],
    ],
  },
  {
    id: 'omelette-salad',
    name: 'חביתה משתי ביצים וסלט',
    slots: ['breakfast'],
    tags: ['vegetarian'],
    items: [
      ['1573', 110],
      ['3895', 150],
    ],
  },
  {
    id: 'cottage-bread-cucumber',
    name: "קוטג' 5% עם לחם מלא ומלפפון",
    slots: ['breakfast'],
    tags: ['vegetarian', 'dairy'],
    items: [
      ['494', 125],
      ['1995', 50],
      ['3793', 100],
    ],
  },
  {
    id: 'yogurt-granola-banana',
    name: 'יוגורט עם גרנולה ובננה',
    slots: ['breakfast'],
    tags: ['vegetarian', 'dairy'],
    items: [
      ['62', 150],
      ['2849', 30],
      ['3225', 100],
    ],
  },
  {
    id: 'oats-milk-banana',
    name: 'שיבולת שועל עם חלב ובננה',
    slots: ['breakfast'],
    tags: ['vegetarian', 'dairy'],
    items: [
      ['2710', 200],
      ['15', 150],
      ['3225', 80],
    ],
  },
  {
    id: 'shakshuka-pita',
    name: 'שקשוקה ופיתה',
    slots: ['breakfast', 'dinner'],
    tags: ['vegetarian'],
    items: [
      ['1591', 200],
      ['1955', 50],
    ],
  },
  {
    id: 'cheese-toast-tomato',
    name: 'טוסט גבינה צהובה ועגבניה',
    slots: ['breakfast'],
    tags: ['vegetarian', 'dairy'],
    items: [
      ['1995', 60],
      ['8609', 40],
      ['3663', 80],
    ],
  },

  // --- צהריים וערב
  {
    id: 'chicken-rice-salad',
    name: 'חזה עוף אפוי, אורז וסלט',
    slots: MAIN,
    tags: ['meat'],
    items: [
      ['811', 120],
      ['2721', 150],
      ['3895', 150],
    ],
  },
  {
    id: 'schnitzel-potatoes-salad',
    name: 'שניצל אפוי, תפוחי אדמה מבושלים וסלט',
    slots: MAIN,
    tags: ['meat'],
    items: [
      ['9755', 120],
      ['3464', 150],
      ['3895', 100],
    ],
  },
  {
    id: 'pasta-tuna-salad',
    name: 'פסטה עם טונה וסלט',
    slots: MAIN,
    tags: ['fish'],
    items: [
      ['8552', 180],
      ['1360', 60],
      ['9704', 150],
    ],
  },
  {
    id: 'tuna-bread-salad',
    name: 'טונה עם לחם מלא וסלט',
    slots: MAIN,
    tags: ['fish'],
    items: [
      ['1360', 100],
      ['1995', 60],
      ['3895', 150],
    ],
  },
  {
    id: 'hummus-pita-cucumber',
    name: 'חומוס עם פיתה ומלפפון',
    slots: MAIN,
    tags: ['vegetarian'],
    items: [
      ['1640', 120],
      ['1955', 80],
      ['3793', 60],
    ],
  },
  {
    id: 'steak-potatoes-salad',
    name: 'סטייק בקר, תפוחי אדמה וסלט',
    slots: MAIN,
    tags: ['meat'],
    items: [
      ['615', 150],
      ['3464', 200],
      ['3895', 100],
    ],
  },
  {
    id: 'kebab-rice-salad',
    name: 'קבב בקר, אורז וסלט',
    slots: MAIN,
    tags: ['meat'],
    items: [
      ['667', 120],
      ['2721', 150],
      ['3895', 100],
    ],
  },
  {
    id: 'falafel-pita',
    name: 'פלאפל בפיתה',
    slots: MAIN,
    tags: ['vegetarian'],
    items: [['10052', 250]],
  },
  {
    id: 'shawarma-pita',
    name: 'שווארמה בפיתה',
    slots: MAIN,
    tags: ['meat'],
    items: [['10023', 250]],
  },
  {
    id: 'salmon-veg-rice',
    name: 'סלמון, ברוקולי ואורז',
    slots: MAIN,
    tags: ['fish'],
    items: [
      ['1202', 150],
      ['3612', 150],
      ['2721', 120],
    ],
  },
  {
    id: 'tofu-rice-veg',
    name: 'טופו, אורז וברוקולי',
    slots: MAIN,
    tags: ['vegetarian'],
    items: [
      ['10141', 120],
      ['2721', 150],
      ['3612', 100],
    ],
  },
  {
    id: 'tomato-soup-bread',
    name: 'מרק עגבניות ולחם מלא',
    slots: MAIN,
    tags: ['vegetarian'],
    items: [
      ['9320', 300],
      ['1995', 50],
    ],
  },
  {
    id: 'couscous-chicken-salad',
    name: 'קוסקוס עם עוף וסלט',
    slots: MAIN,
    tags: ['meat'],
    items: [
      ['10127', 150],
      ['811', 100],
      ['3895', 100],
    ],
  },

  // --- ביניים
  {
    id: 'apple',
    name: 'תפוח עץ',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [['3201', 180]],
    portion: [0.5, 2],
  },
  {
    id: 'banana',
    name: 'בננה',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [['3225', 120]],
    portion: [0.5, 2],
  },
  {
    id: 'orange',
    name: 'תפוז',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [['3120', 200]],
    portion: [0.5, 2],
  },
  {
    id: 'watermelon',
    name: 'אבטיח',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [['3322', 300]],
    portion: [0.5, 2],
  },
  {
    id: 'yogurt',
    name: 'יוגורט 3%',
    slots: ['snack'],
    tags: ['vegetarian', 'dairy'],
    items: [['62', 150]],
  },
  {
    id: 'cottage-cucumber',
    name: "קוטג' עם מלפפון",
    slots: ['snack'],
    tags: ['vegetarian', 'dairy'],
    items: [
      ['494', 125],
      ['3793', 100],
    ],
  },
  {
    id: 'bread-white-cheese',
    name: 'פרוסת לחם מלא עם גבינה לבנה',
    slots: ['snack'],
    tags: ['vegetarian', 'dairy'],
    items: [
      ['1995', 40],
      ['8595', 40],
    ],
  },
  {
    id: 'veg-hummus',
    name: 'גזר וחומוס',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [
      ['3627', 100],
      ['1640', 60],
    ],
  },
  {
    id: 'boiled-egg',
    name: 'ביצה קשה',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [['1564', 55]],
    portion: [1, 2],
  },
  {
    id: 'walnuts',
    name: 'חופן אגוזי מלך',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [['1854', 30]],
  },
  {
    id: 'almonds',
    name: 'חופן שקדים',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [['1822', 25]],
  },
  { id: 'bamba', name: 'במבה', slots: ['snack'], tags: ['vegetarian'], items: [['2581', 25]] },
];

/** Turns the idea definitions into candidates with values computed from the database. Unknown foods skip the idea. */
export function buildMealIdeas(foods: readonly FoodRecord[]): MealCandidate[] {
  const byId = new Map(foods.map((food) => [food.id, food]));
  const candidates: MealCandidate[] = [];

  for (const idea of MEAL_IDEAS) {
    const entries = [];
    for (const [foodId, grams] of idea.items) {
      const food = byId.get(foodId);
      const result = food && computeEntry(food, { kind: 'grams', grams });
      if (!result?.ok) break;
      entries.push(result.entry);
    }
    if (entries.length !== idea.items.length) continue;

    const totals = sumEntries(entries);
    candidates.push({
      id: idea.id,
      name: idea.name,
      slots: idea.slots,
      kcal: totals.kcal,
      proteinG: totals.proteinG,
      carbsG: totals.carbsG,
      fatG: totals.fatG,
      tags: idea.tags,
      minPortionFactor: idea.portion?.[0] ?? 0.5,
      maxPortionFactor: idea.portion?.[1] ?? 1.5,
    });
  }
  return candidates;
}
