import { type Instant } from './clock';
import { addDays, parseLocalDate, type LocalDate } from './dates';
import { DAY_STARTS_AT_HOUR, localParts, offsetMinutesAt, partsAsUtcMillis, type Tz } from './zone';

/** Wall-clock time of day as `HH:mm` (00:00 - 23:59). */
export type LocalTime = string;

const TIME_RE = /^(\d{2}):(\d{2})$/;
const DAY_MS = 86_400_000;

export function parseLocalTime(value: LocalTime): { hour: number; minute: number } {
  const match = TIME_RE.exec(value);
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (!match || hour > 23 || minute > 59) {
    throw new RangeError(`Invalid local time: ${value}`);
  }
  return { hour, minute };
}

export function formatLocalTime(hour: number, minute: number): LocalTime {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** `HH:mm` wall-clock time of `instant` in `tz`. */
export function localTimeOf(instant: Instant, tz: Tz): LocalTime {
  const { hour, minute } = localParts(instant, tz);
  return formatLocalTime(hour, minute);
}

/**
 * Wall-clock `date` + `time` in `tz` -> the instant it denotes, with `compatible` disambiguation
 * (docs/ARCHITECTURE.md D.2):
 *  - ambiguous time (clocks fall back, the hour happens twice) -> the FIRST occurrence;
 *  - nonexistent time (clocks spring forward, the hour is skipped) -> shifted FORWARD by the gap,
 *    e.g. 02:30 on Israel's spring-forward day is 03:30.
 */
export function wallToInstant(date: LocalDate, time: LocalTime, tz: Tz): Instant {
  const { year, month, day } = parseLocalDate(date);
  const { hour, minute } = parseLocalTime(time);
  const wallAsUtc = partsAsUtcMillis({ year, month, day, hour, minute, second: 0 });

  // A day contains at most one offset transition, so the offsets one day either side bracket it.
  const offsetBefore = offsetMinutesAt(wallAsUtc - DAY_MS, tz);
  const offsetAfter = offsetMinutesAt(wallAsUtc + DAY_MS, tz);

  const matches = new Set<Instant>();
  for (const offset of new Set([offsetBefore, offsetAfter])) {
    const candidate = wallAsUtc - offset * 60_000;
    const back = localParts(candidate, tz);
    if (
      back.year === year &&
      back.month === month &&
      back.day === day &&
      back.hour === hour &&
      back.minute === minute
    ) {
      matches.add(candidate);
    }
  }
  if (matches.size > 0) {
    return Math.min(...matches); // earliest = first occurrence when ambiguous
  }
  // Gap: interpret with the offset in force before the transition -> lands after the gap.
  return wallAsUtc - offsetBefore * 60_000;
}

/**
 * The instant of a wall-clock `time` on the day of eating `date`. From 02:00 on it is on that calendar date; the
 * hours before 02:00 are the end of that day, so they are on the next calendar date (00:30 of day D is the night
 * after D). The opposite of `localDateOf` + `localTimeOf`.
 */
export function dayTimeToInstant(date: LocalDate, time: LocalTime, tz: Tz): Instant {
  const { hour } = parseLocalTime(time);
  return wallToInstant(hour < DAY_STARTS_AT_HOUR ? addDays(date, 1) : date, time, tz);
}
