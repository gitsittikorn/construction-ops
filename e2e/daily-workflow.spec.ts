import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function seed(page: Page) {
  await page.goto('/');
  await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const module = '/src/storage.ts';
    const { persistData } = await import(module);
    const base = { createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z' };
    await persistData('local', {
      projects: [
        {
          ...base,
          id: 'p',
          name: 'Field project',
          customer: 'ลูกค้า',
          location: 'งานถม',
          startDate: '',
          endDate: '',
          status: 'active',
          description: '',
        },
      ],
      masters: [
        ['truck', 'truck', '00123'],
        ['driver', 'driver', 'สมชาย'],
        ['tag', 'team', 'ทีม A'],
        ['source', 'source', 'บ่อ A'],
      ].map(([kind, id, name]) => ({
        ...base,
        kind,
        id,
        name,
        detail: '',
        active: true,
        capacity: 12,
      })),
      trips: [],
      audit: [],
    });
  });
  await page.reload();
}
async function createRow(page: Page) {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true })
    .click();
  await page.getByRole('button', { name: 'สร้างวันทำงาน', exact: true }).click();
  await page.getByLabel('รถทำงาน', { exact: true }).selectOption('truck');
  await page.getByLabel('คนขับทำงาน', { exact: true }).selectOption('driver');
  await page.getByLabel('ทีมทำงาน', { exact: true }).selectOption('team');
  await page.getByLabel('แหล่งดินทำงาน', { exact: true }).selectOption('source');
  await page.getByLabel('เที่ยวบันทึก', { exact: true }).fill('3');
  await page.getByLabel('เที่ยวรายงาน', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^ยอดตรงกัน รอผู้จัดการยืนยัน/ })).toBeVisible();
}

test('P2: Bangkok midnight, multiple trucks, per-trip correction and preserved capacity snapshots', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-06T17:00:01Z') });
  await seed(page);
  await page.evaluate(async () => {
    const path = '/src/storage.ts';
    await (
      await import(path)
    ).updateData('local', (data: any) => ({
      ...data,
      masters: [...data.masters, { ...data.masters[0], id: 'truck2', name: '00234', capacity: 20 }],
    }));
  });
  await page.reload();
  await createRow(page);
  await expect(page.getByLabel('วันที่ทำงาน', { exact: true })).toHaveValue('2026-11-07');
  await page.getByLabel('รถทำงาน', { exact: true }).selectOption('truck2');
  await page.getByLabel('คนขับทำงาน', { exact: true }).selectOption('driver');
  await page.getByLabel('เที่ยวบันทึก', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
  await expect(
    page.getByText(/รถ 2 คัน · คนขับ 1 คน · เที่ยวบันทึก 5 · ปริมาตร 76 m³/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'แก้ไข 00123', exact: true }).click();
  await page.getByLabel('ความจุต่อเที่ยว', { exact: true }).fill('15');
  await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มเที่ยว 00123', exact: true }).click();
  await expect(page.getByText(/เที่ยวบันทึก 6 · ปริมาตร 91 m³/)).toBeVisible();
  await page.getByText('ตรวจและแก้ไขรายเที่ยว', { exact: true }).click();
  const tripId = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    const data = await (await import(path)).loadData('local');
    return data.workspaces
      .find((s: any) => s.recordType === 'daily')
      .body.rows.find((r: any) => r.truckId === 'truck').transactions[0].id;
  });
  const input = page.getByLabel(`ความจุเที่ยว ${tripId}`, { exact: true });
  await input.fill('10');
  await input
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'แก้ไขรายเที่ยว', exact: true })
    .click();
  await expect(page.locator('section[aria-label="งานรายวัน"]').getByRole('alert')).toContainText(
    'เหตุผล',
  );
  await page.getByLabel('เหตุผลแก้ไข', { exact: true }).fill('ตรวจความจุจริง');
  await input
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'แก้ไขรายเที่ยว', exact: true })
    .click();
  await expect(page.getByText(/เที่ยวบันทึก 6 · ปริมาตร 89 m³/)).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true })
    .click();
  await expect(page.getByText(/เที่ยวบันทึก 6 · ปริมาตร 89 m³/)).toBeVisible();
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet-portrait', width: 800, height: 1280 },
  { name: 'tablet-landscape', width: 1280, height: 800 },
])
  test(`${viewport.name}: offline daily counts, undo, historical copy and duplicate prevention`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await seed(page);
    await createRow(page);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'เพิ่มเที่ยว 00123', exact: true }).dblclick();
    await expect(page.getByRole('cell', { name: /^ยอดไม่ตรงกัน/ })).toBeVisible();
    const state = await page.evaluate(async () => {
      const path = '/src/storage.ts';
      const data = await (await import(path)).loadData('local');
      return data.workspaces.find((r: any) => r.recordType === 'daily').body.rows[0].tripCount;
    });
    expect(state).toBe(4);
    await page.getByRole('button', { name: 'ย้อนการแก้ไขล่าสุด', exact: true }).click();
    await context.setOffline(false);
    await page.getByRole('button', { name: 'คัดลอกข้อมูลไปวันถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันคัดลอกวันถัดไป', exact: true }).click();
    await expect(page.getByRole('region', { name: 'ตัวอย่างคัดลอกวันถัดไป' })).toHaveCount(0);
    await page.getByRole('button', { name: 'คัดลอกข้อมูลไปวันถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันคัดลอกวันถัดไป', exact: true }).click();
    await expect(page.locator('section[aria-label="งานรายวัน"]').getByRole('alert')).toContainText(
      'มีอยู่แล้ว',
    );
    await page.reload();
    const data = await page.evaluate(async () => {
      const path = '/src/storage.ts';
      return (await import(path)).loadData('local');
    });
    const sessions = data.workspaces.filter((r: any) => r.recordType === 'daily');
    expect(sessions).toHaveLength(2);
    expect(sessions.some((s: any) => s.body.rows[0].tripCount === 0)).toBe(true);
    expect(data.workspaces.filter((r: any) => r.recordType === 'evidence')).toHaveLength(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2),
    ).toBe(true);
  });

