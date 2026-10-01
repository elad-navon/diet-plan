import { type Instant } from './clock';

/** An instant as an ISO-8601 UTC string, the format the server stores and returns. */
export function formatInstant(instant: Instant): string {
  return new Date(instant).toISOString();
}

/** Reads an ISO-8601 timestamp (any offset) the server returned. Throws on anything that is not one. */
export function parseInstant(value: string): Instant {
  const instant = Date.parse(value);
  if (Number.isNaN(instant)) throw new RangeError(`Invalid timestamp: ${value}`);
  return instant;
}
