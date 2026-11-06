import { loadDailyUi, saveDailyUi, type DailyUiState } from '../dailyDrafts';
import * as storage from '../storage';

const state: DailyUiState = {
  project: 'p',
  date: '2026-11-06',
  reason: '',
  drafts: {
    'daily-p-2026-11-06': {
      id: 'draft',
      values: { truckId: 'truck', notes: 'unsaved Thai draft ทดสอบ' },
    },
  },
};
it('persists account-scoped context and unsaved form drafts through independent reads', async () => {
  const owner = crypto.randomUUID();
  await saveDailyUi(owner, state);
  expect(await loadDailyUi(owner)).toEqual(state);
  expect(await loadDailyUi('another-owner')).toBeUndefined();
  expect((await storage.loadData(owner)).sync).toBeUndefined();
});
it('serializes rapid draft writes and keeps the last acknowledged form without modifying caller input', async () => {
  const owner = crypto.randomUUID();
  const first = saveDailyUi(owner, state);
  const next = { ...state, date: '2026-11-07' };
  await Promise.all([first, saveDailyUi(owner, next)]);
  expect((await loadDailyUi(owner))!.date).toBe('2026-11-07');
  expect(state.date).toBe('2026-11-06');
});
it('surfaces persistence failures, preserves the old draft, and permits a retry', async () => {
  const owner = crypto.randomUUID();
  await saveDailyUi(owner, state);
  const opening = vi
    .spyOn(storage, 'openLocalDatabase')
    .mockRejectedValueOnce(Error('storage unavailable'));
  await expect(saveDailyUi(owner, { ...state, project: 'lost' })).rejects.toThrow(
    'storage unavailable',
  );
  opening.mockRestore();
  expect(await loadDailyUi(owner)).toEqual(state);
  await saveDailyUi(owner, { ...state, date: '2026-11-07' });
  expect((await loadDailyUi(owner))!.date).toBe('2026-11-07');
});
