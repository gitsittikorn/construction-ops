import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Data } from '../src/models';

const base = { createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z' };
function data(): Data {
  return {
    projects: [
      {
        ...base,
        id: 'p',
        name: 'Restored project',
        customer: '',
        location: '',
        startDate: '',
        endDate: '',
        status: 'active',
        description: '',
      },
    ],
    masters: [
      {
        ...base,
        id: 'truck',
        kind: 'truck',
        name: '00123',
        detail: '',
        active: true,
        capacity: 12,
      },
    ],
    trips: ['a', 'b'].map((id) => ({
      ...base,
      id,
      projectId: 'p',
      date: '2026-11-06',
      time: '10:00',
      truckId: 'truck',
      driverId: '',
      sourceId: '',
      soilType: '',
      notes: '',
      revision: 1,
      syncStatus: 'pending',
    })),
    audit: [],
  };
}
function file(owner = 'local', source = data()) {
  return {
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'construction-ops-backup',
        version: 1,
        owner,
        exportedAt: base.createdAt,
        state: source,
        uploads: [
          {
            id: 'restored-slip',
            owner,
            projectId: 'p',
            tripId: 'a',
            name: 'slip.pdf',
            mimeType: 'application/pdf',
            size: 4,
            createdAt: base.createdAt,
            status: 'pending',
            driveId: '',
            folderId: 'untrusted',
            error: '',
            blobBase64: Buffer.from('test').toString('base64'),
          },
        ],
      }),
    ),
  };
}
for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 800, height: 1280 },
  { name: 'mobile', width: 390, height: 844 },
])
  test(`${viewport.name}: JSON preview, offline merge, duplicate review and responsive settings`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'การตั้งค่า', exact: true })
      .click();
    const restore = page.getByRole('region', { name: 'กู้คืนไฟล์สำรอง JSON', exact: true });
    await restore.getByLabel('เลือกไฟล์สำรอง JSON').setInputFiles(file('different-owner'));
    await expect(restore.getByRole('alert')).toContainText('บัญชีอื่น');
    await restore.getByLabel('เลือกไฟล์สำรอง JSON').setInputFiles(file());
    const preview = restore.getByRole('region', { name: 'ตัวอย่างกู้คืนข้อมูลสำรอง' });
    await expect(preview).toContainText('เพิ่ม 4 รายการ');
    // Preview has no persistence side effects.
    expect(
      await page.evaluate(async () => {
        const path = '/src/storage.ts';
        return (await (await import(path)).loadData('local')).projects.length;
      }),
    ).toBe(0);
    await context.setOffline(true);
    await preview
      .getByRole('button', { name: 'ยืนยันเพิ่มเฉพาะข้อมูลที่ขาด', exact: true })
      .click();
    await expect(restore.getByRole('status')).toContainText('เพิ่มข้อมูลที่ขาดแล้ว');
    const result = await page.evaluate(async () => {
      const path = '/src/storage.ts';
      const { loadData, openLocalDatabase } = await import(path);
      const data = await loadData('local'),
        db = await openLocalDatabase(),
        upload = await db.get('uploads', 'restored-slip');
      db.close();
      return {
        tripCount: data.trips.length,
        statuses: data.trips.map((trip: { syncStatus: string }) => trip.syncStatus),
        bytes: await upload.blob.text(),
        folder: upload.folderId,
        uploadStatus: upload.status,
      };
    });
    expect(result).toEqual({
      tripCount: 2,
      statuses: ['pending', 'pending'],
      bytes: 'test',
      folder: '',
      uploadStatus: 'error',
    });
    const duplicates = page.getByRole('region', { name: 'ตรวจเที่ยวที่อาจซ้ำ', exact: true });
    await expect(duplicates).toContainText('พบ 1 กลุ่ม');
    await duplicates.getByLabel('ผลการตรวจ', { exact: true }).selectOption('needs-correction');
    await duplicates
      .getByLabel('เหตุผลตรวจเที่ยวซ้ำ', { exact: true })
      .fill('รอตรวจตั๋วกับหน้างาน');
    await duplicates.getByRole('button', { name: 'บันทึกผลตรวจเที่ยวซ้ำ', exact: true }).click();
    await expect(duplicates.getByRole('status')).toContainText('ต้องตรวจแก้ไข');
    await expect(page.getByLabel('เลือกโครงการเริ่มต้น', { exact: true })).toBeEnabled();
    await page.getByLabel('เลือกโครงการเริ่มต้น', { exact: true }).selectOption('p');
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const path = '/src/projectPreference.ts';
          return (await import(path)).loadProjectPreference('local');
        }),
      )
      .toBe('p');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
    await context.setOffline(false);
    await page.reload();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'การตั้งค่า', exact: true })
      .click();
    await expect(duplicates.getByRole('status')).toContainText('รอตรวจตั๋วกับหน้างาน');
    await expect(page.getByLabel('เลือกโครงการเริ่มต้น', { exact: true })).toHaveValue('p');
    // A second import is a no-overwrite merge.
    const changed = data();
    changed.projects[0].name = 'Different backup';
    await restore.getByLabel('เลือกไฟล์สำรอง JSON').setInputFiles(file('local', changed));
    await expect(preview).toContainText('เพิ่ม 0 รายการ');
    await expect(preview).toContainText('เก็บฉบับปัจจุบัน 1 รายการ');
    await preview
      .getByRole('button', { name: 'ยืนยันเพิ่มเฉพาะข้อมูลที่ขาด', exact: true })
      .click();
    await expect(restore.getByRole('status')).toContainText('เพิ่มข้อมูลที่ขาดแล้ว');
    expect(
      await page.evaluate(async () => {
        const path = '/src/storage.ts';
        return (await (await import(path)).loadData('local')).projects[0].name;
      }),
    ).toBe('Restored project');
  });

