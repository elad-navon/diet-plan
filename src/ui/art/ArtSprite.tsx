import { useLayoutEffect, useRef } from 'react';
import spriteMarkup from './sprite.svg?raw';

/**
 * The drawings used by the computer layout (meal pictures and the corner decoration), defined once for the whole
 * page and drawn wherever <Art> or <MealArt> points at them. Mounted once, in the app shell. The markup is a file
 * of this project (not user input), put in place before the first paint.
 */
export function ArtSprite() {
  const holder = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (holder.current) holder.current.innerHTML = spriteMarkup;
  }, []);
  return <div ref={holder} aria-hidden="true" />;
}
