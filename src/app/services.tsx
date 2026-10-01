import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { systemClock, type Clock, type Instant } from '../core/time';
import { browserStorage, createLocalRepositories, type Repositories } from '../data';

/** What the screens depend on: where data lives and what time it is. Tests and, later, Supabase swap these. */
export interface Services {
  repos: Repositories;
  clock: Clock;
  /** False when the browser blocks storage and data lives in memory only. */
  persistent: boolean;
}

const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>');
  return services;
}

export function ServicesProvider({
  children,
  services,
}: {
  children: ReactNode;
  /** Override for tests. */
  services?: Services;
}) {
  const value = useMemo<Services>(() => {
    if (services) return services;
    const { storage, persistent } = browserStorage();
    return {
      repos: createLocalRepositories({ storage, clock: systemClock }),
      clock: systemClock,
      persistent,
    };
  }, [services]);
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

const DEFAULT_TICK_MS = 30_000;

/** The current instant, refreshed every 30 seconds and whenever the tab becomes visible again. */
export function useNow(intervalMs: number = DEFAULT_TICK_MS): Instant {
  const { clock } = useServices();
  const [now, setNow] = useState<Instant>(() => clock.now());
  useEffect(() => {
    const refresh = (): void => setNow(clock.now());
    const timer = setInterval(refresh, intervalMs);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [clock, intervalMs]);
  return now;
}

/** The IANA zone of the device, used to start a new profile. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