test('JSON restore refuses stale previews and recovers after quota failure without partial records or file writes', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'การตั้งค่า', exact: true })
    .click();
  const restore = page.getByRole('region', { name: 'กู้คืนไฟล์สำรอง JSON', exact: true });
  await restore.getByLabel('เลือกไฟล์สำรอง JSON').setInputFiles(file());
  await expect(restore.getByRole('region', { name: 'ตัวอย่างกู้คืนข้อมูลสำรอง' })).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/storage.ts';
    await (
      await import(path)
    ).updateData('local', (data: Data) => ({
      ...data,
      audit: [
        ...data.audit,
        {
          id: 'new-audit',
          entityId: 'test',
          action: 'newer',
          at: new Date().toISOString(),
          actor: 'local',
          before: null,
          after: null,
        },
      ],
    }));
  });
  await restore.getByRole('button', { name: 'ยืนยันเพิ่มเฉพาะข้อมูลที่ขาด', exact: true }).click();
  await expect(restore.getByRole('alert')).toContainText('ข้อมูลเปลี่ยน');
  await restore.getByLabel('เลือกไฟล์สำรอง JSON').setInputFiles(file());
  await expect(restore.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    Object.assign(window, { restorePut: original });
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'state' && key === 'local')
        throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    };
  });
  await restore.getByRole('button', { name: 'ยืนยันเพิ่มเฉพาะข้อมูลที่ขาด', exact: true }).click();
  await expect(restore.getByRole('alert')).toContainText('พื้นที่เก็บข้อมูลเต็ม');
  expect(
    await page.evaluate(async () => {
      const path = '/src/storage.ts';
      const module = await import(path),
        db = await module.openLocalDatabase();
      const result = {
        projects: (await module.loadData('local')).projects.length,
        upload: await db.get('uploads', 'restored-slip'),
      };
      db.close();
      return result;
    }),
  ).toEqual({ projects: 0, upload: undefined });
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = Reflect.get(
      window,
      'restorePut',
    ) as typeof IDBObjectStore.prototype.put;
  });
  await restore.getByRole('button', { name: 'ยืนยันเพิ่มเฉพาะข้อมูลที่ขาด', exact: true }).click();
  await expect(restore.getByRole('status')).toContainText('เพิ่มข้อมูลที่ขาดแล้ว');
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 800, height: 1280 },
  { name: 'mobile', width: 390, height: 844 },
])
  test(`${viewport.name}: offline rates, payables, expenses, corrections and reload retain immutable financial events`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
    const source = data();
    source.masters.push({ ...source.masters[0], id: 'driver', kind: 'driver', name: 'สมชาย' });
    source.trips = [{ ...source.trips[0], driverId: 'driver', capacityPerTrip: 12 }];
    await page.evaluate(async (source: Data) => {
      const path = '/src/storage.ts';
      await (await import(path)).updateData('local', () => source);
    }, source);
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'การเงินโครงการ', exact: true })
      .click();
    const panel = page.getByRole('region', { name: 'การเงินโครงการ', exact: true });
    await expect(
      panel.getByRole('heading', { name: 'เรตราคา ต้นทุน และประมาณการ', exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    const totals = panel.getByRole('region', { name: 'ยอดประมาณการโครงการ', exact: true });
    await expect(totals).toContainText('ข้อมูลไม่ครบ');
    async function add(side: string, amount: string, unit = 'trip') {
      await panel.getByLabel('ประเภทเรต', { exact: true }).selectOption(side);
      await panel.getByLabel('วันที่เริ่มใช้เรต', { exact: true }).fill('2026-11-01');
      await panel.getByLabel('หน่วยราคา', { exact: true }).selectOption(unit);
      await panel.getByLabel('ราคา บาท', { exact: true }).fill(amount);
      await panel.getByLabel('เหตุผลเรตราคา', { exact: true }).fill('ตกลงราคาแล้ว');
      const before = await page.evaluate(async () => {
        const path = '/src/storage.ts';
        return (await (await import(path)).loadData('local')).workspaces?.length ?? 0;
      });
      await panel.getByRole('button', { name: 'บันทึกเรตราคา', exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const path = '/src/storage.ts';
            return (await (await import(path)).loadData('local')).workspaces?.length ?? 0;
          }),
        )
        .toBe(before + 1);
      await expect(panel.getByRole('button', { name: 'บันทึกเรตราคา', exact: true })).toBeEnabled();
    }
    await add('revenue', '10.25', 'm3');
    await add('truck', '50');
    await add('driver', '0');
    await expect(totals).toContainText('รายรับที่คำนวณได้ 123.00 บาท');
    await expect(totals).toContainText('ส่วนต่างที่คำนวณได้ 73.00 บาท');
    await expect(totals).toContainText('จากเที่ยวที่ยืนยัน 0.00 บาท');
    await panel.getByLabel('วันที่ค่าใช้จ่าย', { exact: true }).fill('2026-11-06');
    await panel.getByLabel('จำนวนค่าใช้จ่าย บาท', { exact: true }).fill('20.25');
    await panel.getByLabel('รายละเอียดค่าใช้จ่าย', { exact: true }).fill('ใบเสร็จน้ำมัน');
    await panel.getByRole('button', { name: 'บันทึกค่าใช้จ่าย', exact: true }).click();
    await expect(totals).toContainText('ส่วนต่างที่คำนวณได้ 52.75 บาท');
    await panel
      .getByPlaceholder('เหตุผลกลับรายการ', { exact: true })
      .fill('ใบเสร็จอยู่คนละโครงการ');
    await panel.getByRole('button', { name: 'กลับรายการค่าใช้จ่าย', exact: true }).click();
    await expect(totals).toContainText('ค่าใช้จ่ายสุทธิ 0.00 บาท');
    await expect(
      panel.getByRole('region', { name: 'ประวัติค่าใช้จ่าย', exact: true }),
    ).toContainText('กลับรายการแล้ว');
    await add('revenue', '11', 'm3');
    await expect(totals).toContainText('ส่วนต่างที่คำนวณได้ 82.00 บาท');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
    await context.setOffline(false);
    await page.reload();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'การเงินโครงการ', exact: true })
      .click();
    await expect(totals).toContainText('ส่วนต่างที่คำนวณได้ 82.00 บาท');
    await panel.getByText('รายละเอียดและเรตที่ใช้คำนวณ 1 แถว', { exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      panel.getByRole('button', { name: 'ส่งออกประมาณการ CSV', exact: true }).click(),
    ]);
    const exported = await readFile((await download.path())!, 'utf8');
    expect(exported).toContain('รายรับประมาณการ บาท');
    expect(exported).toContain('132.00');
    expect(exported).toContain('50.00');
    const saved = await page.evaluate(async () => {
      const path = '/src/storage.ts';
      return await (await import(path)).loadData('local');
    });
    expect(
      saved.workspaces?.filter((record: { recordType: string }) => record.recordType === 'finance'),
    ).toHaveLength(6);
    expect(
      saved.audit.filter((entry: { action: string }) => entry.action.startsWith('finance-')),
    ).toHaveLength(6);
    expect(
      Object.values(saved.sync.entries).every(
        (entry) => (entry as { status: string }).status === 'pending',
      ),
    ).toBe(true);
  });
