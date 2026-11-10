import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function releaseConfigurationIssues(env) {
  const issues = [];
  for (const key of [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_GOOGLE_CLIENT_ID',
  ])
    if (!String(env[key] ?? '').trim()) issues.push(`${key} is required`);
  if (env.VITE_ALLOW_LOCAL_DEMO === 'true') issues.push('Company release cannot enable local demo');
  for (const key of Object.keys(env))
    if (/^VITE_.*(?:SECRET|PRIVATE_KEY|SERVICE_ACCOUNT|CREDENTIAL)/i.test(key) && env[key])
      issues.push(`${key} must not be exposed to the browser`);
  if (env.VITE_FIREBASE_AUTH_DOMAIN && !/^[a-z0-9.-]+$/i.test(env.VITE_FIREBASE_AUTH_DOMAIN))
    issues.push('Firebase Auth domain must be a hostname');
  if (
    env.VITE_GOOGLE_CLIENT_ID &&
    !/^[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(env.VITE_GOOGLE_CLIENT_ID)
  )
    issues.push('Google client ID must be a web OAuth client ID');
  const access = env.VITE_ACCESS_BACKEND_URL || env.VITE_DRIVE_BACKEND_URL;
  if (!access) issues.push('An access backend URL is required for allowlist companies');
  for (const value of [access, env.VITE_DRIVE_BACKEND_URL].filter(Boolean)) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        throw Error('invalid');
      if (/^(?:localhost|127\.|\[?::1\]?)/i.test(url.hostname)) throw Error('local');
    } catch {
      issues.push('Backend URLs must use public HTTPS without credentials, query or fragment');
    }
  }
  return [...new Set(issues)];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const issues = releaseConfigurationIssues(process.env);
  if (issues.length) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  } else console.log('Static release configuration passed; live services are not verified');
}
