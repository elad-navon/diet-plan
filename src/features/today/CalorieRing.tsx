import { useId } from 'react';
import { useCountUp } from '../../app/use-count-up';
import { useDesktop } from '../../app/use-media-query';
import { formatInt, he } from '../../i18n/he';

const SIZE = 184;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface CalorieRingProps {
  consumed: number;
  /** Null for days before the first plan: only the total is shown. */
  target: number | null;
}

/** The headline number: calories still available today, drawn as a ring (docs/PRODUCT_SPEC.md C.2). */
export function CalorieRing({ consumed, target }: CalorieRingProps) {
  const gradientId = useId();
  const over = target !== null && consumed > target;
  const fraction = target ? Math.min(consumed / target, 1) : 0;
  const remaining = target === null ? null : target - consumed;
  // The big number counts up on a computer.
  const headline = target === null ? consumed : Math.abs(remaining ?? 0);
  const counted = useCountUp(headline, useDesktop());

  const label =
    target === null
      ? `${he.today.noTarget}. ${formatInt(consumed)} ${he.kcal}`
      : over
        ? `${he.today.ringOver} ${formatInt(consumed - target)} ${he.kcal}. ${he.today.ringEaten(formatInt(consumed), formatInt(target))}`
        : `${he.today.ringRemaining} ${formatInt(remaining ?? 0)} ${he.kcal}. ${he.today.ringEaten(formatInt(consumed), formatInt(target))}`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative size-[184px] lg:size-[clamp(7rem,18vh,11.5rem)]">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={label}
          className="size-full -rotate-90"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--ring-from)" />
              <stop offset="0.55" stopColor="var(--ring-via)" />
              <stop offset="1" stopColor="var(--ring-to)" />
            </linearGradient>
          </defs>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--ring-track)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={over ? 'var(--hero-over)' : `url(#${gradientId})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            style={{
              transition: 'stroke-dashoffset 400ms ease',
              filter: 'drop-shadow(0 0 7px var(--ring-glow))',
            }}
          />
        </svg>
        <div
          aria-hidden="true"
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-5xl font-bold leading-none tracking-tight tabular-nums lg:text-[clamp(1.75rem,5.4vh,3rem)] lg:[text-shadow:0_0_26px_var(--ring-glow)]">
            <bdi>{formatInt(counted)}</bdi>
          </span>
          <span className="mt-1 text-base opacity-90">
            {target === null ? he.kcal : over ? he.today.ringOver : he.today.ringRemaining}
          </span>
        </div>
      </div>
      {target !== null && (
        <p className="text-base opacity-90">
          {he.today.ringEaten(formatInt(consumed), formatInt(target))}
        </p>
      )}
    </div>
  );
}
