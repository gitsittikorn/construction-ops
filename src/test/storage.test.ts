import { emptyData } from '../models';
import { loadData, persistData, updateData, subscribeDataChanges } from '../storage';
it('serializes simultaneous writes without losing either tab’s changes', async () => {
  const owner = crypto.randomUUID();
  await persistData(owner, structuredClone(emptyData));
  const master = (id: string) => ({
    id,
    createdAt: 'now',
    updatedAt: 'now',
    kind: 'truck' as const,
    name: id,
    detail: '',
    capacity: 12,
    active: true,
  });
  await Promise.all(
    ['first', 'second'].map((id) =>
      updateData(owner, (old) => ({ ...old, masters: [...old.masters, master(id)] })),
    ),
  );
  expect((await loadData(owner)).masters.map((m) => m.id).sort()).toEqual(['first', 'second']);
});
it('aborts invalid changes without deleting saved data', async () => {
  const owner = crypto.randomUUID();
  await persistData(owner, structuredClone(emptyData));
  await expect(
    updateData(owner, () => {
      throw Error('invalid');
    }),
  ).rejects.toThrow('invalid');
  expect(await loadData(owner)).toEqual(emptyData);
});
it('notifies the current account and reloads on focus without mixing accounts', async () => {
  const owner = crypto.randomUUID(),
    refresh = vi.fn(),
    stop = subscribeDataChanges(owner, refresh);
  await updateData('other-account', (old) => old);
  expect(refresh).not.toHaveBeenCalled();
  await updateData(owner, (old) => old);
  expect(refresh).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('focus'));
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
  window.dispatchEvent(new Event('focus'));
  expect(refresh).toHaveBeenCalledTimes(2);
});
