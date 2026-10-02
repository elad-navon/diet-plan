import { type MealCandidate, type RecipeItem } from '../recommend';
import { type SlotId } from '../schedule';
import { computeEntry, sumEntries, type FoodEntry, type Quantity } from './compute';
import { type FoodRecord } from './types';

/**
 * Meal ideas the recommendation engine can suggest. Each idea is a short list of real foods with
 * amounts in household measures (slices, spoons, cups) where the database has them, so its calories and
 * macros come from the national database instead of being guessed, and the person sees exactly what to
 * put on the plate. The list is reviewed by the app owner; a test checks every food exists and totals
 * are believable.
 */

/** Grams, or a count of one of the food's measures (`step` = the smallest change when the portion scales). */
type IdeaQuantity = number | { unit: string; count: number; step?: number };

interface IdeaDefinition {
  id: string;
  name: string;
  slots: readonly SlotId[];
  tags: readonly string[];
  /** Database food id, amount and (optionally) the name to show. */
  items: readonly (readonly [foodId: string, quantity: IdeaQuantity, label?: string])[];
  /** Portion range for scaling to the remaining budget. Defaults to 0.5-1.5. */
  portion?: readonly [min: number, max: number];
}

const MAIN: readonly SlotId[] = ['lunch', 'dinner'];

/** Countable items (eggs, walnuts, slices of cheese) only come in whole numbers. */
const whole = (unit: string, count: number): IdeaQuantity => ({ unit, count, step: 1 });
/** A single piece (an apple, a slice of bread, a pita) can be halved but not cut finer. */
const half = (unit: string, count: number): IdeaQuantity => ({ unit, count, step: 0.5 });
const measure = (unit: string, count: number): IdeaQuantity => ({ unit, count });

