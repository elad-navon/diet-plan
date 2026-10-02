/**
 * A small picture for a meal, chosen by WHAT was eaten (the first food named in the meal's name or ingredients),
 * not by the time of day. The picture is decoration only: the name is always written next to it.
 */

interface Rule {
  icon: string;
  /** Hebrew words (prefixes also match: "ביצ" matches "ביצה" and "ביצים"). */
  words: readonly string[];
}

// Order only breaks ties: the rule whose word appears EARLIEST in the text wins ("חזה עוף ואורז" -> chicken).
const RULES: readonly Rule[] = [
  { icon: '🥪', words: ['טוסט', 'סנדוויץ', 'סנדויץ', 'כריך', 'לחמני', 'בגט', 'בייגל'] },
  { icon: '🍳', words: ['חביתה', 'שקשוק', 'מקושקש', 'ביצ', 'אומלט'] },
  { icon: '🍞', words: ['לחם', 'פיתה', 'חלה', 'טורטי', 'קרקר', 'פרוסה'] },
  { icon: '🥣', words: ['שיבולת שועל', 'דייסה', 'דגני', 'גרנולה', 'מוזלי', 'קורנפלקס'] },
  { icon: '🧀', words: ['גבינה צהובה', 'גבינה', 'מוצרלה', 'פטה', 'קשקבל'] },
  { icon: '🥛', words: ['יוגורט', 'קוטג', 'חלב', 'לבן', 'שייק', 'משקה חלב'] },
  { icon: '🍗', words: ['עוף', 'שניצל', 'הודו', 'כנפיים', 'פרגית'] },
  {
    icon: '🥩',
    words: ['בקר', 'סטייק', 'קבב', 'המבורגר', 'כבש', 'שווארמה', 'נקניק', 'צלי', 'אנטריקוט'],
  },
  { icon: '🐟', words: ['דג', 'סלמון', 'טונה', 'סרדין', 'דניס', 'לברק', 'פילה', 'אמנון'] },
  { icon: '🍝', words: ['פסטה', 'אטריות', 'ספגטי', 'מקרוני', 'לזניה', 'רביולי', 'נודלס'] },
  { icon: '🍚', words: ['אורז', 'קוסקוס', 'בורגול', 'פתיתים', 'קינואה', 'סושי'] },
  { icon: '🥔', words: ['תפוח אדמה', 'תפוחי אדמה', "צ'יפס", 'פירה', 'בטטה'] },
  { icon: '🧆', words: ['פלאפל', 'סביח', 'קובה'] },
  { icon: '🫘', words: ['חומוס', 'עדשים', 'שעועית', 'אפונה', 'קטניות', 'טופו', 'פול'] },
  {
    icon: '🥗',
    words: [
      'סלט',
      'ירקות',
      'מלפפון',
      'עגבני',
      'חסה',
      'גזר',
      'ברוקולי',
      'כרוב',
      'פלפל',
      'קישוא',
      'חציל',
    ],
  },
  { icon: '🍲', words: ['מרק', 'תבשיל', 'חמין', 'קדירה'] },
  { icon: '🍕', words: ['פיצה', 'בורקס', 'מאפה'] },
  { icon: '🥑', words: ['אבוקדו', 'גואקמולי'] },
  { icon: '🍌', words: ['בננה'] },
  { icon: '🍎', words: ['תפוח עץ', 'תפוח', 'אגס'] },
  { icon: '🍊', words: ['תפוז', 'קלמנטינה', 'מנדרינה', 'אשכולית', 'לימון'] },
  { icon: '🍇', words: ['ענבים', 'צימוקים'] },
  { icon: '🍓', words: ['תות', 'פטל', 'אוכמני', 'דובדבן', 'פירות יער'] },
  { icon: '🍉', words: ['אבטיח', 'מלון'] },
  { icon: '🍑', words: ['אפרסק', 'נקטרינה', 'שזיף', 'משמש', 'מנגו'] },
  { icon: '🥝', words: ['קיווי', 'אננס'] },
  {
    icon: '🥜',
    words: ['אגוז', 'שקד', 'בוטן', 'קשיו', 'פיסטוק', 'במבה', 'טחינה', 'גרעינ', 'ממרח'],
  },
  { icon: '🍫', words: ['שוקולד', 'ממתק', 'סוכריה', 'חטיף', 'וופל'] },
  { icon: '🍰', words: ['עוגה', 'עוגת', 'מאפין', 'קראנץ', 'לביבה', 'פנקייק'] },
  { icon: '🍪', words: ['עוגיה', 'עוגיות', 'ביסקוויט'] },
  { icon: '🍦', words: ['גלידה', 'קרטיב', 'סורבה'] },
  { icon: '☕', words: ['קפה', 'אספרסו', 'נס ', 'קפוצ', 'תה'] },
  { icon: '🧃', words: ['מיץ', 'לימונדה', 'קולה', 'משקה', 'סודה', 'בירה', 'יין'] },
  { icon: '🍎', words: ['פרי', 'פירות'] },
];

/** The neutral picture when nothing is recognised (a plate), never a guess at the wrong food. */
export const DEFAULT_MEAL_ICON = '🍽️';

function earliest(text: string, words: readonly string[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const word of words) {
    const index = text.indexOf(word);
    if (index >= 0 && index < best) best = index;
  }
  return best;
}

function pick(text: string): string | null {
  let bestIndex = Number.POSITIVE_INFINITY;
  let bestIcon: string | null = null;
  for (const rule of RULES) {
    const index = earliest(text, rule.words);
    if (index < bestIndex) {
      bestIndex = index;
      bestIcon = rule.icon;
    }
  }
  return bestIcon;
}

/** The picture for a meal: by its name first, then by the names of its ingredients. */
export function mealIcon(meal: { name: string; items: readonly { name: string }[] }): string {
  return (
    pick(meal.name) ?? pick(meal.items.map((item) => item.name).join(' ')) ?? DEFAULT_MEAL_ICON
  );
}
