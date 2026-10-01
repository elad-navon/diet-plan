import { describe, expect, it } from 'vitest';
import { wallToInstant } from '../time';
import {
  DEFAULT_SCHEDULE,
  corridorAt,
  inferSlot,
  slotWindows,
  validateSchedule,
  type MealSchedule,
} from './index';

const TZ = 'Asia/Jerusalem';
const DATE = '2026-10-02';
const at = (time: string): number => wallToInstant(DATE, time, TZ);
/** An instant given in UTC (wall time in the UTC zone), so tests need no raw Date. */
const utc = (date: string, time: string): number => wallToInstant(date, time, 'UTC');
const codes = (schedule: MealSchedule): string[] => validateSchedule(schedule).map((e) => e.code);

describe('schedule validation', () => {
  it('accepts the default schedule', () => {
    expect(validateSchedule(DEFAULT_SCHEDULE)).toEqual([]);
    expect(DEFAULT_SCHEDULE.reduce((sum, slot) => sum + slot.weight, 0)).toBeCloseTo(1, 10);
  });

  it('rejects the wrong number of slots, duplicates and bad weights', () => {
    expect(codes(DEFAULT_SCHEDULE.slice(0, 2))).toContain('slot_count');
    const duplicate: MealSchedule = [...DEFAULT_SCHEDULE.slice(0, 3), DEFAULT_SCHEDULE[0]!];
    expect(codes(duplicate)).toContain('duplicate_slot');
    expect(
      codes(DEFAULT_SCHEDULE.map((slot, i) => (i === 0 ? { ...slot, weight: 0.2 } : slot))),
    ).toContain('weights_do_not_sum_to_one');
    expect(
      codes(DEFAULT_SCHEDULE.map((slot, i) => (i === 0 ? { ...slot, weight: 0 } : slot))),
    ).toContain('weight_not_positive');
  });

  it('rejects overlapping, reversed, out-of-order and malformed windows', () => {
    const [breakfast, lunch, snack, dinner] = DEFAULT_SCHEDULE as [
      (typeof DEFAULT_SCHEDULE)[number],
      (typeof DEFAULT_SCHEDULE)[number],
      (typeof DEFAULT_SCHEDULE)[number],
      (typeof DEFAULT_SCHEDULE)[number],
    ];
    expect(codes([breakfast, { ...lunch, start: '09:00' }, snack, dinner])).toContain(
      'windows_overlap',
    );
    expect(codes([breakfast, { ...lunch, start: '14:30', end: '12:30' }, snack, dinner])).toContain(
      'window_not_increasing',
    );
    expect(codes([lunch, breakfast, snack, dinner])).toContain('not_in_time_order');
    expect(codes([breakfast, { ...lunch, start: '25:00' }, snack, dinner])).toContain(
      'invalid_time',
    );
  });
});

describe('slot windows on real days', () => {
  it('resolves wall-clock windows to instants', () => {
    const [breakfast] = slotWindows(DEFAULT_SCHEDULE, '2026-06-15', TZ);
    expect(breakfast?.startInstant).toBe(utc('2026-06-15', '04:30')); // 07:30 at UTC+3
    expect(breakfast?.endInstant).toBe(utc('2026-06-15', '06:30'));
  });

  it('follows the offset on a fall-back day (the same wall time is one hour later in UTC)', () => {
    const lunchBefore = slotWindows(DEFAULT_SCHEDULE, '2026-10-24', TZ)[1];
    const lunchOnChangeDay = slotWindows(DEFAULT_SCHEDULE, '2026-10-25', TZ)[1];
    expect(lunchBefore?.startInstant).toBe(utc('2026-10-24', '09:30')); // 12:30 at +3
    expect(lunchOnChangeDay?.startInstant).toBe(utc('2026-10-25', '10:30')); // 12:30 at +2
  });
});

describe('slot inference (REC-09)', () => {
  const windows = slotWindows(DEFAULT_SCHEDULE, DATE, TZ);

  it('uses the containing window', () => {
    expect(inferSlot(at('08:00'), windows)).toBe('breakfast');
    expect(inferSlot(at('13:00'), windows)).toBe('lunch');
    expect(inferSlot(at('20:00'), windows)).toBe('dinner');
  });

  it('assigns early or late meals to the nearest window within 90 minutes', () => {
    expect(inferSlot(at('06:30'), windows)).toBe('breakfast');
    expect(inferSlot(at('15:00'), windows)).toBe('lunch'); // 30 min after lunch, 60 min before the snack
    expect(inferSlot(at('22:30'), windows)).toBe('dinner');
  });

  it('files everything else as other', () => {
    expect(inferSlot(at('03:00'), windows)).toBe('other');
    expect(inferSlot(at('23:00'), windows)).toBe('other');
  });
});

describe('corridor', () => {
  const windows = slotWindows(DEFAULT_SCHEDULE, DATE, TZ);

  it('is a band: lower = windows that ended, upper = windows that started (minus 60 minutes)', () => {
    expect(corridorAt(windows, 1800, at('05:00'))).toEqual({ lowerKcal: 0, upperKcal: 0 });
    expect(corridorAt(windows, 1800, at('06:30'))).toEqual({ lowerKcal: 0, upperKcal: 450 });
    expect(corridorAt(windows, 1800, at('10:00'))).toEqual({ lowerKcal: 450, upperKcal: 450 });
    expect(corridorAt(windows, 1800, at('11:30'))).toEqual({ lowerKcal: 450, upperKcal: 990 });
    expect(corridorAt(windows, 1800, at('14:30'))).toEqual({ lowerKcal: 990, upperKcal: 990 });
    expect(corridorAt(windows, 1800, at('15:00'))).toEqual({ lowerKcal: 990, upperKcal: 1260 });
    expect(corridorAt(windows, 1800, at('21:00'))).toEqual({ lowerKcal: 1800, upperKcal: 1800 });
  });
});
