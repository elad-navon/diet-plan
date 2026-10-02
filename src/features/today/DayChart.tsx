import { useId, useState } from 'react';
import { type DayChartModel } from '../../core/dayview';
import { type Tz } from '../../core/time';
import { clockAtMinute } from '../../i18n/format';
import { formatInt, he } from '../../i18n/he';

const W = 360;
const H = 232;
const PAD = { left: 40, right: 14, top: 16, bottom: 30 } as const;
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const MARKER_R = 4.5;
const HIT_R = 16;

interface DayChartProps {
  model: DayChartModel;
  tz: Tz;
  /** The recommended range at this moment (today only). */
  corridorNow: { lowerKcal: number; upperKcal: number } | null;
}

/** Y-axis labels at clean steps. */
function yTicks(yMax: number): number[] {
  const step = yMax <= 1200 ? 200 : yMax <= 2600 ? 600 : 1200;
  const ticks: number[] = [];
  for (let value = 0; value <= yMax; value += step) ticks.push(value);
  return ticks;
}

/**
 * "How much have I eaten and how much was I expected to eat by now" - the app's main graphic.
 * Cumulative calories over the day: a staircase for what was eaten, a shaded corridor for what the
 * plan expects, the daily target, a "now" marker and the suggested next meal. The time axis runs
 * left-to-right even in the right-to-left page (docs/PRODUCT_SPEC.md D-14). Everything shown is also
 * available as a table and in the text summary.
 */
