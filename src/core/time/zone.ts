import { type Instant } from './clock';
import { addDays, formatLocalDate, toEpochDay, type LocalDate } from './dates';

/** IANA time zone id, e.g. `Asia/Jerusalem`. */
export type Tz = string;

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<Tz, Intl.DateTimeFormat>();

function formatterFor(tz: Tz): Intl.DateTimeFormat {
  let formatter = formatters.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, formatter);
  }
  return formatter;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatterFor(tz);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock fields of `instant` in `tz`. */
export function localParts(instant: Instant, tz: Tz): LocalParts {
  const values: Record<string, number> = {};
  for (const part of formatterFor(tz).formatToParts(instant)) {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  }
  return {
    year: values['year'] ?? 0,
    month: values['month'] ?? 0,
    day: values['day'] ?? 0,
    // Some engines render midnight as 24 even with h23.
    hour: (values['hour'] ?? 0) % 24,
    minute: values['minute'] ?? 0,
    second: values['second'] ?? 0,
  };
}

/** Milliseconds since epoch of the given wall-clock fields *read as if they were UTC*. */
export function partsAsUtcMillis(parts: LocalParts): number {
  const epochDay = toEpochDay(formatLocalDate(parts.year, parts.month, parts.day));
  return (
    epochDay * 86_400_000 + parts.hour * 3_600_000 + parts.minute * 60_000 + parts.second * 1000
  );
}

/** UTC offset of `tz` at `instant`, in minutes east of UTC (Jerusalem summer = 180). */
export function offsetMinutesAt(instant: Instant, tz: Tz): number {
  const flooredToSecond = Math.floor(instant / 1000) * 1000;
  return (partsAsUtcMillis(localParts(instant, tz)) - flooredToSecond) / 60_000;
}

/**
 * A day of eating runs from 02:00 to 02:00, not from midnight to midnight: a meal at 00:30 is the last one of the day
 * before. Everything in the app that says "the day" (the day screen, a meal's date, the week) means this day.
 */
export const DAY_STARTS_AT_HOUR = 2;

/** The day `instant` belongs to in `tz`: its calendar date, except from midnight to 02:00, when it is still the day before. */
export function localDateOf(instant: Instant, tz: Tz): LocalDate {
  const { year, month, day, hour } = localParts(instant, tz);
  const date = formatLocalDate(year, month, day);
  return hour < DAY_STARTS_AT_HOUR ? addDays(date, -1) : date;
}
