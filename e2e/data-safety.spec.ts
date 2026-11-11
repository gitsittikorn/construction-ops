import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('P1-10/19 a clean second browser context restores seeded cloud envelopes into real IndexedDB', async ({
  browser,
  page,
}) => {
  await page.goto('/');
  const envelopes = await page.evaluate(async () => {
    const path = '/src/test/syncFixtures.ts';
    const { fixture, cloudRecords, truck } = await import(path);
    const data = fixture();
    data.masters.push(
      ...['driver', 'source', 'customer', 'soilType', 'tag'].map((kind) => ({
        ...truck,
        id: kind,
        kind,
      })),
    );
    return cloudRecords(data);
  });
  const secondContext = await browser.newContext();
  try {
    const second = await secondContext.newPage();
    await second.goto('/');
    await expect(second.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
    const restored = await second.evaluate(async (records) => {
      const storagePath = '/src/storage.ts',
        syncPath = '/src/cloudSync.ts';
      const { loadData } = await import(storagePath);
      const { synchronize } = await import(syncPath);
      const empty = await loadData('local');
      if (empty.projects.length || empty.masters.length || empty.trips.length)
        throw Error('Device must start empty');
      // Deterministic transport fixture; real Firebase adapter/rules are tested separately in the emulator suite.
      await synchronize('local', {
        authorize: async () => {},
        pull: async () => ({ records, cursors: {} }),
        push: async () => {
          throw Error('Restore must not upload seeded records');
        },
        read: async () => null,
      });
      return loadData('local');
    }, envelopes);
    expect(restored.projects[0].id).toBe('p');
    expect(restored.masters).toHaveLength(6);
    expect(restored.trips[0]).toMatchObject({ id: 'trip', syncStatus: 'synced' });
    await second.reload();
    await expect(second.getByText('Site', { exact: true })).toBeVisible();
    await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
  } finally {
    await secondContext.close();
  }
});

test('P1-01/03/04/05 production PWA saves project, master and revised trip offline and survives a new page', async ({
  page,
  context,
}) => {
  await page.goto('http://127.0.0.1:5175/construction-ops/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('P1 offline site');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มข้อมูล', exact: true }).click();
  await page.getByLabel('ทะเบียนรถ', { exact: true }).fill('P1-1234');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await nav.getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'รถบรรทุก *', exact: true })
    .selectOption({ label: 'P1-1234' });
  await page.getByLabel('หมายเหตุ', { exact: true }).fill('original offline trip');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page.getByRole('button', { name: /แก้ไขเที่ยวรถ/ }).click();
  await page.getByLabel('หมายเหตุ', { exact: true }).fill('revised offline trip');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.close();
  const restarted = await context.newPage();
  await restarted.goto('http://127.0.0.1:5175/construction-ops/');
  await expect(restarted.getByText('P1 offline site', { exact: true })).toBeVisible();
  await restarted
    .getByRole('navigation')
    .getByRole('button', { name: 'ซิงก์และสำรองข้อมูล', exact: true })
    .click();
  await expect(restarted.getByText('รอซิงก์ 3 รายการ · ขัดแย้ง 0 รายการ')).toBeVisible();
  const event = restarted.waitForEvent('download');
  await restarted.getByRole('button', { name: 'ดาวน์โหลดข้อมูลสำรองพร้อมไฟล์แนบ' }).click();
  const backup = JSON.parse(await readFile((await (await event).path())!, 'utf8'));
  expect(backup.state.projects).toHaveLength(1);
  expect(backup.state.masters[0].name).toBe('P1-1234');
  expect(backup.state.trips).toHaveLength(1);
  expect(backup.state.trips[0]).toMatchObject({
    notes: 'revised offline trip',
    revision: 2,
    syncStatus: 'pending',
  });
  expect(
    backup.state.audit.filter((a: any) => a.entityId === backup.state.trips[0].id),
  ).toHaveLength(2);
  expect(Object.values(backup.state.sync.entries).every((e: any) => e.status === 'pending')).toBe(
    true,
  );
  await context.setOffline(false);
});

test('offline edits survive reload and a browser backup includes pending data and original file bytes', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('navigation').getByRole('button', { name: 'โครงการ', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('Offline site');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Offline site', exact: true })).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'ซิงก์และสำรองข้อมูล', exact: true })
    .click();
  await expect(page.getByText('รอซิงก์ 1 รายการ · ขัดแย้ง 0 รายการ')).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(async () => {
    const storagePath = '/src/storage.ts';
    const { openLocalDatabase, loadData } = await import(storagePath);
    const data = await loadData('local'),
      db = await openLocalDatabase();
    await db.put('uploads', {
      id: 'pending-file',
      owner: 'local',
      projectId: data.projects[0].id,
      tripId: '',
      name: 'original.png',
      mimeType: 'image/png',
      size: 14,
      createdAt: new Date().toISOString(),
      status: 'pending',
      driveId: '',
      folderId: '',
      error: '',
      blob: new Blob(['original bytes'], { type: 'image/png' }),
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByText('Offline site', { exact: true })).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'ซิงก์และสำรองข้อมูล', exact: true })
    .click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ดาวน์โหลดข้อมูลสำรองพร้อมไฟล์แนบ' }).click();
  const download = await downloadEvent;
  const backup = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(backup.state.projects[0].name).toBe('Offline site');
  expect(Object.values(backup.state.sync.entries).map((entry: any) => entry.status)).toEqual([
    'pending',
  ]);
  expect(Buffer.from(backup.uploads[0].blobBase64, 'base64').toString()).toBe('original bytes');
  expect(backup.migrationBackup.projects).toEqual([]);
});

test('stale edits from another tab are rejected and deletion retains a tombstone and audit', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'โครงการ', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('Original');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page.getByRole('button', { name: /ดู \/ แก้ไข/ }).click();
  const other = await context.newPage();
  await other.goto('/');
  await other.evaluate(async () => {
    const storagePath = '/src/storage.ts';
    const { updateData } = await import(storagePath);
    await updateData('local', (data: any) => ({
      ...data,
      projects: data.projects.map((p: any) => ({ ...p, name: 'Other tab' })),
    }));
  });
  await expect(page.getByRole('heading', { name: 'Other tab', exact: true })).toBeAttached();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('Stale edit');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('ข้อมูลเปลี่ยนแปลงแล้ว');
  await page.getByRole('button', { name: 'ปิดฟอร์ม', exact: true }).click();
  await page.getByRole('button', { name: /ดู \/ แก้ไข/ }).click();
  await page.getByRole('button', { name: 'ลบรายการโดยเก็บประวัติ' }).click();
  await page.getByRole('button', { name: 'ยืนยันลบรายการ' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const stored = await page.evaluate(async () => {
    const storagePath = '/src/storage.ts';
    return (await import(storagePath)).loadData('local');
  });
  expect(stored.projects).toEqual([]);
  expect(stored.deletedProjects[0].name).toBe('Other tab');
  expect(Object.values(stored.sync.entries).map((entry: any) => entry.status)).toEqual(['pending']);
  expect(stored.audit.some((entry: any) => entry.action === 'delete')).toBe(true);
});