test('P2: daily outbox retains failed synchronization and retries idempotently with simulated transport', async ({
  page,
}) => {
  await seed(page);
  await createRow(page);
  const result = await page.evaluate(async () => {
    const storagePath = '/src/storage.ts',
      syncPath = '/src/cloudSync.ts';
    const storage = await import(storagePath),
      sync = await import(syncPath);
    const remote = new Map<string, any>();
    let fail = true;
    const transport = {
      authorize: async () => {},
      pull: async () => ({ records: [], cursors: {} }),
      read: async () => null,
      push: async (_owner: string, collection: string, entry: any) => {
        if (fail && collection === 'workspaces') throw Error('synthetic connection interrupted');
        const key = `${collection}/${entry.desired.id}`;
        remote.set(key, entry.desired);
        return entry.desired;
      },
    };
    let error = '';
    try {
      await sync.synchronize('local', transport);
    } catch (e) {
      error = String(e);
    }
    const failed = await storage.loadData('local');
    fail = false;
    await sync.synchronize('local', transport);
    await sync.synchronize('local', transport);
    const restored = await storage.loadData('local');
    return {
      error,
      pending: Object.values(failed.sync.entries).some(
        (e: any) => e.status === 'pending' && e.error,
      ),
      synced: Object.values(restored.sync.entries).every((e: any) => e.status === 'synced'),
      sessions: [...remote.keys()].filter((key) => key.startsWith('workspaces/')).length,
      trips: restored.workspaces[0].body.rows[0].tripCount,
    };
  });
  expect(result).toMatchObject({ pending: true, synced: true, sessions: 1, trips: 3 });
  expect(result.error).toContain('synthetic connection interrupted');
});

