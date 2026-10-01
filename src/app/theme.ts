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
}
