import { useSyncExternalStore } from 'react';
import { currentMode, subscribeDevicePreference, subscribeTheme } from './theme';

function subscribe(listener: () => void): () => void {
  const stopChoice = subscribeTheme(listener);
  const stopDevice = subscribeDevicePreference(listener);
  return () => {
    stopChoice();
    stopDevice();
  };
}

/** Whether the screen is light or dark right now, kept up to date when it changes anywhere in the app. */
export function useThemeMode(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, currentMode, () => 'light');
}
