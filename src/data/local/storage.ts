/** The slice of the Web Storage API the app uses, so tests (and a blocked browser) can swap it out. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

/**
 * The browser's localStorage when it works, else memory (private windows, blocked site data): the app
 * keeps running for the session instead of crashing, and `persistent` tells the UI to warn the user.
 */
export function browserStorage(): { storage: KeyValueStorage; persistent: boolean } {
  try {
    // Written at the size of a real value: some browsers allow a tiny write but refuse anything bigger.
    const probe = '__diet_plan_probe__';
    window.localStorage.setItem(probe, 'x'.repeat(4096));
    window.localStorage.removeItem(probe);
    return { storage: window.localStorage, persistent: true };
  } catch {
    return { storage: new MemoryStorage(), persistent: false };
  }
}
