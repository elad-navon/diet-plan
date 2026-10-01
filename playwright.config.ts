import { defineConfig, devices } from '@playwright/test';

// Dedicated port + never reuse a running server: a stray `vite preview` of another project on a
// common port would otherwise be tested instead of this app (seen in practice on 4173).
const PORT = 4391;
// A second build of the same app with a (fake) server address, used by e2e/server.spec.ts to test sign-in
// and server-backed data. All its network calls are answered by the tests themselves.
const SERVER_PORT = 4392;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  },
  // WebKit (iPhone) joins in the PWA/accessibility stage - docs/IMPLEMENTATION_PLAN.md stage 9.
  projects: [
    {
      name: 'mobile-chromium',
      testIgnore: /server\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop-chromium',
      testIgnore: /server\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'server-mode',
      testMatch: /server\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${SERVER_PORT}` },
    },
  ],
  // E2E runs against the production build, as users will get it.
  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `npx vite build --mode e2e-server --outDir dist-e2e-server && npx vite preview --outDir dist-e2e-server --port ${SERVER_PORT} --strictPort`,
      url: `http://localhost:${SERVER_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
