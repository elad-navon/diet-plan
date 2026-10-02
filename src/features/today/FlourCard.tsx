import { type GrainDay } from '../../core/food';
import { formatDecimal, he } from '../../i18n/he';

interface FlourCardProps {
  grain: GrainDay;
}

/** White flour against whole grain today, by the carbohydrate of each; with what to try instead of the white. */
export function FlourCard({ grain }: FlourCardProps) {
  const { refinedCarbsG, wholeCarbsG, swaps } = grain;
  const total = refinedCarbsG + wholeCarbsG;
  const refinedPercent = total > 0 ? (refinedCarbsG / total) * 100 : 0;
  const label = he.flour.summary(formatDecimal(refinedCarbsG), formatDecimal(wholeCarbsG));

  return (
    <section aria-labelledby="flour-title" className="card p-5">
      <h2 id="flour-title" className="text-xl font-bold">
        {he.flour.title}
      </h2>

      {total === 0 ? (
        <p className="mt-2 text-muted">{he.flour.empty}</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-4xl font-bold leading-none tabular-nums">
              <bdi>{formatDecimal(refinedCarbsG)}</bdi>
              <span className="ms-1 text-base font-normal text-muted">{he.flour.carbsUnit}</span>
            </p>
            <p className="text-base text-muted">
              {he.flour.wholeLabel}: <bdi>{formatDecimal(wholeCarbsG)}</bdi> {he.gramsShort}
            </p>
          </div>

          <div role="img" aria-label={label} className="mt-4">
            <div className="flex h-3 overflow-hidden rounded-full">
              <div className="bg-warning/50" style={{ width: `${refinedPercent}%` }} />
              <div className="bg-good/40" style={{ width: `${100 - refinedPercent}%` }} />
            </div>
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-3 rounded-full bg-warning/50" />
              {he.flour.refined}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-3 rounded-full bg-good/40" />
              {he.flour.whole}
            </span>
          </p>
        </>
      )}

      {swaps.length > 0 && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-base">
          <p className="font-semibold">{he.flour.swapTitle}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5">
            {swaps.map((kind) => (
              <li key={kind}>{he.flour.swap[kind]}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-sm text-muted">{he.flour.note}</p>

      <details className="mt-1 text-sm text-muted">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-accent">
          {he.flour.howTitle}
        </summary>
        <ul className="list-disc space-y-1 ps-5">
          {he.flour.how.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
