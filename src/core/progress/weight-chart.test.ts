import { describe, expect, it } from 'vitest';
import { addDays, toEpochDay } from '../time';
import { buildWeightChart, type PlanLine } from './index';

const TODAY = '2026-10-01';
const day = (date: string): number => toEpochDay(date);

/** 71 -> 62 kg at 0.5 kg/week from 2026-09-01 (126 days -> 2027-01-05). */
const plan: PlanLine = {
  effectiveFrom: '2026-09-01',
  startDate: '2026-09-01',
  startWeightKg: 71,
  weeklyRateKg: 0.5,
  targetWeightKg: 62,
  projectedDate: addDays('2026-09-01', 126),
};

describe('weight chart: nothing yet', () => {
  it('shows a neutral two-week window around today', () => {
    const model = buildWeightChart({ today: TODAY, weights: [], plans: [] });
    expect(model.domain).toEqual({ startDay: day(TODAY) - 14, endDay: day(TODAY) + 14 });
    expect(model.weights).toEqual([]);
    expect(model.plan).toBeNull();
    expect(model.yMax).toBeGreaterThan(model.yMin);
  });
});

describe('weigh-ins and trend', () => {
  const model = buildWeightChart({
    today: TODAY,
    weights: [
      { date: '2026-09-20', kg: 70.2 },
      { date: '2026-09-10', kg: 71 }, // out of order on purpose
      { date: '2026-09-30', kg: 69.8 },
    ],
    plans: [plan],
  });

  it('orders points by date and smooths the trend from the first reading', () => {
    expect(model.weights.map((w) => w.date)).toEqual(['2026-09-10', '2026-09-20', '2026-09-30']);
    expect(model.trend[0]?.kg).toBe(71);
    expect(model.trend).toHaveLength(3);
    // The trend moves slowly: far less than the raw 1.2 kg drop.
    expect(model.trend[2]?.kg).toBeGreaterThan(69.8);
    expect(model.trend[2]?.kg).toBeLessThan(71);
  });

  it('fits every point on the vertical axis', () => {
    for (const w of model.weights) {
      expect(w.kg).toBeGreaterThanOrEqual(model.yMin);
      expect(w.kg).toBeLessThanOrEqual(model.yMax);
    }
    expect(model.yMin).toBeLessThanOrEqual(62); // the target is on the axis too
    expect(model.yMax).toBeGreaterThanOrEqual(71);
  });
});

describe('plan projection (NUT-12)', () => {
  const model = buildWeightChart({ today: TODAY, weights: [], plans: [plan] });
  const projection = model.plan!;

  it('descends from the start weight to the target, never below it', () => {
    expect(projection.line[0]).toEqual({ day: day('2026-09-01'), kg: 71 });
    expect(projection.line.at(-1)?.kg).toBe(62);
    expect(projection.targetKg).toBe(62);
    expect(projection.projectedDay).toBe(day('2027-01-05'));
    for (let i = 1; i < projection.line.length; i += 1) {
      expect(projection.line[i]!.day).toBeGreaterThan(projection.line[i - 1]!.day);
      expect(projection.line[i]!.kg).toBeLessThanOrEqual(projection.line[i - 1]!.kg);
      expect(projection.line[i]!.kg).toBeGreaterThanOrEqual(62);
    }
  });

  it('draws a cone: the fast edge reaches the target before the plan, the slow edge after', () => {
    const reach = (line: { day: number; kg: number }[]) => line.find((p) => p.kg === 62)?.day;
    const fastReach = reach(projection.fast)!;
    const slowReach = reach(projection.slow)!;
    expect(fastReach).toBeLessThan(day('2027-01-05'));
    expect(slowReach).toBeGreaterThan(day('2027-01-05'));
  });

  it('shows the whole projection on the horizontal axis', () => {
    expect(model.domain.startDay).toBe(day('2026-09-01'));
    expect(model.domain.endDay).toBeGreaterThanOrEqual(day('2027-01-05'));
  });
});

describe('plans over time', () => {
  it('cuts an earlier plan where the next one began and shows only the current cone', () => {
    const next: PlanLine = {
      effectiveFrom: '2026-09-20',
      startDate: '2026-09-20',
      startWeightKg: 70,
      weeklyRateKg: 0.3,
      targetWeightKg: 65,
      projectedDate: addDays('2026-09-20', 117),
    };
    const model = buildWeightChart({ today: TODAY, weights: [], plans: [next, plan] });
    expect(model.earlier).toHaveLength(1);
    expect(model.earlier[0]?.at(-1)?.day).toBeLessThanOrEqual(day('2026-09-20'));
    expect(model.plan?.targetKg).toBe(65);
    expect(model.plan?.line[0]).toEqual({ day: day('2026-09-20'), kg: 70 });
  });

  it('ignores plans that start in the future and has no projection for maintenance', () => {
    const future = { ...plan, effectiveFrom: '2026-12-01', startDate: '2026-12-01' };
    expect(buildWeightChart({ today: TODAY, weights: [], plans: [future] }).plan).toBeNull();
    const maintain: PlanLine = {
      ...plan,
      weeklyRateKg: 0,
      targetWeightKg: null,
      projectedDate: null,
    };
    expect(buildWeightChart({ today: TODAY, weights: [], plans: [maintain] }).plan).toBeNull();
  });
});

describe('recent view: zoom to the last weeks', () => {
  const weights = [
    { date: '2026-09-25', kg: 71 },
    { date: '2026-09-29', kg: 70.6 },
    { date: '2026-10-01', kg: 70.4 },
  ];
  const model = buildWeightChart({ today: TODAY, weights, plans: [plan], view: 'recent' });
  const full = buildWeightChart({ today: TODAY, weights, plans: [plan], view: 'full' });

  it('stops a month after today instead of at the far-away goal date', () => {
    expect(model.view).toBe('recent');
    expect(model.domain.endDay).toBe(day(TODAY) + 28);
    expect(model.domain.endDay).toBeLessThan(full.domain.endDay);
    expect(model.domain.startDay).toBe(day('2026-09-01')); // the plan began less than six weeks ago
  });

  it('fits the vertical axis to what is visible, so a few days of weigh-ins are readable', () => {
    expect(model.yMax - model.yMin).toBeLessThan(full.yMax - full.yMin);
    expect(model.yMin).toBeGreaterThan(62); // the distant target is no longer on the axis
    expect(model.plan?.targetVisible).toBe(false);
    expect(full.plan?.targetVisible).toBe(true);
    for (const w of model.weights) {
      expect(w.kg).toBeGreaterThanOrEqual(model.yMin);
      expect(w.kg).toBeLessThanOrEqual(model.yMax);
    }
  });

  it('keeps the projection inside the visible window', () => {
    for (const point of model.plan!.line) {
      expect(point.day).toBeGreaterThanOrEqual(model.domain.startDay);
      expect(point.day).toBeLessThanOrEqual(model.domain.endDay);
      expect(point.kg).toBeGreaterThanOrEqual(model.yMin);
      expect(point.kg).toBeLessThanOrEqual(model.yMax);
    }
  });

  it('drops weigh-ins older than six weeks', () => {
    const old = buildWeightChart({
      today: '2026-12-01',
      weights: [
        { date: '2026-09-25', kg: 71 },
        { date: '2026-11-25', kg: 68 },
      ],
      plans: [],
      view: 'recent',
    });
    expect(old.weights.map((w) => w.date)).toEqual(['2026-11-25']);
  });
});