export const MEAL_IDEAS: readonly IdeaDefinition[] = [
  // --- בוקר
  {
    id: 'eggs-bread-veg',
    name: '2 ביצים קשות, לחם מלא וירקות',
    slots: ['breakfast'],
    tags: ['vegetarian'],
    items: [
      ['1564', whole('יחידה', 2), 'ביצה קשה'],
      ['1995', half('פרוסה עבה', 1), 'לחם מחיטה מלאה'],
      ['3663', measure('יחידה קטנה', 1), 'עגבנייה'],
      ['3793', measure('יחידה בינונית', 1), 'מלפפון'],
    ],
  },
  {
    id: 'omelette-salad',
    name: 'חביתה משתי ביצים וסלט',
    slots: ['breakfast'],
    tags: ['vegetarian'],
    items: [
      ['1573', 110, 'חביתה (משתי ביצים)'],
      ['3895', measure('מנה גדולה', 1), 'סלט ירקות'],
    ],
  },
  {
    id: 'cottage-bread-cucumber',
    name: "קוטג' 5% עם לחם מלא ומלפפון",
    slots: ['breakfast'],
    tags: ['vegetarian', 'dairy'],
    items: [
      ['494', whole('כף', 3), "קוטג' 5%"],
      ['1995', whole('פרוסה דקה', 2), 'לחם מחיטה מלאה'],
      ['3793', measure('יחידה בינונית', 1), 'מלפפון'],
    ],
  },
  {
    id: 'yogurt-granola-banana',
    name: 'יוגורט עם גרנולה ובננה',
    slots: ['breakfast'],
    tags: ['vegetarian', 'dairy', 'fruit'],
    items: [
      ['62', measure('גביע', 1), 'יוגורט 3%'],
      ['2849', measure('מנה קטנה', 1), 'גרנולה'],
      ['3225', half('יחידה גדולה', 1), 'בננה'],
    ],
  },
  {
    id: 'oats-milk-banana',
    name: 'שיבולת שועל עם חלב ובננה',
    slots: ['breakfast'],
    tags: ['vegetarian', 'dairy', 'fruit'],
    items: [
      ['2710', measure('כוס', 2), 'שיבולת שועל מבושלת'],
      ['15', measure('כוס', 0.5), 'חלב 3%'],
      ['3225', half('יחידה בינונית', 1), 'בננה'],
    ],
  },
  {
    id: 'shakshuka-pita',
    name: 'שקשוקה ופיתה',
    slots: ['breakfast', 'dinner'],
    tags: ['vegetarian'],
    items: [
      ['1591', measure('מנה בינונית', 1), 'שקשוקה'],
      ['1955', measure('יחידה', 0.5), 'פיתה'],
    ],
  },
  {
    id: 'cheese-toast-tomato',
    name: 'טוסט גבינה צהובה ועגבניה',
    slots: ['breakfast'],
    tags: ['vegetarian', 'dairy'],
    items: [
      ['1995', whole('פרוסה בינונית', 2), 'לחם מחיטה מלאה'],
      ['8609', whole('פרוסה', 2), 'גבינה צהובה 15%'],
      ['3663', measure('יחידה קטנה', 1), 'עגבנייה'],
    ],
  },
  {
    id: 'yogurt-strawberries-granola',
    name: 'יוגורט עם תותים וגרנולה',
    slots: ['breakfast'],
    tags: ['vegetarian', 'dairy', 'fruit'],
    items: [
      ['62', measure('גביע', 1), 'יוגורט 3%'],
      ['2849', measure('מנה קטנה', 1), 'גרנולה'],
      ['3339', measure('כוס', 1), 'תות שדה'],
    ],
  },
  {
    id: 'cottage-bread-peach',
    name: "קוטג' עם לחם מלא ואפרסק",
    slots: ['breakfast'],
    tags: ['vegetarian', 'dairy', 'fruit'],
    items: [
      ['494', whole('כף', 3), "קוטג' 5%"],
      ['1995', whole('פרוסה בינונית', 2), 'לחם מחיטה מלאה'],
      ['3276', half('יחידה בינונית', 1), 'אפרסק'],
    ],
  },
  {
    id: 'oats-apple',
    name: 'שיבולת שועל עם חלב ותפוח',
    slots: ['breakfast'],
    tags: ['vegetarian', 'dairy', 'fruit'],
    items: [
      ['2710', measure('כוס', 2), 'שיבולת שועל מבושלת'],
      ['15', measure('כוס', 0.5), 'חלב 3%'],
      ['3201', half('יחידה בינונית', 1), 'תפוח עץ'],
    ],
  },
  {
    id: 'eggs-bread-clementines',
    name: '2 ביצים קשות, לחם מלא וקלמנטינות',
    slots: ['breakfast'],
    tags: ['vegetarian', 'fruit'],
    items: [
      ['1564', whole('יחידה', 2), 'ביצה קשה'],
      ['1995', half('פרוסה עבה', 1), 'לחם מחיטה מלאה'],
      ['3127', whole('יחידה בינונית', 2), 'קלמנטינה'],
    ],
  },
  {
    id: 'fruit-yogurt-bowl',
    name: 'קערת יוגורט עם פירות וגרנולה',
    slots: ['breakfast', 'dinner'],
    tags: ['vegetarian', 'dairy', 'fruit'],
    items: [
      ['62', measure('גביע', 1), 'יוגורט 3%'],
      ['2849', measure('מנה קטנה', 1), 'גרנולה'],
      ['3255', half('יחידה בינונית', 1), 'קיווי'],
      ['3339', measure('כוס', 0.5), 'תות שדה'],
    ],
  },

  // --- צהריים וערב
  {
    id: 'chicken-rice-salad',
    name: 'חזה עוף אפוי, אורז וסלט',
    slots: MAIN,
    tags: ['meat'],
    items: [
      ['811', 120, 'חזה עוף אפוי'],
      ['2721', measure('כוס', 1), 'אורז מבושל'],
      ['3895', measure('מנה גדולה', 1), 'סלט ירקות'],
    ],
  },
  {
    id: 'chicken-rice-salad-apple',
    name: 'חזה עוף אפוי, אורז, סלט ותפוח',
    slots: MAIN,
    tags: ['meat', 'fruit'],
    items: [
      ['811', 120, 'חזה עוף אפוי'],
      ['2721', measure('כוס', 1), 'אורז מבושל'],
      ['3895', measure('מנה גדולה', 1), 'סלט ירקות'],
      ['3201', half('יחידה בינונית', 1), 'תפוח עץ'],
    ],
  },
  {
    id: 'schnitzel-potatoes-salad',
    name: 'שניצל אפוי, תפוחי אדמה מבושלים וסלט',
    slots: MAIN,
    tags: ['meat'],
    items: [
      ['9755', 120, 'שניצל חזה עוף אפוי'],
      ['3464', 150, 'תפוחי אדמה מבושלים'],
      ['3895', measure('מנה בינונית', 1), 'סלט ירקות'],
    ],
  },
  {
    id: 'pasta-tuna-salad',
    name: 'פסטה עם טונה וסלט',
    slots: MAIN,
    tags: ['fish'],
    items: [
      ['8552', measure('מנה בינונית', 1), 'פסטה מבושלת'],
      ['1360', whole('כף', 3), 'טונה במים'],
      ['9704', measure('מנה גדולה', 1), 'סלט ירקות'],
    ],
  },
  {
    id: 'tuna-bread-salad',
    name: 'טונה עם לחם מלא וסלט',
    slots: MAIN,
    tags: ['fish'],
    items: [
      ['1360', half('אריזה אישית', 1), 'טונה במים'],
      ['1995', whole('פרוסה בינונית', 2), 'לחם מחיטה מלאה'],
      ['3895', measure('מנה גדולה', 1), 'סלט ירקות'],
    ],
  },
  {
    id: 'tuna-bread-salad-nectarine',
    name: 'טונה עם לחם מלא, סלט ונקטרינה',
    slots: MAIN,
    tags: ['fish', 'fruit'],
    items: [
      ['1360', half('אריזה אישית', 1), 'טונה במים'],
      ['1995', whole('פרוסה בינונית', 2), 'לחם מחיטה מלאה'],
      ['3895', measure('מנה גדולה', 1), 'סלט ירקות'],
      ['3269', half('יחידה בינונית', 1), 'נקטרינה'],
    ],
  },
  {
    id: 'hummus-pita-cucumber',
    name: 'חומוס עם פיתה ומלפפון',
    slots: MAIN,
    tags: ['vegetarian'],
    items: [
      ['1640', whole('כף', 3), 'סלט חומוס'],
      ['1955', half('יחידה', 1), 'פיתה'],
      ['3793', measure('יחידה קטנה', 1), 'מלפפון'],
    ],
  },
  {
    id: 'hummus-pita-pear',
    name: 'חומוס עם פיתה, מלפפון ואגס',
    slots: MAIN,
    tags: ['vegetarian', 'fruit'],
    items: [
      ['1640', whole('כף', 3), 'סלט חומוס'],
      ['1955', half('יחידה', 1), 'פיתה'],
      ['3793', measure('יחידה קטנה', 1), 'מלפפון'],
      ['3283', half('יחידה בינונית', 1), 'אגס'],
    ],
  },
  {
    id: 'steak-potatoes-salad',
    name: 'סטייק בקר, תפוחי אדמה וסלט',
    slots: MAIN,
    tags: ['meat'],
    items: [
      ['615', half('יחידה בינונית', 1), 'סטייק בקר'],
      ['3464', measure('מנה בינונית', 1), 'תפוחי אדמה מבושלים'],
      ['3895', measure('מנה בינונית', 1), 'סלט ירקות'],
    ],
  },
  {
    id: 'kebab-rice-salad',
    name: 'קבב בקר, אורז וסלט',
    slots: MAIN,
    tags: ['meat'],
    items: [
      ['667', half('יחידה גדולה', 1), 'קבב בקר'],
      ['2721', measure('כוס', 1), 'אורז מבושל'],
      ['3895', measure('מנה בינונית', 1), 'סלט ירקות'],
    ],
  },
  {
    id: 'falafel-pita',
    name: 'פלאפל בפיתה',
    slots: MAIN,
    tags: ['vegetarian'],
    items: [['10052', 250, 'פלאפל בפיתה']],
  },
  {
    id: 'shawarma-pita',
    name: 'שווארמה בפיתה',
    slots: MAIN,
    tags: ['meat'],
    items: [['10023', 250, 'שווארמה בפיתה']],
  },
  {
    id: 'salmon-veg-rice',
    name: 'סלמון, ברוקולי ואורז',
    slots: MAIN,
    tags: ['fish'],
    items: [
      ['1202', measure('מנה בינונית', 1), 'סלמון'],
      ['3612', measure('כוס', 1.5), 'ברוקולי'],
      ['2721', measure('כוס', 0.75), 'אורז מבושל'],
    ],
  },
  {
    id: 'tofu-rice-veg',
    name: 'טופו, אורז וברוקולי',
    slots: MAIN,
    tags: ['vegetarian'],
    items: [
      ['10141', whole('פרוסה בינונית', 4), 'טופו'],
      ['2721', measure('כוס', 1), 'אורז מבושל'],
      ['3612', measure('כוס', 1), 'ברוקולי'],
    ],
  },
  {
    id: 'tomato-soup-bread',
    name: 'מרק עגבניות ולחם מלא',
    slots: MAIN,
    tags: ['vegetarian'],
    items: [
      ['9320', measure('מנה בינונית', 1), 'מרק עגבניות'],
      ['1995', whole('פרוסה בינונית', 2), 'לחם מחיטה מלאה'],
    ],
  },
  {
    id: 'couscous-chicken-salad',
    name: 'קוסקוס עם עוף וסלט',
    slots: MAIN,
    tags: ['meat'],
    items: [
      ['10127', measure('מנה בינונית', 1.5), 'קוסקוס מבושל'],
      ['811', 100, 'חזה עוף אפוי'],
      ['3895', measure('מנה בינונית', 1), 'סלט ירקות'],
    ],
  },

  // --- ביניים
  {
    id: 'apple',
    name: 'תפוח עץ',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3201', half('יחידה גדולה', 1), 'תפוח עץ']],
    portion: [0.5, 2],
  },
  {
    id: 'banana',
    name: 'בננה',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3225', half('יחידה גדולה', 1), 'בננה']],
    portion: [0.5, 2],
  },
  {
    id: 'orange',
    name: 'תפוז',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3120', half('יחידה בינונית', 1), 'תפוז']],
    portion: [0.5, 2],
  },
  {
    id: 'watermelon',
    name: 'אבטיח',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3322', measure('פרוסה בינונית', 1.5), 'אבטיח']],
    portion: [0.5, 2],
  },
  {
    id: 'grapes',
    name: 'ענבים',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3250', measure('כוס', 1), 'ענבים']],
    portion: [0.5, 2],
  },
  {
    id: 'pear',
    name: 'אגס',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3283', half('יחידה בינונית', 1), 'אגס']],
    portion: [1, 2],
  },
  {
    id: 'peach',
    name: 'אפרסק',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3276', half('יחידה גדולה', 1), 'אפרסק']],
    portion: [1, 2],
  },
  {
    id: 'strawberries',
    name: 'תותים',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3339', measure('כוס', 2), 'תות שדה']],
    portion: [0.5, 2],
  },
  {
    id: 'clementines',
    name: 'קלמנטינות',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3127', whole('יחידה בינונית', 2), 'קלמנטינה']],
    portion: [0.5, 2],
  },
  {
    id: 'melon',
    name: 'מלון',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3228', measure('כוס קוביות', 2), 'מלון כתום']],
    portion: [0.5, 2],
  },
  {
    id: 'kiwi',
    name: 'קיווי',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3255', whole('יחידה בינונית', 2), 'קיווי']],
    portion: [0.5, 2],
  },
  {
    id: 'plums',
    name: 'שזיפים',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [['3301', whole('יחידה בינונית', 3), 'שזיף']],
    portion: [0.5, 2],
  },
  {
    id: 'yogurt',
    name: 'יוגורט 3%',
    slots: ['snack'],
    tags: ['vegetarian', 'dairy'],
    items: [['62', measure('גביע', 1), 'יוגורט 3%']],
  },
  {
    id: 'yogurt-peach',
    name: 'יוגורט עם אפרסק',
    slots: ['snack'],
    tags: ['vegetarian', 'dairy', 'fruit'],
    items: [
      ['62', measure('גביע', 1), 'יוגורט 3%'],
      ['3276', half('יחידה בינונית', 1), 'אפרסק'],
    ],
  },
  {
    id: 'cottage-cucumber',
    name: "קוטג' עם מלפפון",
    slots: ['snack'],
    tags: ['vegetarian', 'dairy'],
    items: [
      ['494', whole('כף', 3), "קוטג' 5%"],
      ['3793', measure('יחידה בינונית', 1), 'מלפפון'],
    ],
  },
  {
    id: 'bread-white-cheese',
    name: 'פרוסת לחם מלא עם גבינה לבנה',
    slots: ['snack'],
    tags: ['vegetarian', 'dairy'],
    items: [
      ['1995', half('פרוסה עבה', 1), 'לחם מחיטה מלאה'],
      ['8595', half('כף', 1), 'גבינה לבנה 3%'],
    ],
  },
  {
    id: 'veg-hummus',
    name: 'גזר וחומוס',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [
      ['3627', measure('יחידה בינונית', 1.5), 'גזר'],
      ['1640', measure('כף', 1.5), 'סלט חומוס'],
    ],
  },
  {
    id: 'boiled-egg',
    name: 'ביצה קשה',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [['1564', half('יחידה', 1), 'ביצה קשה']],
    portion: [1, 2],
  },
  {
    id: 'walnuts',
    name: 'חופן אגוזי מלך',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [['1854', whole('יחידה', 5), 'אגוזי מלך']],
  },
  {
    id: 'almonds',
    name: 'חופן שקדים',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [['1822', whole('יחידה', 16), 'שקדים']],
  },
  {
    id: 'dates-almonds',
    name: 'תמרים ושקדים',
    slots: ['snack'],
    tags: ['vegetarian', 'fruit'],
    items: [
      ['3178', whole('יחידה', 3), 'תמר'],
      ['1822', whole('יחידה', 10), 'שקדים'],
    ],
  },
  {
    id: 'bamba',
    name: 'במבה',
    slots: ['snack'],
    tags: ['vegetarian'],
    items: [['2581', measure('שקית', 1), 'במבה']],
  },
];