test('tablet evidence capture and signature survive refresh; simulated upload acknowledgements enable explicit verify/close/reopen', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await seed(page);
  await createRow(page);
  await page.getByRole('button', { name: 'ยืนยัน 00123', exact: true }).click();
  await expect(page.locator('section[aria-label="งานรายวัน"]').getByRole('alert')).toContainText(
    'หลักฐาน',
  );
  await page.getByRole('button', { name: 'หลักฐาน 00123', exact: true }).click();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64',
  );
  await page
    .getByLabel('เลือกหลักฐานจากแกลเลอรี', { exact: true })
    .setInputFiles({ name: 'driver.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'บันทึกภาพต้นฉบับ', exact: true }).click();
  await expect(page.getByText('driver.png · อยู่ในคิวอัปโหลด', { exact: true })).toBeVisible();
  await page.getByLabel('ประเภทภาพหลักฐาน', { exact: true }).selectOption('trip-slip');
  await page.getByLabel('เลือกหลักฐานจากแกลเลอรี', { exact: true }).setInputFiles([
    { name: 'slip-1.png', mimeType: 'image/png', buffer: png },
    {
      name: 'slip-2.png',
      mimeType: 'image/png',
      buffer: Buffer.concat([png, Buffer.from('second original')]),
    },
  ]);
  await page.getByRole('button', { name: 'บันทึกภาพต้นฉบับ', exact: true }).click();
  await expect(page.getByText('slip-1.png · อยู่ในคิวอัปโหลด', { exact: true })).toBeVisible();
  await expect(page.getByText('slip-2.png · อยู่ในคิวอัปโหลด', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'บันทึกลายเซ็น', exact: true })).toBeEnabled();
  const canvas = page.getByLabel('พื้นที่ลงลายเซ็น', { exact: true });
  await canvas.click({ trial: true });
  const bounds = (await canvas.boundingBox())!,
    x = bounds.x + 40,
    y = bounds.y + 50;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let i = 1; i <= 4; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + i * 15, y: y + i * 5, id: 1 }],
    });
    // Chromium coalesces touch moves within a frame; let each stroke reach the canvas.
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.getByRole('button', { name: 'บันทึกลายเซ็น', exact: true }).click();
  await expect(page.getByText(/^สถานะหลักฐาน: พร้อมอัปโหลด/)).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true })
    .click();
  await page.getByRole('button', { name: 'หลักฐาน 00123', exact: true }).click();
  await expect(page.getByText(/^สถานะหลักฐาน: พร้อมอัปโหลด/)).toBeVisible();
  // Controlled external acknowledgement fixture; this is NOT a real Drive upload.
  await page.evaluate(async () => {
    const path = '/src/uploads.ts',
      module = await import(path);
    for (const record of await module.listUploads('local'))
      await module.putUpload({
        ...record,
        status: 'synced',
        driveId: `test-${record.id}`,
        folderId: 'test-private-folder',
      });
  });
  await page.getByRole('button', { name: 'ยืนยันยอดทั้งวัน', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^ตรวจสอบยืนยันแล้ว/ })).toBeVisible();
  await page.getByRole('button', { name: 'ปิดวันทำงาน', exact: true }).click();
  await expect(page.getByText('สถานะวัน: ปิดวันแล้ว', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เพิ่มเที่ยว 00123', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'เปิดวันใหม่พร้อมเหตุผล', exact: true }).click();
  await expect(page.locator('section[aria-label="งานรายวัน"]').getByRole('alert')).toContainText(
    'เหตุผล',
  );
  await page.getByLabel('เหตุผลแก้ไข', { exact: true }).fill('แก้หลักฐานจากหน้างาน');
  await page.getByRole('button', { name: 'เปิดวันใหม่พร้อมเหตุผล', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^เปิดวันเพื่อแก้ไข/ })).toBeVisible();
  const stored = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).loadData('local');
  });
  expect(stored.workspaces.find((r: any) => r.recordType === 'daily').body.closures[0].volume).toBe(
    36,
  );
  expect(stored.audit.some((a: any) => a.action === 'daily-reopen')).toBe(true);
  // Reopening starts a new proof generation. Historical evidence stays immutable.
  await expect(page.getByText(/^สถานะหลักฐาน: หลักฐานยังไม่ครบ/)).toBeVisible();
  await page.getByLabel('ประเภทภาพหลักฐาน', { exact: true }).selectOption('driver-photo');
  await page
    .getByLabel('เลือกหลักฐานจากแกลเลอรี', { exact: true })
    .setInputFiles({ name: 'driver-reopened.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'บันทึกภาพต้นฉบับ', exact: true }).click();
  await expect(
    page.getByText('driver-reopened.png · อยู่ในคิวอัปโหลด', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('ประเภทภาพหลักฐาน', { exact: true }).selectOption('trip-slip');
  await page
    .getByLabel('เลือกหลักฐานจากแกลเลอรี', { exact: true })
    .setInputFiles({ name: 'slip-reopened.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'บันทึกภาพต้นฉบับ', exact: true }).click();
  await expect(
    page.getByText('slip-reopened.png · อยู่ในคิวอัปโหลด', { exact: true }),
  ).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const freshBounds = (await canvas.boundingBox())!;
  await page.mouse.move(freshBounds.x + 30, freshBounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(freshBounds.x + 130, freshBounds.y + 65, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'บันทึกลายเซ็น', exact: true }).click();
  await expect(page.getByText(/^สถานะหลักฐาน: พร้อมอัปโหลด/)).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/uploads.ts',
      module = await import(path);
    for (const record of await module.listUploads('local'))
      await module.putUpload({
        ...record,
        status: 'synced',
        driveId: `test-${record.id}`,
        folderId: 'test-private-folder',
      });
  });
  // A new explicit verification preserves both closure snapshots.
  await page.getByRole('button', { name: 'ปิดวันทำงาน', exact: true }).click();
  await expect(page.locator('section[aria-label="งานรายวัน"]').getByRole('alert')).toContainText(
    'ยืนยัน',
  );
  await page.getByRole('button', { name: 'ยืนยันยอดทั้งวัน', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^ตรวจสอบยืนยันแล้ว/ })).toBeVisible();
  await page.getByRole('button', { name: 'ปิดวันทำงาน', exact: true }).click();
  await expect(page.getByText('สถานะวัน: ปิดวันแล้ว', { exact: true })).toBeVisible();
  await page.reload();
  const closed = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await (await import(path)).loadData('local')).workspaces.find(
      (r: any) => r.recordType === 'daily',
    );
  });
  expect(closed.body.state).toBe('closed');
  expect(closed.body.closures).toHaveLength(2);
  expect(closed.body.closures[0]).toEqual(
    stored.workspaces.find((r: any) => r.recordType === 'daily').body.closures[0],
  );
  expect(closed.body.closures[1]).toMatchObject({ trips: 3, volume: 36 });
});

const evidencePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
async function photo(page: Page, role: string, name: string, suffix = '') {
  await page.getByLabel('ประเภทภาพหลักฐาน', { exact: true }).selectOption(role);
  await page.getByLabel('เลือกหลักฐานจากแกลเลอรี', { exact: true }).setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: Buffer.concat([evidencePng, Buffer.from(suffix)]),
  });
  await page.getByRole('button', { name: 'บันทึกภาพต้นฉบับ', exact: true }).click();
  await expect(page.getByText(`${name} · อยู่ในคิวอัปโหลด`, { exact: true })).toBeVisible();
}
async function sign(page: Page) {
  const canvas = page.getByLabel('พื้นที่ลงลายเซ็น', { exact: true });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'บันทึกลายเซ็น', exact: true }).click();
  await expect(page.getByRole('button', { name: 'บันทึกลายเซ็น', exact: true })).toBeEnabled();
  await expect(page.getByText(/^ผู้ลงลายเซ็น: สมชาย/)).toBeVisible();
}
async function acknowledgeEvidence(page: Page) {
  // This fixture simulates Drive acknowledgement only; it never calls a real service.
  await page.evaluate(async () => {
    const path = '/src/uploads.ts',
      module = await import(path);
    for (const record of await module.listUploads('local'))
      await module.putUpload({
        ...record,
        status: 'synced',
        driveId: `synthetic-${record.id}`,
        folderId: 'synthetic-private',
      });
  });
}
test('P3: reject blank/cleared signatures, replace proof, invalidate/reconfirm totals and copy no evidence', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await seed(page);
  await createRow(page);
  await page.getByRole('button', { name: 'ปิดวันทำงาน', exact: true }).click();
  await expect(page.locator('section[aria-label="งานรายวัน"]').getByRole('alert')).toContainText(
    'ยืนยัน',
  );
  await page.getByRole('button', { name: 'หลักฐาน 00123', exact: true }).click();
  const evidence = page.getByRole('region', { name: 'หลักฐานประจำรถ', exact: true });
  await page.getByRole('button', { name: 'บันทึกลายเซ็น', exact: true }).click();
  await expect(evidence.getByRole('alert')).toContainText('ลงลายเซ็น');
  await photo(page, 'driver-photo', 'driver-proof.png');
  await photo(page, 'trip-slip', 'slip-proof.png');
  await sign(page);
  await page.getByRole('button', { name: 'ล้างลายเซ็น / ลงใหม่', exact: true }).click();
  await page.getByRole('button', { name: 'บันทึกลายเซ็น', exact: true }).click();
  await expect(evidence.getByRole('alert')).toContainText('ลงลายเซ็น');
  await sign(page);
  await acknowledgeEvidence(page);
  await page.getByRole('button', { name: 'ยืนยัน 00123', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^ตรวจสอบยืนยันแล้ว/ })).toBeVisible();
  await photo(page, 'driver-photo', 'replacement-proof.png', 'changed');
  await expect(page.getByRole('cell', { name: /^ยอดตรงกัน รอผู้จัดการยืนยัน/ })).toBeVisible();
  await acknowledgeEvidence(page);
  await page.getByRole('button', { name: 'ยืนยัน 00123', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^ตรวจสอบยืนยันแล้ว/ })).toBeVisible();
  await page.getByRole('button', { name: 'เพิ่มเที่ยว 00123', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^ยอดไม่ตรงกัน/ })).toBeVisible();
  await page.getByRole('button', { name: 'แก้ไข 00123', exact: true }).click();
  await page.getByLabel('เที่ยวรายงาน', { exact: true }).fill('4');
  await page.getByLabel('เหตุผลแก้ไข', { exact: true }).fill('ตรวจยอดตามใบเที่ยวใหม่');
  await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^ยอดตรงกัน รอผู้จัดการยืนยัน/ })).toBeVisible();
  await expect(page.getByText(/^สถานะหลักฐาน: หลักฐานยังไม่ครบ/)).toBeVisible();
  await photo(page, 'driver-photo', 'updated-driver.png');
  await photo(page, 'trip-slip', 'updated-slip.png');
  await sign(page);
  await acknowledgeEvidence(page);
  await page.getByRole('button', { name: 'ยืนยัน 00123', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^ตรวจสอบยืนยันแล้ว/ })).toBeVisible();
  await page.getByRole('button', { name: 'ปิดวันทำงาน', exact: true }).dblclick();
  await expect(page.getByText('สถานะวัน: ปิดวันแล้ว', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'คัดลอกข้อมูลไปวันถัดไป', exact: true }).click();
  await page.getByRole('button', { name: 'ยืนยันคัดลอกวันถัดไป', exact: true }).click();
  await expect(page.getByRole('region', { name: 'ตัวอย่างคัดลอกวันถัดไป' })).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    const data = await (await import(path)).loadData('local');
    const source = data.workspaces.find(
      (s: any) => s.recordType === 'daily' && s.body.state === 'closed',
    );
    const next = data.workspaces.find((s: any) => s.recordType === 'daily' && s.id !== source.id);
    const proof = data.workspaces.find(
      (s: any) =>
        s.recordType === 'evidence' &&
        s.body.sessionId === source.id &&
        s.body.fingerprint === source.body.verifications[source.body.rows[0].id].fingerprint,
    );
    return {
      closures: source.body.closures.length,
      trips: source.body.closures[0].trips,
      volume: source.body.closures[0].volume,
      nextTrips: next.body.rows[0].tripCount,
      nextEvidence: data.workspaces.filter(
        (s: any) => s.recordType === 'evidence' && s.body.sessionId === next.id,
      ).length,
      proof,
    };
  });
  expect(result).toMatchObject({
    closures: 1,
    trips: 4,
    volume: 48,
    nextTrips: 0,
    nextEvidence: 0,
  });
  expect(result.proof).toMatchObject({
    projectId: 'p',
    body: {
      driverId: 'driver',
      truckId: 'truck',
      signature: { signerId: 'driver', signerName: 'สมชาย' },
    },
  });
});

