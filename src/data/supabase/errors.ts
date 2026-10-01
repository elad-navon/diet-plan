import { DataError, type DataErrorCode } from '../types';
import { ServerError } from './gateway';

/** What our database functions raise (supabase/migrations) -> what the screens understand. */
const MESSAGE_CODES: readonly [RegExp, DataErrorCode][] = [
  [/version_conflict/, 'version_conflict'],
  [/id_conflict/, 'id_conflict'],
  [/not_found/, 'not_found'],
  [/limit_reached/, 'limit_reached'],
  [/no_profile/, 'no_profile'],
  [/plan_in_past/, 'plan_in_past'],
  [/eaten_at_in_future|measured_at_in_future/, 'in_future'],
  [/eaten_at_too_old/, 'too_old'],
  [/invalid_timezone|age_under_18/, 'invalid'],
  [/unauthenticated|JWT|PGRST30\d/i, 'unauthenticated'],
];

/** Translates anything thrown while talking to the server into a DataError. */
export function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  if (!(error instanceof ServerError)) {
    return new DataError('server', error instanceof Error ? error.message : String(error));
  }
  for (const [pattern, code] of MESSAGE_CODES) {
    if (pattern.test(error.message)) return new DataError(code, error.message);
  }
  if (error.status === 0) return new DataError('network', error.message);
  if (error.status === 401 || error.sqlState === '28000' || error.sqlState === '42501') {
    return new DataError('unauthenticated', error.message);
  }
  // 22xxx = bad value, 23xxx = a rule of the table was broken (range, format, required).
  if (/^(22|23)/.test(error.sqlState) && error.sqlState !== '23505') {
    return new DataError('invalid', error.message);
  }
  return new DataError('server', error.message);
}
