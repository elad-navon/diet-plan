import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Architecture rules (docs/ARCHITECTURE.md D.1, D.2). They are executable, not advisory:
// tests/lint-rules.test.ts lints fixture files and asserts each rule really fires.

const DATE_MESSAGE =
  'Raw Date usage is only allowed in src/core/time. Inject a Clock and use the core/time helpers (docs/ARCHITECTURE.md D.2).';

const rawDateSelectors = [
  "NewExpression[callee.name='Date']",
  "CallExpression[callee.name='Date']",
  "MemberExpression[object.name='Date']",
  'MemberExpression[property.name=/^(get|set)(UTC)?(FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)$/]',
  'MemberExpression[property.name=/^(getTimezoneOffset|toLocaleDateString|toLocaleTimeString|toDateString|toTimeString)$/]',
].map((selector) => ({ selector, message: DATE_MESSAGE }));

const domGlobals = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'navigator',
  'location',
  'indexedDB',
  'self',
].map((name) => ({ name, message: 'src/core must stay DOM-free (docs/ARCHITECTURE.md D.1).' }));

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    'supabase/functions',
    // Deliberate rule violations used by tests/lint-rules.test.ts (which lints them with ignore:false).
    '**/__lint-fixtures__/**',
  ]),

  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/no-danger': 'error',
      'react/prop-types': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },

  {
    files: ['e2e/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // --- Date discipline: all timezone math lives in src/core/time (docs/ARCHITECTURE.md D.2) ---
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...rawDateSelectors] },
  },
  {
    files: ['src/core/time/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // --- Layer boundaries (docs/ARCHITECTURE.md D.1) ---
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...domGlobals],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                '@supabase/*',
                '@/data/*',
                '@/features/*',
                '**/data/**',
                '**/features/**',
              ],
              message:
                'src/core is pure TypeScript: no React, Supabase, data layer or UI imports (docs/ARCHITECTURE.md D.1).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '**/features/**'],
              message: 'src/data must not depend on UI features (docs/ARCHITECTURE.md D.1).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*'],
              message:
                'UI features go through src/data repositories, never Supabase directly (docs/ARCHITECTURE.md D.3).',
            },
          ],
        },
      ],
    },
  },

  // Must stay last: turns off stylistic rules that conflict with Prettier.
  prettier,
]);
