import { formatInt, he } from '../../i18n/he';

const SIZE = 168;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface CalorieRingProps {
  consumed: number;
  /** Null for days before the first plan: only the total is shown. */
  target: number | null;
}

/** The headline number: calories still available today, drawn as a ring (docs/PRODUCT_SPEC.md C.2). */
export function CalorieRing({ consumed, target }: CalorieRingProps) {
  const over = target !== null && consumed > target;
  const fraction = target ? Math.min(consumed / target, 1) : 0;
  const remaining = target === null ? null : target - consumed;

  const label =
    target === null
      ? `${he.today.noTarget}. ${formatInt(consumed)} ${he.kcal}`
      : over
        ? `${he.today.ringOver} ${formatInt(consumed - target)} ${he.kcal}. ${he.today.ringEaten(formatInt(consumed), formatInt(target))}`
        : `${he.today.ringRemaining} ${formatInt(remaining ?? 0)} ${he.kcal}. ${he.today.ringEaten(formatInt(consumed), formatInt(target))}`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={label}
          className="-rotate-90"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--faint)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={over ? 'var(--critical)' : 'var(--series-1)'}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            style={{ transition: 'stroke-dashoffset 400ms ease' }}
          />
        </svg>
        <div
          aria-hidden="true"
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-5xl font-bold leading-none">
            <bdi>{target === null ? formatInt(consumed) : formatInt(Math.abs(remaining ?? 0))}</bdi>
          </span>
          <span className="mt-1 text-base text-muted">
            {target === null ? he.kcal : over ? he.today.ringOver : he.today.ringRemaining}
          </span>
        </div>
      </div>
      {target !== null && (
        <p className="text-base text-muted">
          {he.today.ringEaten(formatInt(consumed), formatInt(target))}
        </p>
      )}
    </div>
  );
}
