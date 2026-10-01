import { type Instant } from './clock';
import { addDays, type LocalDate } from './dates';
import { wallToInstant } from './wall';
import { type Tz } from './zone';

/**
 * A day D in zone Z is `[dayStart(D), dayStart(D+1))`. It is 24h long except on DST days (23h or
 * 25h; 23.5h/24.5h for Lord Howe). `dayStart` is the earliest instant whose local date is D, so it
 * also works in zones that skip 00:00 (e.g. Asia/Beirut) - docs/ARCHITECTURE.md D.2.
 */
export function dayStart(date: LocalDate, tz: Tz): Instant {
  return wallToInstant(date, '00:00', tz);
}

/** Exclusive end of the day (= start of the next one). 23:59:59.999 is in D, 00:00 is in D+1. */
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
