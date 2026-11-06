import { openLocalDatabase } from './storage';

export interface DailyFormDraft {
  id: string;
  editingId?: string;
  version?: number;
  values: Record<string, string>;
}
export interface DailyUiState {
  project: string;
  date: string;
  reason: string;
  drafts: Record<string, DailyFormDraft>;
}
const writes = new Map<string, Promise<void>>();
export async function loadDailyUi(owner: string): Promise<DailyUiState | undefined> {
  await writes.get(owner)?.catch(() => {});
  const db = await openLocalDatabase();
  try {
    return await db.get('driveSettings', ['daily-ui', owner]);
  } finally {
    db.close();
  }
}
export function saveDailyUi(owner: string, state: DailyUiState) {
  const snapshot = structuredClone(state);
  const task = (writes.get(owner) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const db = await openLocalDatabase();
      try {
        await db.put('driveSettings', snapshot, ['daily-ui', owner]);
      } finally {
        db.close();
      }
    });
  writes.set(owner, task);
  void task
    .finally(() => {
      if (writes.get(owner) === task) writes.delete(owner);
    })
    .catch(() => {});
  return task;
}
