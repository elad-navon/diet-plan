import { describe, expect, it } from 'vitest';
import { createAuthStorage, type DurableStore } from './auth-storage';

/** A store backed by a Map that can be told to refuse writes (full quota, blocked site data...). */
function fakeStore(): DurableStore & { values: Map<string, string>; refuse: boolean } {
  const values = new Map<string, string>();
  const store = {
    values,
    refuse: false,
    get: (key: string) => Promise.resolve(values.get(key) ?? null),
    set: (key: string, value: string) => {
      if (store.refuse) return Promise.reject(new DOMException('quota', 'QuotaExceededError'));
      values.set(key, value);
      return Promise.resolve();
    },
    remove: (key: string) => {
      values.delete(key);
      return Promise.resolve();
    },
  };
  return store;
}

describe('where the sign-in is kept (a full localStorage must not stop sign-in)', () => {
  it('uses the first store that works', async () => {
    const indexed = fakeStore();
    const local = fakeStore();
    const { storage, persistent } = createAuthStorage([indexed, local]);
    await storage.setItem('k', 'v');
    expect(indexed.values.get('k')).toBe('v');
    expect(local.values.size).toBe(0);
    expect(await storage.getItem('k')).toBe('v');
    expect(persistent()).toBe(true);
  });

  it('falls back to the next store when the first refuses (full or blocked)', async () => {
    const indexed = fakeStore();
    indexed.refuse = true;
    const local = fakeStore();
    const { storage, persistent } = createAuthStorage([indexed, local]);
    await storage.setItem('k', 'v');
    expect(local.values.get('k')).toBe('v');
    expect(persistent()).toBe(true);
  });

  it('IndexedDB works although localStorage is full: the sign-in is saved and kept', async () => {
    const indexed = fakeStore();
    const local = fakeStore();
    local.refuse = true; // the 10 MB of another page on the same address
    const { storage, persistent } = createAuthStorage([indexed, local]);
    await storage.setItem('diet-plan.auth', '{"session":1}');
    expect(await storage.getItem('diet-plan.auth')).toBe('{"session":1}');
    expect(persistent()).toBe(true);
  });

  it('keeps the value in memory when every store refuses, and reports it', async () => {
    const indexed = fakeStore();
    indexed.refuse = true;
    const local = fakeStore();
    local.refuse = true;
    const { storage, persistent } = createAuthStorage([indexed, local]);
    await expect(storage.setItem('k', 'v')).resolves.toBeUndefined();
    expect(await storage.getItem('k')).toBe('v');
    expect(persistent()).toBe(false);
  });

  it('still reads a sign-in that an earlier version saved in localStorage', async () => {
    const indexed = fakeStore();
    const local = fakeStore();
    local.values.set('diet-plan.auth', 'old-session');
    const { storage } = createAuthStorage([indexed, local]);
    expect(await storage.getItem('diet-plan.auth')).toBe('old-session');
  });

  it('removes the value everywhere, so signing out leaves nothing behind', async () => {
    const indexed = fakeStore();
    const local = fakeStore();
    local.values.set('k', 'old');
    const { storage } = createAuthStorage([indexed, local]);
    await storage.setItem('k', 'new');
    await storage.removeItem('k');
    expect(await storage.getItem('k')).toBeNull();
    expect(indexed.values.has('k')).toBe(false);
    expect(local.values.has('k')).toBe(false);
  });

  it('does not throw when a store fails to remove', async () => {
    const broken: DurableStore = {
      get: () => Promise.reject(new Error('down')),
      set: () => Promise.reject(new Error('down')),
      remove: () => Promise.reject(new Error('down')),
    };
    const { storage } = createAuthStorage([broken]);
    await expect(storage.removeItem('k')).resolves.toBeUndefined();
    expect(await storage.getItem('k')).toBeNull();
  });
});
