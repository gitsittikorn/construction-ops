import { build, preview } from 'vite';
process.env.VITE_ALLOW_LOCAL_DEMO = 'true';
for (const key of [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GOOGLE_CLIENT_ID',
  'VITE_DRIVE_BACKEND_URL',
  'VITE_ACCESS_BACKEND_URL',
])
  process.env[key] = '';
await build({ build: { outDir: 'test-results/pwa-dist', emptyOutDir: true } });
const server = await preview({
  build: { outDir: 'test-results/pwa-dist' },
  preview: { host: '127.0.0.1', port: 5175, strictPort: true },
});
process.on('SIGTERM', () => server.httpServer.close());
