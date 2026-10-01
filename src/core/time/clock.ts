/** Epoch milliseconds (UTC). The only representation of "a moment" outside core/time. */
export type Instant = number;

/**
 * All "now" lookups go through a Clock so tests can pin time and the app can correct for a wrong
 * device clock (docs/ARCHITECTURE.md D.1, D.2). Nothing outside core/time may call Date.now().
 */
export interface Clock {
  now(): Instant;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export function fixedClock(instant: Instant): Clock {
  return { now: () => instant };
}

/** Shifts a clock by a measured server skew: `now = base.now() + offsetMs`. */
export function offsetClock(base: Clock, offsetMs: number): Clock {
  return { now: () => base.now() + offsetMs };
}
