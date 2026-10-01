import { useSyncExternalStore } from 'react';

/**
 * The installable-app plumbing: the service worker (offline shell, updates) and the "install" prompt.
 * Updates are never applied by themselves: a new version waits behind a banner until the person taps
 * it, so a reload cannot wipe a half-typed meal.
 */

const HOUR_MS = 3_600_000;

interface PwaState {
  /** A newer version of the app has been downloaded and is waiting. */
  updateReady: boolean;
}

let state: PwaState = { updateReady: false };
const listeners = new Set<() => void>();
let applyUpdate: (() => Promise<void>) | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function setState(next: PwaState): void {
  state = next;
  notify();
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Registers the service worker (production builds only; during development it would only get in the way). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh: () => setState({ updateReady: true }),
      onRegisteredSW: (_url, registration) => {
        if (!registration) return;
        // Look for a new version now and then, and whenever the app comes back into view.
        setInterval(() => void registration.update(), HOUR_MS);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update();
        });
      },
    });
    applyUpdate = () => update(true);
  });
}

export function usePwaUpdate(): { updateReady: boolean; applyUpdate: () => void } {
  const current = useSyncExternalStore(subscribe, () => state);
  return { updateReady: current.updateReady, applyUpdate: () => void applyUpdate?.() };
}

// --- install prompt -------------------------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: BeforeInstallPromptEvent | null = null;
let installSnapshot = { canPrompt: false };

function setInstallEvent(event: BeforeInstallPromptEvent | null): void {
  installEvent = event;
  installSnapshot = { canPrompt: event !== null };
  notify();
}

/** Remembers the install offer of the browser, so Settings can show a button for it. */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    setInstallEvent(event as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => setInstallEvent(null));
}

export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone;
}

/** iPhones and iPads never offer the install prompt; people have to use the share menu of Safari. */
export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function useInstall(): { canPrompt: boolean; prompt: () => Promise<void> } {
  const current = useSyncExternalStore(subscribe, () => installSnapshot);
  return {
    canPrompt: current.canPrompt,
    prompt: async () => {
      const event = installEvent;
      if (!event) return;
      await event.prompt();
      await event.userChoice;
      setInstallEvent(null);
    },
  };
}

// --- connection ---------------------------------------------------------------------------

const subscribeOnline = (listener: () => void): (() => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

/** Whether the browser thinks it has a connection (a hint: the server call is the real test). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}
