import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// Where the app is served from: "/" normally, "/diet-plan/" on GitHub Pages (set by the deploy workflow).
const base = process.env['VITE_BASE'] ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The app decides when to update (a banner), so a reload never interrupts a half-typed meal.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*'],
      manifest: {
        id: base,
        name: 'יומן תזונה',
        short_name: 'יומן תזונה',
        description: 'מעקב קלוריות ומאקרו, עם יעד יומי והמלצות לארוחה הבאה',
        lang: 'he',
        dir: 'rtl',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f3f4f8',
        theme_color: '#3b82f6',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // The whole app (including the food database) works offline once opened.
        globPatterns: ['**/*.{js,css,html,woff2,json,png,svg,jpg}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        // Health data is never kept in a cache: calls to the server always go to the network.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // On a developer machine two test workers keep the fan quiet (the default is one per core, or even more);
    // CI machines use all they have.
    maxWorkers: process.env['CI'] ? undefined : 2,
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    // Pin the process timezone so any hidden dependence on the machine's zone fails loudly
    // (all real time logic takes an explicit IANA tz - see docs/ARCHITECTURE.md D.2).
    env: { TZ: 'UTC' },
  },
});
