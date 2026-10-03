export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'diet-plan.theme';

export function getTheme(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

const listeners = new Set<() => void>();

/** Called after every change of the light/dark choice, wherever it was made (the side bar and Settings both set it). */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `system` follows the device (no attribute); `light`/`dark` override it (see the tokens in index.css). */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  try {
    if (choice === 'system') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice);
  } catch {
    // The choice still applies for this visit.
  }
  for (const listener of listeners) listener();
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The mode on screen right now: the explicit choice, or else what the device prefers. */
export function currentMode(): 'light' | 'dark' {
  const attribute = document.documentElement.getAttribute('data-theme');
  if (attribute === 'light' || attribute === 'dark') return attribute;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Re-run `listener` when the device's own preference changes (only matters while the choice is "system"). */
export function subscribeDevicePreference(listener: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
