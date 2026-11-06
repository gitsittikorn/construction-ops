import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ESLint } from 'eslint';

const eslint = new ESLint();

test('accepts typed React code without formatting conflicts', async () => {
  const [result] = await eslint.lintText(
    'export function Panel({ name }: { name: string }) { return <p>{name}</p>; }',
    { filePath: 'src/EditorConfigProbe.tsx' },
  );
  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
});

test('rejects conditional Hooks and explicit any in application code', async () => {
  const [result] = await eslint.lintText(
    `import { useState } from 'react';
export function Panel({ enabled }: { enabled: any }) {
  if (enabled) { useState(0); }
  return null;
}`,
    { filePath: 'src/EditorConfigProbe.tsx' },
  );
  for (const rule of ['react-hooks/rules-of-hooks', '@typescript-eslint/no-explicit-any']) {
    assert.ok(result.messages.some((message) => message.ruleId === rule && message.severity === 2));
  }
});

test('keeps test any visible as a warning and ignores build output', async () => {
  const [result] = await eslint.lintText('export const fixture: any = {};', {
    filePath: 'src/test/editorConfigProbe.test.ts',
  });
  assert.equal(result.errorCount, 0);
  assert.ok(
    result.messages.some((message) => message.ruleId === '@typescript-eslint/no-explicit-any'),
  );
  assert.equal(await eslint.isPathIgnored('dist/assets/generated.js'), true);
});

test('uses Prettier for formatting and ESLint for save fixes', async () => {
  const settings = JSON.parse(await readFile(new URL('../.vscode/settings.json', import.meta.url)));
  assert.equal(settings['editor.defaultFormatter'], 'esbenp.prettier-vscode');
  assert.equal(settings['editor.formatOnSave'], true);
  assert.equal(settings['eslint.format.enable'], false);
  assert.equal(settings['editor.codeActionsOnSave']['source.fixAll.eslint'], 'explicit');
});
