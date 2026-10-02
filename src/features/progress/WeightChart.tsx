import { useId } from 'react';
import { monthTicks, type DayKg, type WeightChartModel } from '../../core/progress';
import { type Tz } from '../../core/time';
import { formatMonthLabel } from '../../i18n/format';
import { formatDecimal, he } from '../../i18n/he';

const W = 360;
const H = 220;
const PAD = { left: 40, right: 14, top: 16, bottom: 30 } as const;
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

interface WeightChartProps {
  model: WeightChartModel;
  tz: Tz;
  /** One-line text description for screen readers. */
  summary: string;
  /** Show the weigh-in series and its legend entries (hidden during onboarding). */
  showWeighIns?: boolean;
}

function yTicks(min: number, max: number): number[] {
  const span = max - min;
  const step = span <= 8 ? 1 : span <= 16 ? 2 : 5;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) ticks.push(value);
  return ticks;
}

/**
 * Weight over time with the plan's projection as an estimate, drawn as a dashed line inside an
 * uncertainty cone (never as a promise - docs/NUTRITION_RULES.md F.5). Raw weigh-ins are small dots; the
 * smoothed trend is the line to read progress from.
 */
export function WeightChart({ model, tz, summary, showWeighIns = true }: WeightChartProps) {
  const titleId = useId();
  const descId = useId();
  const { startDay, endDay } = model.domain;
  const x = (day: number): number => PAD.left + ((day - startDay) / (endDay - startDay)) * PLOT_W;
  const y = (kg: number): number =>
    PAD.top +
    PLOT_H *
      (1 -
        (Math.min(Math.max(kg, model.yMin), model.yMax) - model.yMin) / (model.yMax - model.yMin));
  const path = (points: readonly DayKg[]): string =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day)} ${y(p.kg)}`).join(' ');

  const cone = model.plan
    ? `${path(model.plan.fast)} ${[...model.plan.slow]
        .reverse()
        .map((p) => `L${x(p.day)} ${y(p.kg)}`)
        .join(' ')} Z`
    : null;

  const xTicks = monthTicks(startDay, endDay);
  const hasTrend = showWeighIns && model.trend.length > 0;

  return (
    <figure className="card p-5">
      <figcaption id={titleId} className="mb-2 text-lg font-bold">
        {he.progress.weightTitle}
      </figcaption>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="מקרא">
        {hasTrend && (
          <>
            <li className="flex items-center gap-1.5">
              <svg width="22" height="10" aria-hidden="true">
                <circle cx="11" cy="5" r="3.5" fill="var(--muted)" />
              </svg>
              {he.progress.legendWeighIn}
            </li>
            <li className="flex items-center gap-1.5">
              <svg width="22" height="10" aria-hidden="true">
                <path d="M1 5h20" stroke="var(--series-1)" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {he.progress.legendTrend}
            </li>
          </>
        )}
        {model.plan && (
          <>
            <li className="flex items-center gap-1.5">
              <svg width="22" height="10" aria-hidden="true">
                <path d="M1 5h20" stroke="var(--series-2)" strokeWidth="2" strokeDasharray="5 3" />
              </svg>
              {he.progress.legendPlan}
            </li>
            <li className="flex items-center gap-1.5">
              <svg width="22" height="12" aria-hidden="true">
                <rect
                  x="1"
                  y="1"
                  width="20"
                  height="10"
                  fill="var(--series-2)"
                  fillOpacity="0.18"
                />
              </svg>
              {he.progress.legendCone}
            </li>
          </>
        )}
      </ul>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="h-auto w-full"
        style={{ direction: 'ltr' }}
      >
        {yTicks(model.yMin, model.yMax).map((tick) => (
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
              {formatDecimal(tick)}
            </text>
          </g>
        ))}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(model.yMin)}
          y2={y(model.yMin)}
          stroke="var(--axis)"
          strokeWidth="1"
        />
        {xTicks.map((tick) => (
          <text
            key={tick.day}
            x={x(tick.day)}
            y={H - 10}
            textAnchor={tick.edge ? 'start' : x(tick.day) > W - PAD.right - 26 ? 'end' : 'middle'}
            fontSize="11"
            fill="var(--muted)"
          >
            {formatMonthLabel(tick.date, tz, tick.showYear)}
          </text>
        ))}

        {model.plan && (
          <>
            {cone && <path d={cone} fill="var(--series-2)" fillOpacity="0.18" stroke="none" />}
            {model.plan.targetVisible && (
              <>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(model.plan.targetKg)}
                  y2={y(model.plan.targetKg)}
                  stroke="var(--muted)"
                  strokeWidth="1"
                />
                <text
                  x={W - PAD.right}
                  y={y(model.plan.targetKg) - 5}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--muted)"
                >
                  {`${he.progress.legendTargetLine} ${formatDecimal(model.plan.targetKg)}`}
                </text>
              </>
            )}
          </>
        )}

        {model.earlier.map((line, i) => (
          <path
            key={i}
            d={path(line)}
            fill="none"
            stroke="var(--muted)"
            strokeOpacity="0.5"
            strokeWidth="1"
          />
        ))}
        {model.plan && (
          <path
            d={path(model.plan.line)}
            fill="none"
            stroke="var(--series-2)"
            strokeWidth="2"
            strokeDasharray="6 4"
            strokeLinecap="round"
          />
        )}

        {/* today */}
        <line
          x1={x(model.todayDay)}
          x2={x(model.todayDay)}
          y1={PAD.top}
          y2={y(model.yMin)}
          stroke="var(--muted)"
          strokeWidth="1"
          strokeOpacity="0.7"
        />
        <text
          x={x(model.todayDay)}
          y={PAD.top - 4}
          textAnchor={
            x(model.todayDay) < PAD.left + 24
              ? 'start'
              : x(model.todayDay) > W - PAD.right - 24
                ? 'end'
                : 'middle'
          }
          fontSize="11"
          fill="var(--muted)"
        >
          {he.progress.today}
        </text>

        {hasTrend && (
          <>
            <path
              d={path(model.trend)}
              fill="none"
              stroke="var(--series-1)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {model.weights.map((w) => (
              <circle
                key={w.date}
                cx={x(w.day)}
                cy={y(w.kg)}
                r="3.5"
                fill="var(--muted)"
                stroke="var(--surface)"
                strokeWidth="2"
              />
            ))}
            {(() => {
              const last = model.trend[model.trend.length - 1];
              return last ? (
                <circle
                  cx={x(last.day)}
                  cy={y(last.kg)}
                  r="5"
                  fill="var(--series-1)"
                  stroke="var(--surface)"
                  strokeWidth="2"
                />
              ) : null;
            })()}
          </>
        )}
      </svg>
      <p id={descId} className="mt-2 text-base">
        {summary}
      </p>
    </figure>
  );
}
