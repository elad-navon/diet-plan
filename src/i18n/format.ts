import {
  dayOfWeek,
  localTimeOf,
  wallToInstant,
  type Instant,
  type LocalDate,
  type Tz,
} from '../core/time';

const WEEKDAY_INITIALS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;

/** "יום שישי, 2 באוקטובר" for a local date. */
export function formatDayTitle(date: LocalDate, tz: Tz): string {
  const noon = wallToInstant(date, '12:00', tz);
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
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
  const start = wallToInstant(date, '00:00', tz);
  return localTimeOf(start + minute * 60_000, tz);
}
