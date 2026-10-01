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

/** Status colors mark the edge only; the icon and the words carry the meaning (never color alone). */
const EDGE: Record<DayStatus, string> = {
  on_track: 'border-good',
  behind: 'border-warning',
  ahead: 'border-serious',
  over_budget: 'border-critical',
  day_complete: 'border-good',
};

export function StatusChip({ status }: { status: DayStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border-s-4 bg-surface px-3 py-1.5 text-base font-semibold ${EDGE[status]}`}
    >
      <Icon name={ICONS[status]} size={18} />
      {he.status[status]}
    </span>
  );
}