const ROUND_GRAMS = 5;
const EPSILON = 1e-9;

/** One ingredient of a portion: its food entry (amounts and nutrients) and the name to show. */
export interface PortionPart {
  label: string | null;
  entry: FoodEntry;
}

/**
 * The ingredients of an idea at a portion factor, in amounts a person can actually measure: counts of the
 * food's own measure move in `step`s and grams in 5s. Amounts are rounded DOWN, so a scaled portion stays
 * within the calories the engine budgeted for it (to the rounding of a calorie per ingredient). Null when a
 * food is missing.
 */
export function portionParts(
  recipe: readonly RecipeItem[],
  factor: number,
  foods: ReadonlyMap<string, FoodRecord>,
): PortionPart[] | null {
  const parts: PortionPart[] = [];
  for (const item of recipe) {
    const food = foods.get(item.foodId);
    if (!food) return null;
    const { quantity } = item;
    const asked: Quantity =
      quantity.kind === 'grams'
        ? {
            kind: 'grams',
            grams: Math.max(
              ROUND_GRAMS,
              Math.floor((quantity.grams * factor) / ROUND_GRAMS + EPSILON) * ROUND_GRAMS,
            ),
          }
        : {
            kind: 'unit',
            unit: quantity.unit,
            count: Math.max(
              quantity.step,
              Math.floor((quantity.count * factor) / quantity.step + EPSILON) * quantity.step,
            ),
          };
    const result = computeEntry(food, asked);
    if (!result.ok) return null;
    parts.push({ label: item.label ?? null, entry: result.entry });
  }
  return parts;
}

