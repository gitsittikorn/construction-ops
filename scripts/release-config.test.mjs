import assert from 'node:assert/strict';
import test from 'node:test';
import { releaseConfigurationIssues } from './release-config.mjs';

const valid = {
  VITE_FIREBASE_API_KEY: 'synthetic-public-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-test',
  VITE_FIREBASE_APP_ID: 'synthetic-public-app-id',
  VITE_GOOGLE_CLIENT_ID: 'synthetic-client.apps.googleusercontent.com',
  VITE_DRIVE_BACKEND_URL: 'https://backend.example.test',
};
test('accepts public configuration and a shared or separate HTTPS access backend', () => {
  assert.deepEqual(releaseConfigurationIssues(valid), []);
  assert.deepEqual(
    releaseConfigurationIssues({
      ...valid,
      VITE_ACCESS_BACKEND_URL: 'https://access.example.test/api',
    }),
    [],
  );
});
test('rejects missing identity/backend settings and company local-demo builds', () => {
  assert(releaseConfigurationIssues({}).some((issue) => issue.includes('VITE_FIREBASE_APP_ID')));
  assert(
    releaseConfigurationIssues({ ...valid, VITE_DRIVE_BACKEND_URL: '' }).some((issue) =>
      issue.includes('backend URL'),
    ),
  );
  assert(
    releaseConfigurationIssues({ ...valid, VITE_ALLOW_LOCAL_DEMO: 'true' }).some((issue) =>
      issue.includes('demo'),
    ),
  );
});
test('rejects private keys and OAuth secrets without including their values in errors', () => {
  const issues = releaseConfigurationIssues({
    ...valid,
    VITE_GOOGLE_CLIENT_SECRET: 'synthetic-sensitive-value',
  });
  assert(issues.some((issue) => issue.includes('must not be exposed')));
  assert(!issues.join('\n').includes('synthetic-sensitive-value'));
});
test('rejects insecure, local or credential-bearing release URLs', () => {
  for (const url of [
    'http://backend.test',
    'https://localhost:3000',
    'https://127.0.0.1',
    'https://user:pass@backend.test',
    'https://backend.test/?token=private',
    'https://backend.test/#private',
  ])
    assert(
      releaseConfigurationIssues({ ...valid, VITE_DRIVE_BACKEND_URL: url }).some((issue) =>
        issue.includes('public HTTPS'),
      ),
      url,
    );
});
test('rejects malformed provider identifiers rather than shipping silent login failures', () => {
  assert(
    releaseConfigurationIssues({
      ...valid,
      VITE_FIREBASE_AUTH_DOMAIN: 'https://demo-test.firebaseapp.com/',
    }).some((issue) => issue.includes('hostname')),
  );
  assert(
    releaseConfigurationIssues({ ...valid, VITE_GOOGLE_CLIENT_ID: 'not-a-client' }).some((issue) =>
      issue.includes('web OAuth'),
    ),
  );
});
