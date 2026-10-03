import { type DaySummary } from '../../core/dayview';
import { ADDED_SUGAR_BANDS, sugarBand, type SugarBand } from '../../core/food';
import { formatDecimal, he } from '../../i18n/he';
import { CardTitle } from '../../ui/CardTitle';
import { Icon, type IconName } from '../../ui/Icon';

/** The meter runs a little past the last band edge, so a high day shows as "beyond", not as a full bar. */
const METER_MAX_G = 40;

/** Status is told by the words and the icon; the tint of the zone is only a hint (never color alone). */
const BAND_ICON: Record<SugarBand, IconName> = { very_low: 'check', ok: 'check', review: 'alert' };

interface SugarCardProps {
  summary: DaySummary;
}

/** Added sugar today against the person's own three bands: very low, fits a balanced diet, worth a look. */
export function SugarCard({ summary }: SugarCardProps) {
  const { addedSugarG, sugarCoverage } = summary;
  const band = sugarBand(addedSugarG);
  const { veryLowMaxG, okMaxG } = ADDED_SUGAR_BANDS;
  const percent = (grams: number): number => Math.min(100, (grams / METER_MAX_G) * 100);
  const missing = sugarCoverage.meals - sugarCoverage.mealsWithSugar;
  const label = he.sugar.summary(
    formatDecimal(addedSugarG),
    he.sugar.band[band],
    String(veryLowMaxG),
    String(okMaxG),
  );

  return (
    <section aria-labelledby="sugar-title" className="card p-5 lg:p-4">
      <CardTitle id="sugar-title" icon="cube" tone="blue" className="text-xl font-bold lg:text-lg">
        {he.sugar.title}
      </CardTitle>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-4xl font-bold leading-none tabular-nums lg:text-3xl">
          <bdi>{formatDecimal(addedSugarG)}</bdi>
          <span className="ms-1 text-base font-normal text-muted">{he.gramsShort}</span>
        </p>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-base font-semibold">
          <Icon name={BAND_ICON[band]} size={18} />
          {he.sugar.band[band]}
        </p>
      </div>

      <div role="img" aria-label={label} className="relative mt-4 pb-6 lg:mt-3">
        <div className="flex h-3 overflow-hidden rounded-full">
          <div className="bg-good/30" style={{ width: `${percent(veryLowMaxG)}%` }} />
          <div
            className="bg-warning/40"
            style={{ width: `${percent(okMaxG) - percent(veryLowMaxG)}%` }}
          />
          <div className="bg-serious/40" style={{ width: `${100 - percent(okMaxG)}%` }} />
        </div>
        <span
          aria-hidden="true"
          className="absolute -top-1 size-5 -translate-x-1/2 rounded-full border-2 border-surface bg-ink shadow rtl:translate-x-1/2"
          style={{ insetInlineStart: `${percent(addedSugarG)}%` }}
        />
        {[veryLowMaxG, okMaxG].map((edge) => (
          <span
            key={edge}
            aria-hidden="true"
            className="absolute top-4 text-xs text-muted tabular-nums -translate-x-1/2 rtl:translate-x-1/2"
            style={{ insetInlineStart: `${percent(edge)}%` }}
          >
            {edge}
          </span>
        ))}
      </div>

      <p className="text-sm text-muted lg:hidden">{he.sugar.note}</p>
      {missing > 0 && sugarCoverage.meals > 0 && (
        <p className="mt-1 text-sm text-muted lg:text-xs">
          {he.sugar.coverage(sugarCoverage.mealsWithSugar, sugarCoverage.meals)}
        </p>
      )}

      <details className="mt-2 text-sm text-muted lg:hidden">
        <summary className="min-h-11 cursor-pointer py-2 font-medium text-accent">
          {he.sugar.howTitle}
        </summary>
        <ul className="list-disc space-y-1 ps-5">
          {he.sugar.how.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