/** Turns the idea definitions into candidates with values computed from the database. Unknown foods skip the idea. */
export function buildMealIdeas(foods: readonly FoodRecord[]): MealCandidate[] {
  const byId = new Map(foods.map((food) => [food.id, food]));
  const candidates: MealCandidate[] = [];

  for (const idea of MEAL_IDEAS) {
    const recipe: RecipeItem[] = idea.items.map(([foodId, quantity, label]) => ({
      foodId,
      quantity:
        typeof quantity === 'number'
          ? { kind: 'grams', grams: quantity }
          : {
              kind: 'unit',
              unit: quantity.unit,
              count: quantity.count,
              step: quantity.step ?? 0.25,
            },
      ...(label !== undefined ? { label } : {}),
    }));
    const parts = portionParts(recipe, 1, byId);
    if (!parts) continue;

    // Never offer a portion so small that an ingredient would drop below one step (half a slice, one egg).
    const smallestFactor = Math.max(
      idea.portion?.[0] ?? 0.5,
      ...recipe.map((item) =>
        item.quantity.kind === 'unit' ? item.quantity.step / item.quantity.count : 0,
      ),
    );
    const minPortionFactor = Math.ceil(smallestFactor / 0.25 - 1e-9) * 0.25;
    const totals = sumEntries(parts.map((part) => part.entry));
    candidates.push({
      id: idea.id,
      name: idea.name,
      slots: idea.slots,
      kcal: totals.kcal,
      proteinG: totals.proteinG,
      carbsG: totals.carbsG,
      fatG: totals.fatG,
      tags: idea.tags,
      minPortionFactor,
      maxPortionFactor: idea.portion?.[1] ?? 1.5,
      recipe,
    });
  }
  return candidates;
}
