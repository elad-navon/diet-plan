import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The architecture rules in eslint.config.js are only worth anything if they actually fire.
 * Each fixture under src/**\/__lint-fixtures__ commits a deliberate violation; the main lint run
 * ignores them, this test lints them with ignore:false and asserts the expected rule triggers.
 * Covers docs/TEST_PLAN.md TIME-10 and the layer boundaries in docs/ARCHITECTURE.md D.1.
 */

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const FIXTURES = {
  coreRawDate: 'src/core/__lint-fixtures__/raw-date.ts',
  coreTimeRawDate: 'src/core/time/__lint-fixtures__/raw-date-allowed.ts',
  coreImportsReact: 'src/core/__lint-fixtures__/imports-react.ts',
  coreDomGlobal: 'src/core/__lint-fixtures__/uses-dom-global.ts',
  dataImportsFeatures: 'src/data/__lint-fixtures__/imports-features.ts',
  featuresRawDate: 'src/features/__lint-fixtures__/raw-date.ts',
  featuresImportsSupabase: 'src/features/__lint-fixtures__/imports-supabase.ts',
  featuresDanger: 'src/features/__lint-fixtures__/danger.tsx',
  cleanApp: 'src/App.tsx',
} as const;

type FixtureKey = keyof typeof FIXTURES;

const ruleIdsByFixture = new Map<FixtureKey, string[]>();

beforeAll(async () => {
  const eslint = new ESLint({ cwd: root, ignore: false });
  const results = await eslint.lintFiles(Object.values(FIXTURES));
  for (const [key, relative] of Object.entries(FIXTURES) as [FixtureKey, string][]) {
    const result = results.find((r) => r.filePath.replaceAll('\\', '/').endsWith(`/${relative}`));
    expect(result, `no lint result for ${relative}`).toBeDefined();
    ruleIdsByFixture.set(
      key,
      (result?.messages ?? []).map((m) => m.ruleId ?? `parse-error: ${m.message}`),
    );
  }
}, 120_000);

function ruleIds(key: FixtureKey): string[] {
  return ruleIdsByFixture.get(key) ?? [];
}

describe('architecture lint rules', () => {
  it('forbids raw Date usage outside core/time (core)', () => {
    expect(ruleIds('coreRawDate')).toContain('no-restricted-syntax');
  });

  it('forbids raw Date usage outside core/time (features)', () => {
    expect(ruleIds('featuresRawDate')).toContain('no-restricted-syntax');
  });

  it('allows raw Date usage inside core/time', () => {
    expect(ruleIds('coreTimeRawDate')).not.toContain('no-restricted-syntax');
  });

  it('keeps core free of React imports', () => {
    expect(ruleIds('coreImportsReact')).toContain('no-restricted-imports');
  });

  it('keeps core free of DOM globals', () => {
    expect(ruleIds('coreDomGlobal')).toContain('no-restricted-globals');
  });

  it('keeps the data layer from importing UI features', () => {
    expect(ruleIds('dataImportsFeatures')).toContain('no-restricted-imports');
  });

  it('keeps UI features from importing Supabase directly', () => {
    expect(ruleIds('featuresImportsSupabase')).toContain('no-restricted-imports');
  });

  it('bans dangerouslySetInnerHTML', () => {
    expect(ruleIds('featuresDanger')).toContain('react/no-danger');
  });

  it('control: production code lints clean', () => {
    expect(ruleIds('cleanApp')).toEqual([]);
  });
});
