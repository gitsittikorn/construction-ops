import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
