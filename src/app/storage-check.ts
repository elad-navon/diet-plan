/** What the browser lets this site store, for diagnosing "I have to sign in every time" (shown in Settings). */
export interface StorageReport {
  /** A 4 KB test write succeeded. */
  canWrite: boolean;
  /** Name and message of the error when it did not. */
  error: string | null;
  /** Everything this address (the whole github.io user site) currently holds in localStorage. */
  usedBytes: number;
  keyCount: number;
  /** The three biggest entries: another page on the same address could be filling the quota. */
  biggest: { key: string; bytes: number }[];
  hasSession: boolean;
}

export function checkStorage(): StorageReport {
  const report: StorageReport = {
    canWrite: false,
    error: null,
    usedBytes: 0,
    keyCount: 0,
    biggest: [],
    hasSession: false,
  };
  try {
    const store = window.localStorage;
    const sizes: { key: string; bytes: number }[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key === null) continue;
      const bytes = (key.length + (store.getItem(key) ?? '').length) * 2;
      sizes.push({ key, bytes });
      report.usedBytes += bytes;
    }
    report.keyCount = sizes.length;
    report.hasSession = sizes.some((entry) => entry.key === 'diet-plan.auth');
    report.biggest = sizes.sort((a, b) => b.bytes - a.bytes).slice(0, 3);
    try {
      store.setItem('__diet_plan_probe__', 'x'.repeat(4096));
      store.removeItem('__diet_plan_probe__');
      report.canWrite = true;
    } catch (error) {
      report.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
  } catch (error) {
    report.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  return report;
}

export function formatStorageReport(report: StorageReport): string {
  const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
  return [
    `write test: ${report.canWrite ? 'ok' : `FAILED (${report.error ?? 'unknown'})`}`,
    `stored here: ${kb(report.usedBytes)} in ${report.keyCount} keys`,
    `sign-in saved: ${report.hasSession ? 'yes' : 'no'}`,
    report.biggest.length > 0
      ? `biggest: ${report.biggest.map((entry) => `${entry.key} ${kb(entry.bytes)}`).join(', ')}`
      : 'biggest: -',
  ].join('\n');
}
