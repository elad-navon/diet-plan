import { defineConfig, devices } from '@playwright/test';

// Dedicated port + never reuse a running server: a stray `vite preview` of another project on a
// common port would otherwise be tested instead of this app (seen in practice on 4173).
const PORT = 4391;

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
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // E2E runs against the production build, as users will get it.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