test('P3: content deduplication and interrupted upload preserve original bytes until simulated metadata retry succeeds', async ({
  page,
}) => {
  await seed(page);
  await createRow(page);
  await page.getByRole('button', { name: 'หลักฐาน 00123', exact: true }).click();
  await photo(page, 'driver-photo', 'retry-proof.png');
  const result = await page.evaluate(async () => {
    const uploadsPath = '/src/uploads.ts',
      evidencePath = '/src/evidence.ts',
      storagePath = '/src/storage.ts';
    const uploads = await import(uploadsPath),
      evidence = await import(evidencePath),
      storage = await import(storagePath);
    const data = await storage.loadData('local'),
      session = data.workspaces.find((s: any) => s.recordType === 'daily');
    const original = (await uploads.listUploads('local'))[0];
    await evidence.saveEvidence('local', session.id, session.body.rows[0].id, 'driver-photo', [
      new File([original.blob], 'retry-proof.png', { type: 'image/png' }),
    ]);
    let uploadFails = true,
      metadataFails = true;
    const ids: string[] = [],
      errors: string[] = [];
    const deps = {
      prepare: async (record: any) => ({
        ...record,
        driveId: record.driveId || 'synthetic-stable',
        folderId: 'synthetic-private',
      }),
      upload: async (record: any) => {
        ids.push(record.driveId);
        if (uploadFails) {
          uploadFails = false;
          throw Error('synthetic OAuth expired');
        }
      },
      metadata: async () => {
        if (metadataFails) {
          metadataFails = false;
          throw Error('synthetic interrupted metadata');
        }
      },
      save: uploads.putUpload,
    };
    const retained: boolean[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await uploads.processUpload((await uploads.listUploads('local'))[0], deps);
      } catch (error) {
        errors.push(String(error));
      }
      retained.push(!!(await uploads.listUploads('local'))[0].blob);
    }
    const queue = await uploads.listUploads('local');
    return { count: queue.length, ids, errors, retained, status: queue[0].status };
  });
  expect(result).toMatchObject({ count: 1, retained: [true, true, false], status: 'synced' });
  expect(result.errors).toHaveLength(2);
  expect(new Set(result.ids)).toEqual(new Set(['synthetic-stable']));
});

test('business XLSX/CSV and survey history use persisted values and produce downloadable files', async ({
  page,
}) => {
  await seed(page);
  await createRow(page);
  await page.getByRole('navigation').getByRole('button', { name: 'รายงาน', exact: true }).click();
  for (const label of ['ส่งออกรายงาน Excel', 'ส่งออกรายงาน CSV']) {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: label, exact: true }).click();
    const file = await event;
    const bytes = await readFile((await file.path())!);
    expect(bytes.length).toBeGreaterThan(100);
    if (label.endsWith('CSV')) expect(bytes.toString('utf8')).toContain("'00123");
    else expect(bytes.subarray(0, 2).toString()).toBe('PK');
  }
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'สำรวจและคำนวณ', exact: true })
    .click();
  await page.getByLabel('ระดับ BM (m)', { exact: true }).fill('100');
  await page.getByLabel('ระดับแบบที่จุดกำเนิด (m)', { exact: true }).fill('101');
  await page.getByLabel('กว้างแปลง (m)', { exact: true }).fill('10');
  await page.getByLabel('ยาวแปลง (m)', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'สร้าง / ปรับกริดตามขนาดแปลง', exact: true }).click();
  await expect(page.getByText(/ถมแน่น 100.000 m³/)).toBeVisible();
  await page.getByRole('button', { name: 'บันทึกประวัติสำรวจ', exact: true }).click();
  const id = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await (await import(path)).loadData('local')).workspaces.find(
      (r: any) => r.recordType === 'survey',
    ).id;
  });
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'สำรวจและคำนวณ', exact: true })
    .click();
  await page.getByLabel('ประวัติงานสำรวจ', { exact: true }).selectOption(id);
  await expect(page.getByLabel('ระดับ BM (m)', { exact: true })).toHaveValue('100');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ส่งออกสำรวจ Excel', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('survey-grid.xlsx');
});

test('production PWA caches lazy assets and preserves pending data through offline reload and first offline XLSX export', async ({
  page,
  context,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('http://127.0.0.1:5175/construction-ops/');
  await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'โครงการ', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('PWA offline project');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'PWA offline project', exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('PWA offline project', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'รายงาน', exact: true }).click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ส่งออกรายงาน Excel', exact: true }).click();
  expect((await event).suggestedFilename()).toBe('daily-report.xlsx');
  expect(failures).toEqual([]);
  await context.setOffline(false);
});

test('P2/P3: production daily trips and original evidence survive a genuinely offline page reload', async ({
  page,
  context,
}) => {
  await page.goto('http://127.0.0.1:5175/construction-ops/');
  await expect(page.getByText('เริ่มต้นโครงการแรก', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('construction-ops');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const base = { createdAt: '2026-11-06T00:00:00Z', updatedAt: '2026-11-06T00:00:00Z' };
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite');
      transaction.objectStore('state').put(
        {
          projects: [
            {
              ...base,
              id: 'p',
              name: 'Offline daily',
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
              capacity: 12,
              active: true,
            },
            {
              ...base,
              id: 'driver',
              kind: 'driver',
              name: 'สมชาย',
              detail: '',
              capacity: 0,
              active: true,
            },
          ],
          trips: [],
          audit: [],
        },
        'local',
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true })
    .click();
  await page.getByRole('button', { name: 'สร้างวันทำงาน', exact: true }).click();
  await page.getByLabel('รถทำงาน', { exact: true }).selectOption('truck');
  await page.getByLabel('คนขับทำงาน', { exact: true }).selectOption('driver');
  await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เพิ่มเที่ยว 00123', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'เพิ่มเที่ยว 00123', exact: true }).click();
  await expect(page.getByText(/เที่ยวบันทึก 1 · ปริมาตร 12 m³/)).toBeVisible();
  await page.getByRole('button', { name: 'หลักฐาน 00123', exact: true }).click();
  await photo(page, 'driver-photo', 'offline-driver.png');
  await photo(page, 'trip-slip', 'offline-slip.png');
  await sign(page);
  await expect(page.getByText(/^สถานะหลักฐาน: พร้อมอัปโหลด/)).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true })
    .click();
  await expect(page.getByText(/เที่ยวบันทึก 1 · ปริมาตร 12 m³/)).toBeVisible();
  await page.getByRole('button', { name: 'หลักฐาน 00123', exact: true }).click();
  await expect(page.getByText(/^สถานะหลักฐาน: พร้อมอัปโหลด/)).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'ภาพที่บันทึก offline-driver.png', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'ภาพที่บันทึก offline-slip.png', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'ภาพที่บันทึก signature.png', exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
});

