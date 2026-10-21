/**
 * Reads the values of a nutrition label from its TEXT: what Google Lens "copy text" gives for a photo, or what is
 * copied from a shop's web page. Pure: the same text always gives the same reading.
 *
 * Lens reads the table column by column, so a row's name and its number are often not next to each other ("אנרגיה",
 * "סך השומנים", "225", "4"...). The names and the numbers still come in the same order, top to bottom. So the
 * names of the table's rows are listed in order, the numbers in order, and the first name gets the first number.
 * That only works when every row is recognised (a row nobody reads, e.g. iron, still takes a number), so rows the
 * app does not use are recognised too. When there are fewer numbers than rows, nothing is guessed.
 *
 * A reading is never "confirmed": a value can be read wrong in a way no check catches. The person compares the
 * fields with the label before saving (checkLabelValues only points at values worth a second look).
 */

/** The values a product needs, per 100 g (or 100 ml). */
export type LabelField = 'kcal' | 'protein' | 'carbs' | 'sugar' | 'fat' | 'fiber' | 'addedSugar';

/** Every kind of row a label table can have: the used ones, and the others that still take a number. */
type RowKind =
  | LabelField
  | 'saturated'
  | 'trans'
  | 'otherFat'
  | 'cholesterol'
  | 'sodium'
  | 'teaspoons'
  | 'polyols'
  | 'other';

export type LabelIssue =
  /** No table heading ("סימון תזונתי...") was found: the values may not be per 100. */
  | 'no_header'
  /** Fewer numbers than rows: the numbers cannot be matched to the rows, so none was filled. */
  | 'count_mismatch'
  /** Nothing that looks like a nutrition table. */
  | 'no_rows'
  /** The heading speaks of a serving, not of 100 g / 100 ml. */
  | 'per_serving';

export interface LabelReading {
  values: Partial<Record<LabelField, number>>;
  /** Fields worth a second look (read as "less than", or missing although the label usually has them). */
  doubtful: LabelField[];
  /** What the values are for: 100 g, 100 ml, or not said. */
  basis: 'g' | 'ml' | null;
  /** Sugar alcohols (רב-כהליים), when listed: they explain calories that seem low for the carbohydrate. */
  polyols: number | null;
  /** A serving the label names ("מנה = 24 גרם", "6 X 24 גרם"), offered as a unit. */
  servingGrams: number | null;
  issues: LabelIssue[];
}

const HEADER = /סימון\s*תזונתי|ערכים\s*תזונתיים|ערך\s*תזונתי|ערכי\s*תזונה/;
/** "ב-100 גרם" / "100 מ\"ל" on its own line, right after the heading (Lens sometimes splits the heading). */
const PER_100_LINE =
  /^[\s:]*(?:ב|ל|עבור)?[-\s]*100\s*(?:גרם|גר|ג['׳]?|מ["״'׳]?ל|מל|ml|g)(?![A-Za-z])/i;
