import { browserAuthStores } from '../data/supabase/auth-storage';

/** What the browser lets this site store, for diagnosing "I have to sign in every time" (shown in Settings). */
export interface StorageReport {
  /** A 4 KB test write to localStorage succeeded. */
  localWrite: boolean;
  localError: string | null;
  /** The same test for IndexedDB, where the sign-in is kept. */
  indexedDbWrite: boolean;
  indexedDbError: string | null;
  /** Everything this address (the whole github.io user site) currently holds in localStorage. */
  usedBytes: number;
  keyCount: number;
  /** The three biggest entries: another page on the same address could be filling the quota. */
  biggest: { key: string; bytes: number }[];
}

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

export async function checkStorage(): Promise<StorageReport> {
  const report: StorageReport = {
    localWrite: false,
    localError: null,
    indexedDbWrite: false,
    indexedDbError: null,
    usedBytes: 0,
    keyCount: 0,
    biggest: [],
  };
  try {
    const store = window.localStorage;
    const sizes: { key: string; bytes: number }[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key === null) continue;
      sizes.push({ key, bytes: (key.length + (store.getItem(key) ?? '').length) * 2 });
    }
    report.keyCount = sizes.length;
    report.usedBytes = sizes.reduce((sum, entry) => sum + entry.bytes, 0);
    report.biggest = sizes.sort((a, b) => b.bytes - a.bytes).slice(0, 3);
    try {
      store.setItem('__diet_plan_probe__', 'x'.repeat(4096));
      store.removeItem('__diet_plan_probe__');
      report.localWrite = true;
    } catch (error) {
      report.localError = describe(error);
    }
  } catch (error) {
    report.localError = describe(error);
  }

  const [indexedDb] = browserAuthStores();
  if (!indexedDb || typeof indexedDB === 'undefined') {
    report.indexedDbError = 'IndexedDB is not available';
  } else {
    try {
      await indexedDb.set('__diet_plan_probe__', 'x'.repeat(4096));
      await indexedDb.remove('__diet_plan_probe__');
      report.indexedDbWrite = true;
    } catch (error) {
      report.indexedDbError = describe(error);
    }
  }
  return report;
}

export function formatStorageReport(report: StorageReport): string {
  const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
  const line = (name: string, ok: boolean, error: string | null): string =>
    `${name}: ${ok ? 'ok' : `FAILED (${error ?? 'unknown'})`}`;
  return [
    line('IndexedDB write (sign-in)', report.indexedDbWrite, report.indexedDbError),
    line('localStorage write', report.localWrite, report.localError),
    `localStorage holds: ${kb(report.usedBytes)} in ${report.keyCount} keys`,
    report.biggest.length > 0
      ? `biggest: ${report.biggest.map((entry) => `${entry.key} ${kb(entry.bytes)}`).join(', ')}`
      : 'biggest: -',
  ].join('\n');
}
