import { rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const generated = [
  '.npm-cache',
  'coverage',
  'test-results',
  'playwright-report',
  'tsconfig.tsbuildinfo',
  'firebase-debug.log',
  'firestore-debug.log',
];
for (const name of generated) {
  const target = path.resolve(root, name);
  if (path.dirname(target) !== root) throw new Error('Cleanup target is outside workspace');
  try {
    const resolved = await realpath(target);
    if (resolved !== target) throw new Error('Refusing to remove linked cleanup target');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  await rm(target, { recursive: true, force: true });
  console.log(`Removed generated artifact: ${name}`);
}