/** A line that is only an amount ("137", "6.2 ג'"): the first value of a table whose numbers come first. */
const ONLY_NUMBER = /^\s*<?\s*\d+(?:[.,]\d+)?\s*(?:גרם|ג['׳]?|קק["״]?ל)?\s*$/;
const PER_100_ML = /100\s*(?:מ["״'׳]{0,2}ל|מל\b|ml\b)/i;
const PER_100_G = /100\s*(?:גרם|גר|ג['׳]|g\b)/i;
const PER_SERVING = /למנה|במנה|ליחידה|לפרוסה/;

/** The kind of row a line names, or null when it names none. The order matters: the specific names first. */
function rowKind(line: string): RowKind | null {
  const text = line.replace(/[‎‏]/g, '');
  if (/כפיות/.test(text)) return 'teaspoons';
  if (/רווי/.test(text)) return 'saturated';
  if (/טראנס|טרנס/.test(text)) return 'trans';
  if (/חומצות\s*שומן|בלתי\s*רוו/.test(text)) return 'otherFat';
  if (/כולסטרול/.test(text)) return 'cholesterol';
  if (/נתרן/.test(text)) return 'sodium';
  if (/כה[ו]?ליים|כוהליים|פוליאול/.test(text)) return 'polyols';
  if (/אנרגי/.test(text)) return 'kcal';
  if (/פחמימ/.test(text)) return 'carbs';
  if (/סוכר/.test(text) && /מוס[פף]|תוספת/.test(text)) return 'addedSugar';
  if (/סוכרים/.test(text)) return 'sugar';
  if (/סיבים/.test(text)) return 'fiber';
  if (/חלבונ/.test(text)) return 'protein';
  if (/שומנים/.test(text)) return 'fat';
  if (/ברזל|סידן|אשלגן|ויטמין|מגנזיום|אבץ|זרחן|חומצה\s*פולית|עמילן|לקטוז|כלוריד|יוד/.test(text)) {
    return 'other';
  }
  return null;
}

interface FoundNumber {
  value: number;
  /** Written as "פחות מ-0.5" / "<0.5": the real value is below it. */
  lessThan: boolean;
}

/** The numbers in a line, leaving out percentages (a share of the daily value, not an amount). */
function numbersIn(line: string): FoundNumber[] {
  const text = line
    .replace(/[‎‏]/g, '')
    // Codes, not amounts: E330, E-472e, B12.
    .replace(/[A-Za-z]+-?\d+[a-z]?/g, ' ')
    .replace(/\d+(?:[.,]\d+)?\s*%/g, ' ')
    .replace(/%\s*\d+(?:[.,]\d+)?/g, ' ');
  const lessThan = /פחות\s*מ|<|קטן\s*מ/.test(text);
  const found: FoundNumber[] = [];
  for (const match of text.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const value = Number(match[0].replace(',', '.'));
    if (Number.isFinite(value)) found.push({ value, lessThan });
  }
  return found;
}

const SERVING = [
  /(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(?:גרם|גר|ג['׳])/,
  /(?:גודל\s*)?מנה\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(?:גרם|גר|ג['׳])/,
];

function servingGrams(text: string): number | null {
  const multiplied = SERVING[0]?.exec(text);
  if (multiplied?.[2]) return Number(multiplied[2].replace(',', '.'));
  const serving = SERVING[1]?.exec(text);
  return serving?.[1] ? Number(serving[1].replace(',', '.')) : null;
}

const USED: readonly LabelField[] = [
  'kcal',
  'protein',
  'carbs',
  'sugar',
  'fat',
  'fiber',
  'addedSugar',
];
const isUsed = (kind: RowKind): kind is LabelField => (USED as readonly string[]).includes(kind);

export function parseLabel(text: string): LabelReading {
  const lines = text
    .split(/\r?\n|\t/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const issues: LabelIssue[] = [];

  // The table starts after its heading; without one, at the first row name (and a number just before it).
  let start = lines.findIndex((line) => HEADER.test(line));
  let heading = '';
  if (start >= 0) {
    heading = lines[start] ?? '';
    start += 1;
    while (
      start < lines.length &&
      PER_100_LINE.test(lines[start] ?? '') &&
      !rowKind(lines[start] ?? '')
    ) {
      heading += ` ${lines[start] ?? ''}`;
      start += 1;
    }
  } else {
    issues.push('no_header');
    const firstRow = lines.findIndex((line) => rowKind(line) !== null);
    start = firstRow < 0 ? lines.length : firstRow;
    const before = lines[start - 1];
    if (before !== undefined && ONLY_NUMBER.test(before)) start -= 1;
  }

  const basis: 'g' | 'ml' | null = PER_100_ML.test(heading)
    ? 'ml'
    : PER_100_G.test(heading)
      ? 'g'
      : null;
  if (start >= 0 && issues.length === 0 && basis === null && PER_SERVING.test(heading)) {
    issues.push('per_serving');
  }

  // Row names and numbers, each in reading order. The table ends where a row name comes a second time (a note
  // under it such as "*מקור הסוכר בחומוס בלבד", or "28 גרם חלבון" printed on the front).
  const rows: RowKind[] = [];
  const numbers: FoundNumber[] = [];
  for (const line of lines.slice(start)) {
    const kind = rowKind(line);
    if (kind !== null) {
      if (rows.includes(kind) && kind !== 'other' && kind !== 'otherFat') break;
      rows.push(kind);
    }
    numbers.push(...numbersIn(line));
  }

  const values: Partial<Record<LabelField, number>> = {};
  const doubtful = new Set<LabelField>();
  let polyols: number | null = null;
  if (rows.length === 0) {
    issues.push('no_rows');
  } else if (numbers.length < rows.length) {
    issues.push('count_mismatch');
  } else {
    rows.forEach((kind, index) => {
      const number = numbers[index];
      if (!number) return;
      if (kind === 'polyols') polyols = number.value;
      if (!isUsed(kind)) return;
      values[kind] = number.value;
      if (number.lessThan) doubtful.add(kind);
    });
  }
  // The four every label has: missing means worth a look (sugar and fiber are often not printed).
  for (const field of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    if (values[field] === undefined) doubtful.add(field);
  }

  return {
    values,
    doubtful: USED.filter((field) => doubtful.has(field)),
    basis,
    polyols,
    servingGrams: servingGrams(text),
    issues,
  };
}

export interface LabelValues {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number | null;
  fiber?: number | null;
  addedSugar?: number | null;
  /** Sugar alcohols in the carbohydrate (about 2.4 kcal/g instead of 4). */
  polyols?: number | null;
}

export type ValueFlag =
  /** Calories far from what protein, carbohydrate and fat give: one of the four may be misread. */
  | 'kcal_vs_macros'
  /** More sugar than carbohydrate, more added sugar than sugar. */
  | 'sugar_above_carbs'
  | 'added_above_sugar'
  /** Protein + carbohydrate + fat above 100 g in 100 g. */
  | 'macros_above_100';

/**
 * Points at values that do not fit together. Only ever a reason to look again: values that pass can still be
 * wrong (protein and carbohydrate swapped give the same calories), and values that fail can be right.
 */
export function checkLabelValues(values: LabelValues, basis: 'g' | 'ml' = 'g'): ValueFlag[] {
  const flags: ValueFlag[] = [];
  const polyols = Math.min(values.polyols ?? 0, values.carbs);
  const fromMacros =
    4 * values.protein + 9 * values.fat + 4 * (values.carbs - polyols) + 2.4 * polyols;
  if (Math.abs(values.kcal - fromMacros) > Math.max(25, 0.2 * values.kcal))
    flags.push('kcal_vs_macros');
  if (values.sugar != null && values.sugar > values.carbs) flags.push('sugar_above_carbs');
  if (values.addedSugar != null && values.sugar != null && values.addedSugar > values.sugar) {
    flags.push('added_above_sugar');
  }
  // A liquid can weigh more than 100 g per 100 ml, so the sum is only checked per 100 g.
  if (basis === 'g' && values.protein + values.carbs + values.fat > 105)
    flags.push('macros_above_100');
  return flags;
}