test('P6: mixed capacity reconciliation preserves mismatches in the UI, CSV and XLSX and rejects invalid ranges', async ({
  page,
}) => {
  await seed(page);
  await createRow(page);
  await page.getByRole('button', { name: 'แก้ไข 00123', exact: true }).click();
  await page.getByLabel('ความจุต่อเที่ยว', { exact: true }).fill('20');
  await page.getByLabel('เที่ยวบันทึก', { exact: true }).fill('4');
  await page.getByLabel('เที่ยวรายงาน', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
  await expect(page.locator('section[aria-label="งานรายวัน"]').getByRole('alert')).toContainText(
    'เหตุผล',
  );
  await page.getByLabel('เหตุผลแก้ไข', { exact: true }).fill('ตรวจยอดตามใบเที่ยวใหม่');
  await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^ยอดไม่ตรงกัน/ })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'รายงาน', exact: true }).click();
  await page.getByLabel('รูปแบบรายงาน', { exact: true }).selectOption('verification');
  const row = page.locator('section[aria-label="รายงานธุรกิจ"] tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(6)).toHaveText('4');
  await expect(row.locator('td').nth(7)).toHaveText('5');
  await expect(row.locator('td').nth(8)).toHaveText('-1');
  await expect(row.locator('td').nth(9)).toContainText('หลายความจุ');
  await expect(row.locator('td').nth(10)).toHaveText('56');
  for (const format of ['CSV', 'Excel']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `ส่งออกรายงาน ${format}`, exact: true }).click();
    const bytes = await readFile((await (await download).path())!);
    if (format === 'CSV') {
      expect(bytes.toString('utf8')).toContain('"4","5","\'-1"');
      expect(bytes.toString('utf8')).toContain('หลายความจุ');
    } else {
      const { readSheet } = await import('read-excel-file/universal');
      const sheet = await readSheet(Uint8Array.from(bytes).buffer, 'รายงาน');
      expect(sheet[1].slice(6, 11)).toEqual([4, 5, -1, 'หลายความจุ (ใช้ snapshot รายเที่ยว)', 56]);
    }
  }
  await page.getByLabel('รายงานตั้งแต่วันที่', { exact: true }).fill('2026-12-01');
  await page.getByLabel('รายงานถึงวันที่', { exact: true }).fill('2026-01-01');
  await expect(page.getByRole('alert')).toContainText('ช่วงวันที่');
  await expect(page.getByRole('button', { name: 'ส่งออกรายงาน CSV', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'ส่งออกรายงาน Excel', exact: true }),
  ).toBeDisabled();
});

test('P6: calendar reports apply date filters before grouping and export Bangkok metadata with optional references', async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(async () => {
    const storagePath = '/src/storage.ts',
      dailyPath = '/src/daily.ts';
    const storage = await import(storagePath),
      daily = await import(dailyPath);
    await storage.updateData('local', (initial: any) => {
      let data = initial;
      for (const date of ['2026-12-31', '2027-01-01', '2027-01-04']) {
        data = daily.createDaily(data, 'p', date, 'local');
        data = daily.saveDailyRow(
          data,
          daily.sessionId('p', date),
          1,
          {
            id: `row-${date}`,
            truckId: 'truck',
            driverId: 'driver',
            sourceId: 'source',
            teamId: 'team',
            soilType: '',
            tripCount: 1,
            capacity: 12,
            reportedTrips: null,
            notes: '',
          },
          'local',
        );
      }
      return data;
    });
  });
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'รายงาน', exact: true }).click();
  await page.getByLabel('รูปแบบรายงาน', { exact: true }).selectOption('weekly');
  const rows = page.locator('section[aria-label="รายงานธุรกิจ"] tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('td').nth(0)).toHaveText('2026-12-28');
  await expect(rows.first().locator('td').nth(4)).toHaveText('24');
  await page.getByLabel('รายงานตั้งแต่วันที่', { exact: true }).fill('2027-01-01');
  await expect(rows.first().locator('td').nth(4)).toHaveText('12');
  await page.getByLabel('รูปแบบรายงาน', { exact: true }).selectOption('monthly');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('td').nth(0)).toHaveText('2027-01');
  await expect(rows.first().locator('td').nth(4)).toHaveText('24');
  await page.getByLabel('แนบเลขอ้างอิงหลักฐาน', { exact: true }).check();
  await expect(
    page.getByRole('columnheader', { name: 'เลขอ้างอิงหลักฐาน', exact: true }),
  ).toBeVisible();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ส่งออกรายงาน Excel', exact: true }).click();
  const bytes = await readFile((await (await event).path())!);
  const { readSheet } = await import('read-excel-file/universal');
  const metadata = await readSheet(Uint8Array.from(bytes).buffer, 'ข้อมูลรายงาน');
  expect(metadata.flat()).toContain('สร้างเมื่อ (Asia/Bangkok)');
  expect(metadata.flat().join(' ')).toContain('from=2027-01-01');
  expect(metadata.flat().join(' ')).toContain('ปริมาตรดินหลวม');
  await page.getByLabel('รายงานตั้งแต่วันที่', { exact: true }).fill('2028-01-01');
  await expect(rows).toHaveCount(1);
  await expect(rows.locator('.empty-results')).toHaveText(
    'ยังไม่พบรายการในช่วงที่เลือก ลองเปลี่ยนวันที่หรือกดล้างตัวกรองรายงาน',
  );
  await expect(rows.getByRole('cell')).toHaveCount(1);
});

