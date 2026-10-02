import { useId, useState } from 'react';
import { type RangeSummary } from '../../core/dayview';
import { formatDayMonth, weekdayInitial } from '../../i18n/format';
import { formatInt, he } from '../../i18n/he';
import { type Tz } from '../../core/time';

const W = 360;
const H = 200;
const PAD = { left: 40, right: 12, top: 22, bottom: 30 } as const;
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const BAR_MAX = 24;

const niceCeil = (value: number): number => Math.max(200, Math.ceil(value / 200) * 200);

interface WeeklyChartProps {
  range: RangeSummary;
  tz: Tz;
}

/** Calories per day for the last week against each day's own target; days without entries stay empty. */
export function WeeklyChart({ range, tz }: WeeklyChartProps) {
  const titleId = useId();
  const tableId = useId();
  const [showTable, setShowTable] = useState(false);

  const peak = Math.max(0, ...range.days.map((d) => Math.max(d.kcal, d.kcalTarget ?? 0)));
  const yMax = niceCeil(peak * 1.15);
  const y = (kcal: number): number => PAD.top + PLOT_H * (1 - Math.min(kcal, yMax) / yMax);
  const slot = PLOT_W / range.days.length;
  const barWidth = Math.min(BAR_MAX, slot * 0.6);
  const ticks = [0, yMax / 2, yMax];
  const average = range.averageKcalLogged;

  return (
    <figure className="card p-5">
      <figcaption id={titleId} className="mb-2 text-lg font-bold">
        {he.progress.weekTitle}
      </figcaption>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="מקרא">
        <li className="flex items-center gap-1.5">
          <svg width="22" height="12" aria-hidden="true">
            <rect x="5" y="1" width="12" height="10" rx="2" fill="var(--series-1)" />
          </svg>
          {he.progress.legendKcal}
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true">
            <path d="M1 5h20" stroke="var(--muted)" strokeWidth="1" />
          </svg>
          {he.progress.legendTargetLine}
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="22" height="12" aria-hidden="true">
            <circle cx="11" cy="6" r="4" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
          </svg>
          {he.progress.notLogged}
        </li>
      </ul>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-labelledby={titleId}
        className="h-auto w-full"
        style={{ direction: 'ltr' }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--faint)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--muted)"
            >
              {formatInt(tick)}
            </text>
          </g>
        ))}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--axis)"
          strokeWidth="1"
        />

        {range.days.map((day, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          return (
            <g key={day.date}>
              {day.logged ? (
                <>
                  {/* rounded at the top only, square on the baseline */}
                  <path
                    d={`M${cx - barWidth / 2} ${y(0)} V${y(day.kcal) + 4} a4 4 0 0 1 4-4 h${barWidth - 8} a4 4 0 0 1 4 4 V${y(0)} Z`}
                    fill="var(--series-1)"
                  />
                  <text
                    x={cx}
                    y={y(day.kcal) - 5}
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--ink)"
                  >
                    {formatInt(day.kcal)}
                  </text>
                </>
              ) : (
                <circle
                  cx={cx}
                  cy={y(0) - 5}
                  r="4"
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth="1.5"
                />
              )}
              {day.kcalTarget !== null && (
                <line
                  x1={cx - slot / 2 + 3}
                  x2={cx + slot / 2 - 3}
                  y1={y(day.kcalTarget)}
                  y2={y(day.kcalTarget)}
                  stroke="var(--muted)"
                  strokeWidth="1"
                />
              )}
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {weekdayInitial(day.date)}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="mt-2 text-base">
        {average === null
          ? he.progress.weekNone
          : he.progress.weekAverage(formatInt(average), range.daysLogged)}
      </p>

      <button
        type="button"
        className="mt-1 min-h-11 text-base text-accent underline"
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => setShowTable((value) => !value)}
      >
        {showTable ? he.today.hideTable : he.today.showTable}
      </button>
      <div id={tableId} hidden={!showTable}>
        <table className="mt-2 w-full text-start text-base">
          <caption className="sr-only">{he.progress.weekTitle}</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 text-start font-medium">
                {he.progress.colDate}
              </th>
              <th scope="col" className="py-1 text-start font-medium">
                {he.today.colKcal}
              </th>
              <th scope="col" className="py-1 text-start font-medium">
                {he.progress.legendTargetLine}
              </th>
            </tr>
          </thead>
          <tbody>
            {range.days.map((day) => (
              <tr key={day.date} className="border-t border-faint">
                <td className="py-1.5">{formatDayMonth(day.date, tz)}</td>
                <td className="py-1.5">
                  {day.logged ? <bdi>{formatInt(day.kcal)}</bdi> : he.progress.notLogged}
                </td>
                <td className="py-1.5">
                  {day.kcalTarget === null ? '—' : <bdi>{formatInt(day.kcalTarget)}</bdi>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
