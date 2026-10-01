import { type DataErrorCode } from '../data';
import { he } from './he';

/** The message for a failed save, by cause. Callers pass their own text for the codes they handle specially. */
export function dataErrorMessage(code: DataErrorCode | null): string {
  switch (code) {
    case 'network':
      return he.dataErrors.offline;
    case 'unauthenticated':
      return he.dataErrors.signedOut;
    case 'server':
      return he.dataErrors.server;
    case 'in_future':
      return he.dataErrors.timeInFuture;
    case 'too_old':
      return he.dataErrors.timeTooOld;
    case 'no_profile':
      return he.dataErrors.noProfile;
    case 'plan_in_past':
      return he.dataErrors.planInPast;
    case 'limit_reached':
      return he.addMeal.limitReached;
    case 'version_conflict':
      return he.today.conflict;
    default:
      return he.genericError;
  }
}