test('P7: survey import previews safely, rejects stale/invalid data, persists exact levels and roundtrips XLSX with correct Y orientation', async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'สำรวจและคำนวณ', exact: true })
    .click();
  for (const label of ['กว้างแปลง (m)', 'ยาวแปลง (m)', 'ระยะกริด X (m)', 'ระยะกริด Y (m)'])
    await page.getByLabel(label, { exact: true }).fill('10');
  await page.getByLabel('ระดับ BM (m)', { exact: true }).fill('0');
  await page.getByLabel('ระดับแบบที่จุดกำเนิด (m)', { exact: true }).fill('1');
  await page.getByLabel('ผิวออกแบบ', { exact: true }).selectOption('custom');
  await page.getByRole('button', { name: 'สร้าง / ปรับกริดตามขนาดแปลง', exact: true }).click();
  const input = page.getByLabel('นำเข้าจุดสำรวจ CSV / Excel', { exact: true });
  const csv = Buffer.from(
    '\uFEFFจุด,X m,Y m,ระดับเดิม m,ระดับแบบ m\r\nG0-0,0,0,-1,1\r\nG1-0,10,0,-1,1\r\nG0-1,0,10,-1,1\r\nG1-1,10,10,-1,1',
    'utf8',
  );
  const upload = () =>
    input.setInputFiles({ name: 'points.csv', mimeType: 'text/csv', buffer: csv });
  await upload();
  await expect(page.getByRole('region', { name: 'ตัวอย่างนำเข้าจุดสำรวจ' })).toContainText('4 จุด');
  await expect(page.getByLabel('ระดับเดิม G0-0', { exact: true })).toHaveValue('0');
  await page.getByLabel('ระดับ BM (m)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'ยืนยันนำเข้าจุดสำรวจ', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('ข้อมูลสำรวจเปลี่ยน');
  await expect(page.getByLabel('ระดับเดิม G0-0', { exact: true })).toHaveValue('0');
  await page.getByLabel('ระดับ BM (m)', { exact: true }).fill('0');
  await upload();
  await page.getByRole('button', { name: 'ยืนยันนำเข้าจุดสำรวจ', exact: true }).click();
  await expect(page.getByLabel('ระดับเดิม G0-0', { exact: true })).toHaveValue('-1');
  await expect(page.getByText(/ถมแน่น 200.000 m³/)).toBeVisible();
  const grid = page.getByRole('img', { name: 'กริดระดับเดิม แบบ และตัดถม', exact: true });
  await expect(grid.locator('circle[data-point-id="G0-0"]')).toHaveAttribute('cy', '10');
  await expect(grid.locator('circle[data-point-id="G0-1"]')).toHaveAttribute('cy', '0');
  await page.getByRole('button', { name: 'บันทึกประวัติสำรวจ', exact: true }).click();
  const id = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await (await import(path)).loadData('local')).workspaces.find(
      (record: any) => record.recordType === 'survey',
    ).id;
  });
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'สำรวจและคำนวณ', exact: true })
    .click();
  await page.getByLabel('ประวัติงานสำรวจ', { exact: true }).selectOption(id);
  await expect(page.getByLabel('ระดับเดิม G0-0', { exact: true })).toHaveValue('-1');
  await input.setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('bad,header\r\n1,2'),
  });
  await expect(page.getByRole('alert')).toContainText('หัวตาราง');
  await expect(page.getByLabel('ระดับเดิม G0-0', { exact: true })).toHaveValue('-1');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ส่งออกสำรวจ Excel', exact: true }).click();
  const bytes = await readFile((await (await event).path())!);
  // A tiny archive can declare enormous XML output; reject it before decompression.
  const oversizedArchive = Buffer.from(bytes);
  let directory = -1;
  for (let at = oversizedArchive.length - 22; at >= 0; at--) {
    if (oversizedArchive.readUInt32LE(at) === 0x06054b50) {
      directory = oversizedArchive.readUInt32LE(at + 16);
      break;
    }
  }
  expect(directory).toBeGreaterThanOrEqual(0);
  oversizedArchive.writeUInt32LE(1024 * 1024 * 1024, directory + 24);
  await input.setInputFiles({
    name: 'oversized-expansion.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: oversizedArchive,
  });
  await expect(page.getByRole('alert')).toContainText('หลังแตกไฟล์');
  await expect(page.getByLabel('ระดับเดิม G0-0', { exact: true })).toHaveValue('-1');
  await expect(page.getByRole('region', { name: 'ตัวอย่างนำเข้าจุดสำรวจ' })).toHaveCount(0);

  await page.getByLabel('ระดับเดิม G0-0', { exact: true }).fill('0');
  await input.setInputFiles({
    name: 'roundtrip.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: bytes,
  });
  await expect(page.getByRole('region', { name: 'ตัวอย่างนำเข้าจุดสำรวจ' })).toContainText('4 จุด');
  await page.getByRole('button', { name: 'ยืนยันนำเข้าจุดสำรวจ', exact: true }).click();
  await expect(page.getByLabel('ระดับเดิม G0-0', { exact: true })).toHaveValue('-1');
  await page.getByLabel('ระดับเดิม G1-0', { exact: true }).fill('1');
  await expect(grid.locator('line[data-contour-level]').first()).toBeVisible();
});

