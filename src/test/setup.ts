import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { vi } from 'vitest';

// Wait for observable UI completion on busy Windows hosts, without fixed sleeps.
configure({ asyncUtilTimeout: 5000 });

// Local unit/UI tests must never inherit credentials or contact the configured project.
const isolatedVariables = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GOOGLE_CLIENT_ID',
  'VITE_DRIVE_BACKEND_URL',
  'VITE_ACCESS_BACKEND_URL',
];
for (const name of isolatedVariables) {
  vi.stubEnv(name, '');
}
// Reapply after suites call unstubAllEnvs(), which restores the real .env.local.
beforeEach(() => {
  for (const name of isolatedVariables) vi.stubEnv(name, '');
});
afterEach(() => cleanup());

// jsdom does not implement the native modal dialog lifecycle.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
