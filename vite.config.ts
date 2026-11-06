import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { devDiagnosticsPlugin } from './devDiagnosticsPlugin';
import { precachePlugin } from './precachePlugin';
export default defineConfig({
  plugins: [react(), devDiagnosticsPlugin(), precachePlugin()],
  test: {
    // Bound jsdom concurrency to avoid resource contention and flaky UI timeouts.
    maxWorkers: 2,
    include: ['src/test/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'firebase-auth': ['firebase/app', 'firebase/auth'],
          'firebase-store': ['firebase/firestore'],
        },
      },
    },
  },
});