test('P8: coarse-pointer tablet targets remain usable and report controls work by keyboard', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 800, height: 1280 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await seed(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await page.getByRole('navigation').getByRole('button', { name: 'รายงาน', exact: true }).click();
    const panel = page.locator('section[aria-label="รายงานธุรกิจ"]');
    for (const control of [
      panel.getByLabel('รูปแบบรายงาน', { exact: true }),
      panel.getByRole('button', { name: 'ส่งออกรายงาน CSV', exact: true }),
      panel.getByRole('button', { name: 'หน้าถัดไป', exact: true }),
    ]) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
    }
    const checkbox = panel.getByLabel('แนบเลขอ้างอิงหลักฐาน', { exact: true });
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    await expect(
      panel.getByRole('columnheader', { name: 'เลขอ้างอิงหลักฐาน', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  } finally {
    await context.close();
  }
});

test('desktop report columns scroll within their table without widening the whole page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page);
  await createRow(page);
  await page.getByRole('navigation').getByRole('button', { name: 'รายงาน', exact: true }).click();
  const panel = page.locator('section[aria-label="รายงานธุรกิจ"]');
  await panel.getByLabel('แนบเลขอ้างอิงหลักฐาน', { exact: true }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const scroll = panel.locator('.table-scroll');
  const scrolled = await scroll.evaluate((element) => {
    const wide = element.scrollWidth > element.clientWidth;
    element.scrollLeft = element.scrollWidth;
    return { wide, left: element.scrollLeft };
  });
  expect(scrolled.wide).toBe(true);
  expect(scrolled.left).toBeGreaterThan(0);
  const lastColumn = await panel
    .getByRole('columnheader', { name: 'เลขอ้างอิงหลักฐาน', exact: true })
    .boundingBox();
  expect(lastColumn!.x + lastColumn!.width).toBeLessThanOrEqual(1441);
});

test('preferred project persists without replacing an existing daily draft; duplicate reviews preserve trips', async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(async () => {
    const path = '/src/storage.ts';
    await (
      await import(path)
    ).updateData('local', (data: any) => ({
      ...data,
      projects: [...data.projects, { ...data.projects[0], id: 'p2', name: 'Preferred site' }],
      trips: ['duplicate-a', 'duplicate-b'].map((id) => ({
        id,
        createdAt: '2026-11-06T00:00:00Z',
        updatedAt: '2026-11-06T00:00:00Z',
        projectId: 'p',
        date: '2026-11-06',
        time: '10:00',
        truckId: 'truck',
        driverId: 'driver',
        sourceId: 'source',
        soilType: '',
        notes: '',
        revision: 1,
        syncStatus: 'pending',
      })),
    }));
  });
  await page.reload();
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'การตั้งค่า', exact: true }).click();
  await page.getByLabel('เลือกโครงการเริ่มต้น', { exact: true }).selectOption('p2');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/projectPreference.ts';
        return (await import(path)).loadProjectPreference('local');
      }),
    )
    .toBe('p2');
  await page.reload();
  await nav.getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true }).click();
  await expect(page.getByLabel('โครงการทำงาน', { exact: true })).toHaveValue('p2');
  await page.getByLabel('โครงการทำงาน', { exact: true }).selectOption('p');
  await nav.getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await page.getByLabel('มุมมองเที่ยวรถ', { exact: true }).selectOption('duplicates');
  const duplicates = page.getByRole('region', { name: 'ตรวจเที่ยวที่อาจซ้ำ' });
  await expect(duplicates).toContainText('พบ 1 กลุ่ม');
  await duplicates.getByLabel('เหตุผลตรวจเที่ยวซ้ำ').fill('ตรวจตั๋วแล้ว คนละเที่ยว');
  await duplicates.getByRole('button', { name: 'บันทึกผลตรวจเที่ยวซ้ำ', exact: true }).click();
  await expect(duplicates.getByRole('status')).toContainText('ยืนยันว่าเป็นคนละเที่ยว');
  await page.reload();
  await nav.getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true }).click();
  await expect(page.getByLabel('โครงการทำงาน', { exact: true })).toHaveValue('p');
  await nav.getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await page.getByLabel('มุมมองเที่ยวรถ', { exact: true }).selectOption('duplicates');
  await expect(duplicates.getByRole('status')).toContainText('ตรวจตั๋วแล้ว คนละเที่ยว');
  expect(
    await page.evaluate(async () => {
      const path = '/src/storage.ts';
      return (await (await import(path)).loadData('local')).trips.length;
    }),
  ).toBe(2);
});
