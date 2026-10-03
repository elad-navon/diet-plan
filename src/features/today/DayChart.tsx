import { useEffect, useId, useRef, useState } from 'react';
import { useDesktop } from '../../app/use-media-query';
import { type DayChartModel } from '../../core/dayview';
import { type Tz } from '../../core/time';
import { clockAtMinute } from '../../i18n/format';
import { formatInt, he } from '../../i18n/he';
import { CardBackdrop } from '../../ui/art/CardBackdrop';
import { IconTile } from '../../ui/CardTitle';

/** The drawing of a phone: it scales to the width. On a computer it is drawn at the size of its box instead. */
const PHONE_W = 360;
const PHONE_H = 232;
const PHONE_PAD = { left: 40, right: 14, top: 16, bottom: 30 } as const;
/** On a computer the drawing covers the whole card: its top margin is where the heading and the legend are. */
const DESKTOP_PAD = { left: 52, right: 30, top: 66, bottom: 32 } as const;
/** Past this many meals the numbers would crowd the line: plain dots are drawn and the list is not numbered. */
export const MAX_NUMBERED_MEALS = 10;
const MAX_NUMBERED = MAX_NUMBERED_MEALS;
const DOT_R = 4.5;

interface DayChartProps {
  model: DayChartModel;
  tz: Tz;
  /** The recommended range at this moment (today only). */
  corridorNow: { lowerKcal: number; upperKcal: number } | null;
}

