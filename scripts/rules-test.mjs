import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Optional portable runtime used on machines without a system Java installation.
const cached = path.join(os.tmpdir(), 'construction-ops-java21');
const env = { ...process.env, CI: 'true', FIREBASE_CLI_DISABLE_MOTD: 'true' };
if (!env.JAVA_HOME && existsSync(cached)) {
  const runtime = readdirSync(cached).find((name) =>
    existsSync(path.join(cached, name, 'bin', 'java.exe')),
  );
  if (runtime) env.JAVA_HOME = path.join(cached, runtime);
}
mkdirSync('test-results', { recursive: true });
env.FIREBASE_DEBUG_PATH = path.resolve('test-results/firebase-debug.log');
const output = createWriteStream('test-results/rules-output.log');
let tail = '',
  summaries = '';
console.log(
  'Running Firestore rules tests on isolated demo-construction-ops emulator (127.0.0.1:9089)',
);
const child = spawn(
  process.execPath,
  [
    'node_modules/firebase-tools/lib/bin/firebase.js',
    'emulators:exec',
    '--only',
    'firestore',
    '--project',
    'demo-construction-ops',
    '--config',
    'firebase.emulator.json',
    'npm run test:emulator',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'], env },
);
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => {
    output.write(chunk);
    tail = (tail + chunk.toString()).slice(-16000);
    for (const line of chunk.toString().split(/\r?\n/))
      if (/^[✔✖ℹ]/u.test(line) || /^\s*(Test Files|Tests|Duration)\s/.test(line))
        summaries += `${line}\n`;
  });
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  output.end();
  console.log(code === 0 ? summaries.trim() : tail);
  console.log('Full emulator output: test-results/rules-output.log');
  process.exitCode = code ?? 1;
});
