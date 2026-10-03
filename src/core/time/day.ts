import { type Instant } from './clock';
import { addDays, type LocalDate } from './dates';
import { formatLocalTime, wallToInstant } from './wall';
import { DAY_STARTS_AT_HOUR, type Tz } from './zone';

/**
 * A day D in zone Z is `[dayStart(D), dayStart(D+1))`: from 02:00 of D to 02:00 of the next date (a day of
 * eating, see DAY_STARTS_AT_HOUR). It is 24h long except around DST changes (23h or 25h; 23.5h/24.5h for Lord
 * Howe). `dayStart` is the earliest instant whose day is D, so it also works when the clocks skip 02:00.
 */
export function dayStart(date: LocalDate, tz: Tz): Instant {
  return wallToInstant(date, formatLocalTime(DAY_STARTS_AT_HOUR, 0), tz);
}

/** Exclusive end of the day (= start of the next one). 01:59:59.999 of the next date is in D, 02:00 is in D+1. */
export function dayEnd(date: LocalDate, tz: Tz): Instant {
  return dayStart(addDays(date, 1), tz);
}

export function dayLengthMinutes(date: LocalDate, tz: Tz): number {
  return (dayEnd(date, tz) - dayStart(date, tz)) / 60_000;
}

/**
 * Minutes actually elapsed since the start of `date` (not wall-clock minutes), the X axis of the day
 * chart: it spans 1380/1440/1500 minutes on DST days instead of a fixed 1440.
 */
export function elapsedMinutes(instant: Instant, date: LocalDate, tz: Tz): number {
  return (instant - dayStart(date, tz)) / 60_000;
}
