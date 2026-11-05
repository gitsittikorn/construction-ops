import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { vi } from 'vitest';

// Local unit/UI tests must never inherit credentials or contact the configured project.
for (const name of [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GOOGLE_CLIENT_ID',
  'VITE_DRIVE_BACKEND_URL',
]) {
  vi.stubEnv(name, '');
}
afterEach(() => cleanup());

// jsdom does not implement the native modal dialog lifecycle.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
