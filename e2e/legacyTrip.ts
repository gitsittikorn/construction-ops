import type { Page } from '@playwright/test';
import { openMenu } from './nav';
import type { Data } from '../src/models';

/**
 * New entries are no longer added from the old trip list. Specs that exercise its form create a
 * placeholder record for the first project and truck, then open it for editing.
 */
export async function openLegacyTripForm(page: Page) {
  const time = await page.evaluate(async () => {
    const storage = '/src/storage.ts',
      domain = '/src/domain.ts';
    const { updateData } = await import(storage);
    const { workDate } = await import(domain);
    let time = '';
    await updateData('local', (data: Data) => {
      time = `00:${String(data.trips.length).padStart(2, '0')}`;
      const stamp = new Date().toISOString();
      return {
        ...data,
        trips: [
          ...data.trips,
          {
            id: crypto.randomUUID(),
            createdAt: stamp,
            updatedAt: stamp,
            projectId: data.projects[0]?.id ?? '',
            truckId: data.masters.find((item) => item.kind === 'truck')?.id ?? '',
            driverId: '',
            sourceId: '',
            soilType: '',
            date: workDate(),
            time,
            notes: '',
            revision: 1,
            syncStatus: 'pending',
          },
        ],
      };
    });
    return time;
  });
  await openMenu(page, 'ประวัติแบบเดิม');
  await page.getByRole('button', { name: `แก้ไข เที่ยวรถ ${time}`, exact: true }).click();
}