export function DayChart({ model, tz, corridorNow }: DayChartProps) {
  const titleId = useId();
  const summaryId = useId();
  const tableId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { startMinute, endMinute } = model.domain;
  const x = (minute: number): number =>
    PAD.left + ((minute - startMinute) / (endMinute - startMinute)) * PLOT_W;
  const y = (kcal: number): number =>
    PAD.top + PLOT_H * (1 - Math.min(Math.max(kcal, 0), model.yMax) / model.yMax);
  const baseline = y(0);

  // Corridor: a staircase band between the lower and upper expected totals.
  const stair = (pick: (step: DayChartModel['corridor'][number]) => number): [number, number][] => {
    const points: [number, number][] = [];
    model.corridor.forEach((step, i) => {
      const previous = model.corridor[i - 1];
      if (previous) points.push([step.minute, pick(previous)]);
      points.push([step.minute, pick(step)]);
    });
    const last = model.corridor[model.corridor.length - 1];
    if (last) points.push([endMinute, pick(last)]);
    return points;
  };
  const toPath = (points: [number, number][]): string =>
    points.map(([minute, kcal], i) => `${i === 0 ? 'M' : 'L'}${x(minute)} ${y(kcal)}`).join(' ');
  const upperPoints = stair((step) => step.upperKcal);
  const lowerPoints = stair((step) => step.lowerKcal);
  const upperPath = toPath(upperPoints);
  const corridorShape =
    upperPoints.length > 0
      ? `${upperPath} ${[...lowerPoints]
          .reverse()
          .map(([minute, kcal]) => `L${x(minute)} ${y(kcal)}`)
          .join(' ')} Z`
      : '';

  const eatenPath = model.eaten
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${x(point.minute)} ${y(point.kcal)}`)
    .join(' ');

  const selectedMeal = model.meals.find((meal) => meal.id === selected) ?? null;
  const targetY = y(model.targetKcal);
  const summary = he.today.chartSummary(
    formatInt(model.totalKcal),
    formatInt(model.targetKcal),
    formatInt(corridorNow?.lowerKcal ?? 0),
    formatInt(corridorNow?.upperKcal ?? 0),
  );

  return (
    <figure className="card p-5">
      <figcaption id={titleId} className="mb-2 text-xl font-bold">
        {he.today.chartTitle}
      </figcaption>

      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="מקרא">
        <li className="flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true">
            <path
              d="M1 8h8V2h12"
              fill="none"
              stroke="var(--series-1)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          {he.today.legendEaten}
        </li>
        {corridorNow && (
          <li className="flex items-center gap-1.5">
            <svg width="22" height="12" aria-hidden="true">
              <rect
                x="1"
                y="1"
                width="20"
                height="10"
                fill="var(--muted)"
                fillOpacity="0.2"
                stroke="var(--muted)"
                strokeOpacity="0.6"
              />
            </svg>
            {he.today.legendCorridor}
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true">
            <path d="M1 5h20" stroke="var(--muted)" strokeWidth="1" />
          </svg>
          {he.today.legendTarget}
        </li>
        {model.next && (
          <li className="flex items-center gap-1.5">
            <svg width="22" height="12" aria-hidden="true">
              <path d="M11 1l5 5-5 5-5-5z" fill="var(--series-2)" />
            </svg>
            {he.today.legendNext}
          </li>
        )}
      </ul>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        className="h-auto w-full"
        style={{ direction: 'ltr' }}
      >
        {/* meal windows */}
        {model.bands.map((band) => {
          const from = Math.max(band.startMinute, startMinute);
          const to = Math.min(band.endMinute, endMinute);
          return to > from ? (
            <rect
              key={band.slot}
              x={x(from)}
              y={PAD.top}
              width={x(to) - x(from)}
              height={PLOT_H}
              fill="var(--faint)"
              fillOpacity="0.3"
            />
          ) : null;
        })}

        {/* grid and Y labels */}
        {yTicks(model.yMax).map((tick) => (
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
          y1={baseline}
          y2={baseline}
          stroke="var(--axis)"
          strokeWidth="1"
        />

        {/* X axis labels */}
        {model.ticks.map((tick) => (
          <text
            key={tick.label}
            x={x(tick.minute)}
            y={H - 10}
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted)"
          >
            {tick.label}
          </text>
        ))}

        {/* expected corridor */}
        {corridorNow && corridorShape && (
          <>
            <path d={corridorShape} fill="var(--muted)" fillOpacity="0.2" stroke="none" />
            <path
              d={upperPath}
              fill="none"
              stroke="var(--muted)"
              strokeOpacity="0.55"
              strokeWidth="1"
            />
          </>
        )}

        {/* daily target */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={targetY}
          y2={targetY}
          stroke="var(--muted)"
          strokeWidth="1"
        />
        <text x={W - PAD.right} y={targetY - 5} textAnchor="end" fontSize="11" fill="var(--muted)">
          {`${he.today.legendTarget} ${formatInt(model.targetKcal)}`}
        </text>

        {/* suggested next meal */}
        {model.next && (
          <g>
            <line
              x1={x(model.next.minute)}
              x2={x(model.next.minute)}
              y1={y(model.next.fromKcal)}
              y2={y(model.next.toKcal)}
              stroke="var(--series-2)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d={`M${x(model.next.minute)} ${y(model.next.toKcal) - 7}l6 7-6 7-6-7z`}
              fill="var(--series-2)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
          </g>
        )}

        {/* what was eaten */}
        <path
          d={eatenPath}
          fill="none"
          stroke="var(--series-1)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* now */}
        {model.now && (
          <g>
            <line
              x1={x(model.now.minute)}
              x2={x(model.now.minute)}
              y1={PAD.top}
              y2={baseline}
              stroke="var(--muted)"
              strokeWidth="1"
              strokeOpacity="0.7"
            />
            <text
              x={x(model.now.minute)}
              y={PAD.top - 4}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted)"
            >
              {he.today.now}
            </text>
            <circle
              cx={x(model.now.minute)}
              cy={y(model.now.kcal)}
              r={MARKER_R + 1}
              fill="var(--series-1)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
          </g>
        )}

        {/* meals: keyboard- and touch-reachable markers with a generous hit area */}
        {model.meals.map((meal) => {
          const time = clockAtMinute(model.date, meal.minute, tz);
          return (
            <g
              key={meal.id}
              role="button"
              tabIndex={0}
              aria-label={`${time} ${meal.name}, ${formatInt(meal.kcal)} ${he.kcal}, ${he.today.colTotal} ${formatInt(meal.cumulativeKcal)}`}
              aria-pressed={selected === meal.id}
              onClick={() => setSelected(selected === meal.id ? null : meal.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelected(selected === meal.id ? null : meal.id);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={x(meal.minute)}
                cy={y(meal.cumulativeKcal)}
                r={HIT_R}
                fill="transparent"
              />
              <circle
                cx={x(meal.minute)}
                cy={y(meal.cumulativeKcal)}
                r={selected === meal.id ? MARKER_R + 2 : MARKER_R}
                fill="var(--series-1)"
                stroke="var(--surface)"
                strokeWidth="2"
              />
            </g>
          );
        })}

        {/* total above the visible range */}
        {model.clippedAtMax && (
          <g>
            <path d={`M${W - PAD.right - 8} ${PAD.top + 10}l6-10 6 10z`} fill="var(--ink)" />
            <text
              x={W - PAD.right - 18}
              y={PAD.top + 9}
              textAnchor="end"
              fontSize="11"
              fill="var(--ink)"
            >
              {formatInt(model.totalKcal)}
            </text>
          </g>
        )}
      </svg>

      <p id={summaryId} className="mt-2 text-base">
        {summary}
        {model.overByKcal > 0 &&
          ` ${he.status.over_budget}: ${formatInt(model.overByKcal)} ${he.kcal}.`}
      </p>
      <p aria-live="polite" className="mt-1 min-h-6 text-sm text-muted">
        {selectedMeal
          ? `${clockAtMinute(model.date, selectedMeal.minute, tz)} · ${selectedMeal.name} · ${formatInt(selectedMeal.kcal)} ${he.kcal} · ${he.today.colTotal} ${formatInt(selectedMeal.cumulativeKcal)}`
          : ''}
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
          <caption className="sr-only">{he.today.tableCaption}</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 text-start font-medium">
                {he.today.colTime}
              </th>
              <th scope="col" className="py-1 text-start font-medium">
                {he.today.colMeal}
              </th>
              <th scope="col" className="py-1 text-start font-medium">
                {he.today.colKcal}
              </th>
              <th scope="col" className="py-1 text-start font-medium">
                {he.today.colTotal}
              </th>
            </tr>
          </thead>
          <tbody>
            {model.meals.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-2 text-muted">
                  {he.today.noMealsYet}
                </td>
              </tr>
            ) : (
              model.meals.map((meal) => (
                <tr key={meal.id} className="border-t border-faint">
                  <td className="py-1.5">
                    <bdi>{clockAtMinute(model.date, meal.minute, tz)}</bdi>
                  </td>
                  <td className="py-1.5">{meal.name}</td>
                  <td className="py-1.5">
                    <bdi>{formatInt(meal.kcal)}</bdi>
                  </td>
                  <td className="py-1.5">
                    <bdi>{formatInt(meal.cumulativeKcal)}</bdi>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