/** Y-axis labels at clean steps. */
function yTicks(yMax: number, roomy: boolean): number[] {
  const step = roomy
    ? yMax <= 1800
      ? 200
      : yMax <= 3200
        ? 400
        : 800
    : yMax <= 1200
      ? 200
      : yMax <= 2600
        ? 600
        : 1200;
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
  const lineId = useId();
  const areaId = useId();

  // On a computer the chart fills the box it is given, so the plot uses all of it.
  const desktop = useDesktop();
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const element = boxRef.current;
    if (!desktop || !element) return;
    const watcher = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setBox({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) });
    });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [desktop]);
  const roomy = desktop && box !== null && box.w > 0 && box.h > 0;
  const PAD = roomy ? DESKTOP_PAD : PHONE_PAD;
  const W = roomy ? box.w : PHONE_W;
  const H = roomy ? box.h : PHONE_H;
  const PLOT_W = W - PAD.left - PAD.right;
  const PLOT_H = H - PAD.top - PAD.bottom;
  const fontSize = roomy ? 13 : 11;
  const markerR = roomy ? 10.5 : 8.5;
  /** Two numbered markers closer than this would hide each other's number. */
  const markerGap = 2 * markerR + 1;

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
            // The small allowance keeps rounding from reading "exactly one gap away" as "too close", forever.
            if (
              Math.abs(cx - other.x) < markerGap - 1e-6 &&
              Math.abs(cy - other.y) < markerGap - 1e-6
            ) {
              cx = other.x + markerGap;
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
    <figure
      aria-labelledby={titleId}
      className="card p-5 lg:relative lg:isolate lg:flex lg:flex-col lg:overflow-hidden lg:panel-dark lg:p-4"
    >
      <CardBackdrop name="chart" />
      <div className="lg:relative lg:z-10 lg:mb-2 lg:flex lg:flex-none lg:items-baseline lg:justify-between lg:gap-4">
        <figcaption
          id={titleId}
          className="mb-2 flex items-center gap-2.5 text-xl font-bold lg:mb-0 lg:text-lg lg:[text-shadow:0_1px_8px_var(--text-halo)]"
        >
          <IconTile icon="trend" tone="cyan" />
          {he.today.chartTitle}
        </figcaption>

        <ul
          className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted lg:mb-0 lg:[text-shadow:0_1px_8px_var(--text-halo)]"
          aria-label="מקרא"
        >
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
      </div>

      <div ref={boxRef} className="lg:absolute lg:inset-0">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={summaryId}
          className="h-auto w-full lg:absolute lg:inset-0 lg:size-full"
          style={{ direction: 'ltr' }}
        >
          <defs>
            <linearGradient
              id={lineId}
              gradientUnits="userSpaceOnUse"
              x1={PAD.left}
              y1="0"
              x2={W - PAD.right}
              y2="0"
            >
              <stop offset="0" stopColor="var(--chart-from)" />
              <stop offset="1" stopColor="var(--chart-to)" />
            </linearGradient>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--chart-area)" />
              <stop offset="1" stopColor="var(--chart-area)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* grid and Y labels */}
          {yTicks(model.yMax, roomy).map((tick) => (
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
                fontSize={fontSize}
                fill="var(--muted)"
                stroke="var(--text-halo)"
                strokeWidth="3"
                paintOrder="stroke"
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
              key={tick.minute}
              x={x(tick.minute)}
              y={H - 10}
              textAnchor="middle"
              fontSize={fontSize}
              fill="var(--muted)"
              stroke="var(--text-halo)"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {tick.label}
            </text>
          ))}

          {/* the recommended path (today only), with a soft glow of color under it */}
          {corridorNow && (
            <>
              <path
                d={`${planPath} L${x(model.plan[model.plan.length - 1]?.minute ?? endMinute)} ${baseline} L${x(model.plan[0]?.minute ?? startMinute)} ${baseline} Z`}
                fill={`url(#${areaId})`}
                stroke="none"
              />
              <path
                d={planPath}
                fill="none"
                stroke="var(--muted)"
                strokeWidth="1.75"
                strokeDasharray="5 4"
                strokeLinejoin="round"
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
          <text
            x={W - PAD.right}
            y={targetY - 5}
            textAnchor="end"
            fontSize={fontSize}
            fill="var(--muted)"
            stroke="var(--text-halo)"
            strokeWidth="3"
            paintOrder="stroke"
          >
            {`${he.today.legendTarget} ${formatInt(model.targetKcal)}`}
          </text>

          {/* the suggested next meal: from what is eaten up to what is still available (a computer only) */}
          {roomy && model.next && (
            <g className="fade-in" style={{ filter: 'drop-shadow(0 0 6px var(--chart-next))' }}>
              <line
                x1={x(model.next.minute)}
                x2={x(model.next.minute)}
                y1={y(model.next.fromKcal)}
                y2={y(model.next.toKcal)}
                stroke="var(--chart-next)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d={`M${x(model.next.minute)} ${y(model.next.toKcal) - 8}l7 8-7 8-7-8z`}
                fill="var(--chart-next)"
                stroke="var(--surface)"
                strokeWidth="2"
              />
            </g>
          )}

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
                fontSize={fontSize}
                fill="var(--muted)"
                stroke="var(--text-halo)"
                strokeWidth="3"
                paintOrder="stroke"
              >
                {he.today.now}
              </text>
            </g>
          )}

          {/* what was eaten */}
          <path
            d={eatenPath}
            pathLength={1}
            fill="none"
            stroke={`url(#${lineId})`}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="lg:draw-line"
            style={{ filter: 'drop-shadow(0 0 5px var(--chart-glow))' }}
          />

          {model.now && (
            <circle
              cx={x(model.now.minute)}
              cy={y(model.now.kcal)}
              r={DOT_R + 1}
              fill="var(--marker-fill)"
              stroke="var(--marker-ring)"
              strokeWidth="2"
              style={{ filter: 'drop-shadow(0 0 5px var(--chart-glow))' }}
            />
          )}

          {/* meals: a numbered marker at each jump of the line */}
          {markers.map((marker, index) => (
            <g key={marker.id}>
              <circle
                cx={marker.cx}
                cy={marker.cy}
                r={numbered ? markerR : DOT_R}
                fill="var(--marker-fill)"
                stroke="var(--marker-ring)"
                strokeWidth="2"
                style={{ filter: 'drop-shadow(0 0 6px var(--chart-glow))' }}
              />
              {numbered && (
                <text
                  x={marker.cx}
                  y={marker.cy + 3.5}
                  textAnchor="middle"
                  fontSize={roomy ? 12 : 10}
                  fontWeight="700"
                  fill="var(--marker-ink)"
                >
                  {index + 1}
                </text>
              )}
            </g>
          ))}

          {/* total above the visible range */}
          {model.clippedAtMax && (
            <g>
              <path
                d={`M${W - PAD.right - 8} ${PAD.top + 10}l6-10 6 10z`}
                fill="var(--ink)"
                stroke="var(--text-halo)"
                strokeWidth="3"
                paintOrder="stroke"
              />
              <text
                x={W - PAD.right - 18}
                y={PAD.top + 9}
                textAnchor="end"
                fontSize={fontSize}
                fill="var(--ink)"
                stroke="var(--text-halo)"
                strokeWidth="3"
                paintOrder="stroke"
              >
                {formatInt(model.totalKcal)}
              </text>
            </g>
          )}
        </svg>
      </div>

      {model.meals.length > 0 && (
        <ol
          aria-label={he.today.mealsListLabel}
          className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-x-4 gap-y-2 lg:hidden"
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

      <p id={summaryId} className="mt-3 text-base lg:sr-only">
        {summary}
        {model.overByKcal > 0 &&
          ` ${he.status.over_budget}: ${formatInt(model.overByKcal)} ${he.kcal}.`}
      </p>
    </figure>
  );
}
