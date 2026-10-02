import { describe, expect, it } from 'vitest';
import { MemoryStorage, resilientStorage, type KeyValueStorage } from './storage';

/** A browser that allows reading but refuses every write, like blocked site data in a privacy-focused browser. */
class RefusingStorage implements KeyValueStorage {
  getItem(): string | null {
    return null;
  }
  setItem(): void {
    throw new DOMException('Setting the value exceeded the quota.', 'QuotaExceededError');
  }
  removeItem(): void {
    throw new DOMException('blocked', 'SecurityError');
  }
}

describe('resilient storage (the sign-in must survive a browser that refuses to store it)', () => {
  it('passes everything through to the browser when it works', () => {
    const browser = new MemoryStorage();
    const { storage, persistent } = resilientStorage(browser);
    storage.setItem('k', 'v');
    expect(browser.getItem('k')).toBe('v');
    expect(storage.getItem('k')).toBe('v');
    expect(persistent()).toBe(true);
    storage.removeItem('k');
    expect(browser.getItem('k')).toBeNull();
  });

  it('keeps the value in memory when the browser refuses it, and reports that it is not persistent', () => {
    const { storage, persistent } = resilientStorage(new RefusingStorage());
    expect(() => storage.setItem('diet-plan.auth', '{"session":1}')).not.toThrow();
    expect(storage.getItem('diet-plan.auth')).toBe('{"session":1}');
    expect(persistent()).toBe(false);
    expect(() => storage.removeItem('diet-plan.auth')).not.toThrow();
    expect(storage.getItem('diet-plan.auth')).toBeNull();
  });

  it('does not let a stale in-memory copy hide a newer value that reached the browser', () => {
    const browser = new MemoryStorage();
    let refuse = true;
    const flaky: KeyValueStorage = {
      getItem: (key) => browser.getItem(key),
      setItem: (key, value) => {
        if (refuse) throw new DOMException('quota', 'QuotaExceededError');
        browser.setItem(key, value);
      },
      removeItem: (key) => browser.removeItem(key),
    };
    const { storage } = resilientStorage(flaky);
    storage.setItem('k', 'old'); // refused: kept in memory
    refuse = false;
    storage.setItem('k', 'new'); // stored in the browser, memory copy dropped
    expect(browser.getItem('k')).toBe('new');
    expect(storage.getItem('k')).toBe('new');
  });
});
