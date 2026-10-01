import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    // Pin the process timezone so any hidden dependence on the machine's zone fails loudly
    // (all real time logic takes an explicit IANA tz - see docs/ARCHITECTURE.md D.2).
    env: { TZ: 'UTC' },
  },
});
