import { useEffect, useRef, useState } from 'react';

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that counts up to its value (and from the old value to a new one). With `enabled` false, or when the
 * person asked for less motion, it simply is the value.
 */
export function useCountUp(target: number, enabled: boolean, durationMs = 850): number {
  const calm = !enabled || reducedMotion();
  const [shown, setShown] = useState(calm ? target : 0);
  const current = useRef(calm ? target : 0);

  useEffect(() => {
    if (calm) {
      current.current = target;
      return;
    }
    const from = current.current;
    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      current.current = from + (target - from) * eased;
      setShown(Math.round(current.current));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, calm, durationMs]);

  return calm ? target : shown;
}
