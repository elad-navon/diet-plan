import { useId } from 'react';
import { type DayChartModel } from '../../core/dayview';
import { type Tz } from '../../core/time';
import { clockAtMinute } from '../../i18n/format';
import { formatInt, he } from '../../i18n/he';

const W = 360;
const H = 232;
const PAD = { left: 40, right: 14, top: 16, bottom: 30 } as const;
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const MARKER_R = 8.5;
/** Two numbered markers closer than this would hide each other's number. */
const MARKER_GAP = 2 * MARKER_R + 1;
/** Past this many meals the numbers would crowd the line: plain dots are drawn and the list is not numbered. */
const MAX_NUMBERED = 10;
const DOT_R = 4.5;

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
 * "How much have I eaten and am I on the way" - the app's main graphic. Cumulative calories over the day:
 * a line for what was eaten, with each meal marked by its number, a dashed recommended path, the daily
 * target and a "now" marker. The list under the line says what each number is, so the chart needs no
 * hover or tap. The time axis runs left-to-right even in the right-to-left page (docs/PRODUCT_SPEC.md D-14).
 */
export function DayChart({ model, tz, corridorNow }: DayChartProps) {
  const titleId = useId();
  const summaryId = useId();

  const { startMinute, endMinute } = model.domain;
  const x = (minute: number): number =>
    PAD.left + ((minute - startMinute) / (endMinute - startMinute)) * PLOT_W;
  const y = (kcal: number): number =>
    PAD.top + PLOT_H * (1 - Math.min(Math.max(kcal, 0), model.yMax) / model.yMax);
  const baseline = y(0);

  const toPath = (points: readonly { minute: number; kcal: number }[]): string =>
    points.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(point.minute)} ${y(point.kcal)}`).join(' ');
  const eatenPath = toPath(model.eaten);
  const planPath = toPath(model.plan);

  const numbered = model.meals.length <= MAX_NUMBERED;
  // Meals eaten close together would sit on top of each other: each one moves to the right of the last.
  const markers = (() => {
    const placed: { x: number; y: number }[] = [];
    return model.meals.map((meal) => {
      let cx = x(meal.minute);
      const cy = y(meal.cumulativeKcal);
      if (numbered) {
        let moved = true;
        while (moved) {
          moved = false;
          for (const other of placed) {
            if (Math.abs(cx - other.x) < MARKER_GAP && Math.abs(cy - other.y) < MARKER_GAP) {
              cx = other.x + MARKER_GAP;
              moved = true;
            }
          }
        }
      }
      placed.push({ x: cx, y: cy });
      return { id: meal.id, cx, cy };
    });
  })();

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
            <svg width="22" height="10" aria-hidden="true">
              <path d="M1 5h20" stroke="var(--muted)" strokeWidth="2" strokeDasharray="5 3" />
            </svg>
            {he.today.legendPlan}
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true">
            <path d="M1 5h20" stroke="var(--muted)" strokeWidth="1" />
          </svg>
          {he.today.legendTarget}
        </li>
      </ul>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        className="h-auto w-full"
        style={{ direction: 'ltr' }}
      >
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

        {/* the recommended path (today only) */}
        {corridorNow && (
          <path
            d={planPath}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="1.75"
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
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
              strokeDasharray="2 3"
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
          </g>
        )}

        {/* what was eaten */}
        <path
          d={eatenPath}
          fill="none"
          stroke="var(--series-1)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {model.now && (
          <circle
            cx={x(model.now.minute)}
            cy={y(model.now.kcal)}
            r={DOT_R + 1}
            fill="var(--series-1)"
            stroke="var(--surface)"
            strokeWidth="2"
          />
        )}

        {/* meals: a numbered marker at each jump of the line */}
        {markers.map((marker, index) => (
          <g key={marker.id}>
            <circle
              cx={marker.cx}
              cy={marker.cy}
              r={numbered ? MARKER_R : DOT_R}
              fill="var(--series-1)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
            {numbered && (
              <text
                x={marker.cx}
                y={marker.cy + 3.5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="var(--surface)"
              >
                {index + 1}
              </text>
            )}
          </g>
        ))}

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

      {model.meals.length > 0 && (
        <ol
          aria-label={he.today.mealsListLabel}
          className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-x-4 gap-y-2"
        >
          {model.meals.map((meal, index) => (
            <li key={meal.id} className="flex min-w-0 items-baseline gap-2 text-base">
              {numbered && (
                <span
                  aria-hidden="true"
                  className="grid size-5 shrink-0 select-none place-items-center self-center rounded-full bg-[var(--series-1)] text-xs font-bold text-[var(--surface)]"
                >
                  {index + 1}
                </span>
              )}
              <span className="min-w-0 break-words">
                {meal.name}{' '}
                <span className="text-sm text-muted">
                  <bdi>{clockAtMinute(model.date, meal.minute, tz)}</bdi>
                </span>
              </span>
              <span className="ms-auto shrink-0 font-semibold">
                <bdi>{formatInt(meal.kcal)}</bdi>
              </span>
            </li>
          ))}
        </ol>
      )}

      <p id={summaryId} className="mt-3 text-base">
        {summary}
        {model.overByKcal > 0 &&
          ` ${he.status.over_budget}: ${formatInt(model.overByKcal)} ${he.kcal}.`}
      </p>
    </figure>
  );
}
