import { type DayStatus } from '../../core/recommend';
import { he } from '../../i18n/he';
import { Icon, type IconName } from '../../ui/Icon';

const ICONS: Record<DayStatus, IconName> = {
  on_track: 'check',
  behind: 'clock',
  ahead: 'arrow-up',
  over_budget: 'alert',
  day_complete: 'check',
};

/** A small colored dot marks the status; the icon and the words carry the meaning (never color alone). */
const DOT: Record<DayStatus, string> = {
  on_track: 'bg-good',
  behind: 'bg-warning',
  ahead: 'bg-serious',
  over_budget: 'bg-critical',
  day_complete: 'bg-good',
};

export function StatusChip({ status }: { status: DayStatus }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-base font-semibold text-ink shadow-md">
      <span aria-hidden="true" className={`size-2.5 rounded-full ${DOT[status]}`} />
      <Icon name={ICONS[status]} size={18} />
      {he.status[status]}
    </span>
  );
}
