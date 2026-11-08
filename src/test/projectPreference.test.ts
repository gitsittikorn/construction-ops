import {
  loadProjectPreference,
  saveProjectPreference,
  preferredProject,
} from '../projectPreference';
import { project } from './syncFixtures';
it('persists preferred projects per account without touching project records', async () => {
  const owner = crypto.randomUUID();
  expect(await loadProjectPreference(owner)).toBe('');
  await saveProjectPreference(owner, project.id, [project]);
  expect(await loadProjectPreference(owner)).toBe(project.id);
  expect(await loadProjectPreference('other-owner')).toBe('');
  expect(preferredProject([{ ...project, status: 'archived' }], project.id)).toBe('');
  await saveProjectPreference(owner, '', []);
  expect(await loadProjectPreference(owner)).toBe('');
});
it('refuses inactive and unknown defaults, preserving the saved preference', async () => {
  const owner = crypto.randomUUID();
  await saveProjectPreference(owner, project.id, [project]);
  await expect(saveProjectPreference(owner, 'unknown', [project])).rejects.toThrow('ดำเนินการ');
  await expect(
    saveProjectPreference(owner, project.id, [{ ...project, status: 'archived' }]),
  ).rejects.toThrow('ดำเนินการ');
  expect(await loadProjectPreference(owner)).toBe(project.id);
});
it('keeps the previous preference when storage is full and supports a later retry', async () => {
  const owner = crypto.randomUUID();
  await saveProjectPreference(owner, project.id, [project]);
  const put = IDBObjectStore.prototype.put,
    spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (
        this.name === 'driveSettings' &&
        Array.isArray(key) &&
        key[0] === 'project-default' &&
        key[1] === owner
      )
        throw new DOMException('Full', 'QuotaExceededError');
      return put.call(this, value, key);
    });
  try {
    await expect(saveProjectPreference(owner, '', [])).rejects.toHaveProperty(
      'name',
      'QuotaExceededError',
    );
  } finally {
    spy.mockRestore();
  }
  expect(await loadProjectPreference(owner)).toBe(project.id);
  await saveProjectPreference(owner, '', []);
  expect(await loadProjectPreference(owner)).toBe('');
});
