import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches right now, kept up to date as the window changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', listener);
      return () => list.removeEventListener('change', listener);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The wide-screen layout (a computer): the same width at which the `lg:` styles apply. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

export function useDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
