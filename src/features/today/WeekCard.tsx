import { type RangeSummary } from '../../core/dayview';
import { type LocalDate, type Tz } from '../../core/time';
import { formatDayMonth, weekdayInitial } from '../../i18n/format';
import { formatInt, he } from '../../i18n/he';
import { CardTitle } from '../../ui/CardTitle';

interface WeekCardProps {
  range: RangeSummary;
  tz: Tz;
  today: LocalDate;
  /** The day the screen is showing. */
  selected: LocalDate;
  onSelect: (date: LocalDate) => void;
}

/**
 * The last seven days on the day screen of a computer: calories per day as bars, each against that day's own
 * target (the thin line across the bar). A day with entries can be clicked, and then the whole screen shows that
 * day; the day on screen has a bar of another color, and a little wider, and today has a small dot under it. A day without
 * entries is a small ring. The calories have a scale on the left, with a faint line at each step, and the time
 * runs left to right, as in the other charts.
 */
export function WeekCard({ range, tz, today, selected, onSelect }: WeekCardProps) {
  const peak = Math.max(0, ...range.days.map((day) => Math.max(day.kcal, day.kcalTarget ?? 0)));
  // The scale on the left: about five steps of a round size (200, 400, ...), up to just above the highest bar.
  const rough = Math.max(200, peak * 1.12);
  const step = Math.max(200, Math.ceil(rough / 5 / 200) * 200);
  const yMax = Math.ceil(rough / step) * step;
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const percent = (kcal: number): number => (Math.min(kcal, yMax) / yMax) * 100;
  const average = range.averageKcalLogged;
  const summary =
    average === null
      ? he.progress.weekNone
      : he.progress.weekAverage(formatInt(average), range.daysLogged);

  return (
    <section
      aria-labelledby="week-title"
      className="card relative flex flex-col overflow-hidden p-4"
    >
      <div className="mb-2 flex flex-none items-baseline justify-between gap-3">
        <CardTitle id="week-title" icon="week" tone="mint" className="text-lg font-bold">
          {he.today.weekTitle}
        </CardTitle>
        <p className="text-sm text-muted">{he.today.weekHint}</p>
      </div>

      <div className="relative min-h-0 flex-1" style={{ direction: 'ltr' }}>
        <div className="absolute inset-0 grid grid-cols-[2.6rem_minmax(0,1fr)] gap-x-1.5">
          {/* the scale: the numbers on the left, a faint line behind the bars at each of them */}
          <div aria-hidden="true" className="grid grid-rows-[minmax(0,1fr)_1.75rem]">
            <div className="relative">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute end-0 translate-y-1/2 text-xs tabular-nums text-muted"
                  style={{ bottom: `${percent(tick)}%` }}
                >
                  {formatInt(tick)}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            <div aria-hidden="true" className="absolute inset-x-0 top-0 bottom-[1.75rem]">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute inset-x-0 border-t border-faint"
                  style={{ bottom: `${percent(tick)}%` }}
                />
              ))}
            </div>
            <ol className="absolute inset-0 grid grid-cols-7 gap-1">
              {range.days.map((day) => {
                const chosen = day.date === selected;
                const isToday = day.date === today;
                const column = (
                  <>
                    <div className="relative">
                      {day.logged ? (
                        <>
                          <div
                            className={`absolute bottom-0 rounded-t-md transition lg:grow-y ${
                              chosen
                                ? 'inset-x-[12%] [background:var(--week-bar-chosen)] shadow-[0_0_18px_var(--week-glow)]'
                                : isToday
                                  ? 'inset-x-[18%] [background:var(--week-bar-now)]'
                                  : 'inset-x-[18%] [background:var(--week-bar)]'
                            }`}
                            style={{ height: `${percent(day.kcal)}%` }}
                          />
                          <span
                            className="absolute inset-x-0 text-center text-xs font-semibold tabular-nums"
                            style={{ bottom: `calc(${percent(day.kcal)}% + 2px)` }}
                          >
                            {formatInt(day.kcal)}
                          </span>
                        </>
                      ) : (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-1 start-1/2 size-2.5 -translate-x-1/2 rounded-full border-[1.5px] border-muted"
                        />
                      )}
                      {day.kcalTarget !== null && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 border-t border-ink/60"
                          style={{ bottom: `${percent(day.kcalTarget)}%` }}
                        />
                      )}
                    </div>
                    <span
                      className={`flex flex-col items-center justify-center text-xs ${
                        chosen ? 'font-bold text-ink' : 'text-muted'
                      }`}
                    >
                      {weekdayInitial(day.date)}
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 size-1 rounded-full ${isToday ? 'bg-muted' : 'bg-transparent'}`}
                      />
                    </span>
                  </>
                );
                const base =
                  'grid h-full w-full min-w-0 grid-rows-[minmax(0,1fr)_1.75rem] rounded-xl px-0.5';
                return (
                  <li key={day.date} className="min-w-0">
                    {day.logged ? (
                      <button
                        type="button"
                        aria-pressed={chosen}
                        aria-label={he.today.weekPick(
                          formatDayMonth(day.date, tz),
                          formatInt(day.kcal),
                        )}
                        onClick={() => onSelect(day.date)}
                        className={`${base} cursor-pointer transition ${chosen ? '' : 'hover:bg-surface-2/70'}`}
                      >
                        {column}
                      </button>
                    ) : (
                      <div className={base}>
                        {column}
                        <span className="sr-only">
                          {formatDayMonth(day.date, tz)}: {he.progress.notLogged}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>

      <p className="mt-2 flex-none text-sm text-muted">{summary}</p>
    </section>
  );
}
