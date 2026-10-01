import { type UseQueryResult } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { he } from '../../i18n/he';
import { Button } from '../../ui/Button';

/**
 * Shows the screen only once its data has really arrived. Without this, "still loading" or "could not load"
 * would look exactly like "nothing logged yet", and someone might log the same meal twice.
 * A failed refresh keeps showing the data already on screen.
 */
export function LoadGate({
  queries,
  children,
}: {
  queries: readonly UseQueryResult[];
  children: ReactNode;
}) {
  if (queries.some((q) => q.data === undefined && q.isPending)) {
    return (
      <p role="status" className="p-6 text-muted">
        {he.loading}
      </p>
    );
  }
  const failed = queries.find((q) => q.data === undefined && q.isError);
  if (failed) {
    return (
      <div role="alert" className="space-y-3 p-6">
        <p>{he.loadFailed}</p>
        <Button
          onClick={() => {
            for (const q of queries) if (q.isError) void q.refetch();
          }}
        >
          {he.retry}
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
