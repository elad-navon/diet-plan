import { shortFoodName, type FoodEntry } from '../core/food';
import {
  dayOfWeek,
  dayStart,
  localTimeOf,
  wallToInstant,
  type Instant,
  type LocalDate,
  type Tz,
} from '../core/time';
import { formatDecimal, he } from './he';

const WEEKDAY_INITIALS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;

/** "יום שישי, 2 באוקטובר 2026" for a local date. */
export function formatDayTitle(date: LocalDate, tz: Tz): string {
  const noon = wallToInstant(date, '12:00', tz);
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tz,
  }).format(noon);
}

/** "2 באוק׳ 2026" for a local date. */
export function formatShortDate(date: LocalDate, tz: Tz): string {
  const noon = wallToInstant(date, '12:00', tz);
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: tz,
  }).format(noon);
}

/** "יוני 2027" - month and year, for estimates that are not exact to the day. */
export function formatMonthYear(date: LocalDate, tz: Tz): string {
  const noon = wallToInstant(date, '12:00', tz);
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: tz }).format(
    noon,
  );
}

/** "אוק׳" or "אוק׳ 2026" - a month on a chart axis. */
export function formatMonthLabel(date: LocalDate, tz: Tz, withYear: boolean): string {
  const noon = wallToInstant(date, '12:00', tz);
  return new Intl.DateTimeFormat('he-IL', {
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: tz,
  }).format(noon);
}

/** "2 באוק׳" - day and month only, for chart axes. */
export function formatDayMonth(date: LocalDate, tz: Tz): string {
  const noon = wallToInstant(date, '12:00', tz);
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  }).format(noon);
}

export const formatClock = (instant: Instant, tz: Tz): string => localTimeOf(instant, tz);

/** Hebrew weekday letter: א׳ (Sunday) … ש׳ (Saturday). */
export const weekdayInitial = (date: LocalDate): string => WEEKDAY_INITIALS[dayOfWeek(date)] ?? '';

/** "HH:mm" of an elapsed-minutes position on a given day (chart table rows). */
export function clockAtMinute(date: LocalDate, minute: number, tz: Tz): string {
  return localTimeOf(dayStart(date, tz) + minute * 60_000, tz);
}

// --- amounts in words: "2 פרוסות דקות (48 ג')" ------------------------------------------------

/** Plurals of the household measures the database uses (feminine nouns mostly end in ות). */
const MEASURE_PLURALS: Readonly<Record<string, string>> = {
  פרוסה: 'פרוסות',
  יחידה: 'יחידות',
  כף: 'כפות',
  כפית: 'כפיות',
  כוס: 'כוסות',
  מנה: 'מנות',
  אריזה: 'אריזות',
  שקית: 'שקיות',
  קופסה: 'קופסאות',
  חבילה: 'חבילות',
  גביע: 'גביעים',
  פלח: 'פלחים',
};

/** Plurals of the words that describe a measure ("פרוסה דקה" -> "פרוסות דקות"). */
const DESCRIPTION_PLURALS: Readonly<Record<string, string>> = {
  קטנה: 'קטנות',
  בינונית: 'בינוניות',
  גדולה: 'גדולות',
  עבה: 'עבות',
  דקה: 'דקות',
  אישית: 'אישיות',
  גדושה: 'גדושות',
  שטוחה: 'שטוחות',
};

function pluralMeasure(measure: string): string {
  const [noun = '', ...rest] = measure.split(' ');
  const plural = MEASURE_PLURALS[noun];
  if (plural === undefined) return measure;
  return [plural, ...rest.map((word) => DESCRIPTION_PLURALS[word] ?? word)].join(' ');
}

/** A count with up to two decimals (quarters stay exact: 1.25, not 1.3). */
const formatCount = (count: number): string =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 }).format(count);

/**
 * How much of a food, the way people say it: "פרוסה", "חצי פיתה", "כוס וחצי", "3 כפות" - and always the
 * weight in grams next to it. A weight-only entry is just "110 ג'".
 */
export function describeAmount(entry: Pick<FoodEntry, 'grams' | 'unit' | 'count'>): string {
  const grams = `${formatDecimal(entry.grams)} ${he.gramsShort}`;
  const { unit, count } = entry;
  if (unit === undefined || count === undefined) return grams;
  let phrase: string;
  if (count === 1) phrase = unit;
  else if (count === 0.5) phrase = `חצי ${unit}`;
  else if (count === 0.25) phrase = `רבע ${unit}`;
  else if (count === 0.75) phrase = `שלושת רבעי ${unit}`;
  else if (count === 1.5) phrase = `${unit} וחצי`;
  else phrase = `${formatCount(count)} ${pluralMeasure(unit)}`;
  return `${phrase} (${grams})`;
}

/** One ingredient line: "לחם מחיטה מלאה: 2 פרוסות בינוניות (64 ג')". */
export function ingredientLine(part: {
  label: string | null;
  entry: Pick<FoodEntry, 'name' | 'grams' | 'unit' | 'count'>;
}): string {
  return `${part.label ?? shortFoodName(part.entry.name)}: ${describeAmount(part.entry)}`;
}
