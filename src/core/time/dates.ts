/**
 * Calendar-date arithmetic on `YYYY-MM-DD` strings. Integer day-count math only (no Date, no
 * milliseconds), so 23/25-hour DST days can never leak into "how many days between X and Y".
 * See docs/ARCHITECTURE.md D.2.
 */

/** A calendar date as `YYYY-MM-DD` (4-digit year). Lexicographic order equals chronological order. */
export type LocalDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

export function isValidLocalDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseLocalDate(value: LocalDate): DateParts {
  if (!isValidLocalDate(value)) {
    throw new RangeError(`Invalid local date: ${value}`);
  }
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

export function formatLocalDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Days since 1970-01-01 (proleptic Gregorian). Howard Hinnant's `days_from_civil`. */
export function toEpochDay(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** Inverse of {@link toEpochDay}. Howard Hinnant's `civil_from_days`. */
export function fromEpochDay(epochDay: number): LocalDate {
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPart = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1;
  const month = monthPart + (monthPart < 10 ? 3 : -9);
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return formatLocalDate(year, month, day);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Whole calendar days from `earlier` to `later` (negative if `later` is before `earlier`). */
export function diffDays(later: LocalDate, earlier: LocalDate): number {
  return toEpochDay(later) - toEpochDay(earlier);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: LocalDate): number {
  // 1970-01-01 was a Thursday (4).
  return (((toEpochDay(date) + 4) % 7) + 7) % 7;
}

/** The Sunday on or before `date` (week starts on Sunday in Israel - docs/PRODUCT_SPEC.md D-13). */
export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, -dayOfWeek(date));
}

/**
 * Completed years on `on`. A Feb 29 birthday is celebrated on Mar 1 in non-leap years
 * (docs/NUTRITION_RULES.md F.2, docs/TEST_PLAN.md NUT-09).
 */
export function ageOn(birthDate: LocalDate, on: LocalDate): number {
  const birth = parseLocalDate(birthDate);
  const today = parseLocalDate(on);
  let birthdayMonth = birth.month;
  let birthdayDay = birth.day;
  if (birthdayMonth === 2 && birthdayDay === 29 && !isLeapYear(today.year)) {
    birthdayMonth = 3;
    birthdayDay = 1;
  }
  const hadBirthday =
    today.month > birthdayMonth || (today.month === birthdayMonth && today.day >= birthdayDay);
  return today.year - birth.year - (hadBirthday ? 0 : 1);
}
