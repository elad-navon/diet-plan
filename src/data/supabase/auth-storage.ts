/**
 * Where the browser keeps the sign-in. localStorage is shared by EVERY page on the same address, and a
 * GitHub Pages user site (name.github.io) serves all of someone's projects from one address: another
 * project can fill its 5-10 MB and leave no room for our sign-in (seen in practice: "QuotaExceededError").
 * IndexedDB has far more room, so it comes first; localStorage is the fallback, and memory the last resort
 * (the sign-in then lasts only for the visit, and the app says so).
 */

/** One place the sign-in can be kept. Every call may fail (blocked, full, unavailable). */
export interface DurableStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** The shape supabase-js wants for its `storage` option. */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Tries the stores in order; never throws. `persistent()` is false once a value had to stay in memory. */
export function createAuthStorage(stores: readonly DurableStore[]): {
  storage: AuthStorage;
  persistent: () => boolean;
} {
  const memory = new Map<string, string>();
  let durable = true;
  return {
    persistent: () => durable,
    storage: {
      async getItem(key) {
        const kept = memory.get(key);
        if (kept !== undefined) return kept;
        for (const store of stores) {
          try {
            const value = await store.get(key);
            if (value !== null) return value;
          } catch {
            // This store is unavailable; try the next one.
          }
        }
        return null;
      },
      async setItem(key, value) {
        for (const store of stores) {
          try {
            await store.set(key, value);
            memory.delete(key);
            return;
          } catch {
            // Blocked or full: try the next store.
          }
        }
        durable = false;
        memory.set(key, value);
      },
      async removeItem(key) {
        memory.delete(key);
        for (const store of stores) {
          try {
            await store.remove(key);
          } catch {
            // Nothing to remove there, or it cannot be reached.
          }
        }
      },
    },
  };
}

// --- the real stores ---------------------------------------------------------------------------

const DB_NAME = 'diet-plan';
const STORE_NAME = 'kv';

export function indexedDbStore(factory: IDBFactory): DurableStore {
  let opening: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    opening ??= new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('indexedDB: open failed'));
      request.onblocked = () => reject(new Error('indexedDB: open blocked'));
    });
    return opening;
  };

  async function run(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest,
  ): Promise<unknown> {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = work(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error('indexedDB: failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('indexedDB: aborted'));
    });
  }

  return {
    get: async (key) => {
      const value = await run('readonly', (store) => store.get(key));
      return typeof value === 'string' ? value : null;
    },
    set: async (key, value) => {
      await run('readwrite', (store) => store.put(value, key));
    },
    remove: async (key) => {
      await run('readwrite', (store) => store.delete(key));
    },
  };
}

export function localStorageStore(storage: Storage): DurableStore {
  return {
    get: (key) => Promise.resolve(storage.getItem(key)),
    set: (key, value) => {
      storage.setItem(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      storage.removeItem(key);
      return Promise.resolve();
    },
  };
}

/** The stores this browser offers, best first (a missing or blocked one is simply left out). */
export function browserAuthStores(): DurableStore[] {
  const stores: DurableStore[] = [];
  try {
    if (typeof indexedDB !== 'undefined') stores.push(indexedDbStore(indexedDB));
  } catch {
    // Blocked.
  }
  try {
    stores.push(localStorageStore(window.localStorage));
  } catch {
    // Blocked.
  }
  return stores;
}
