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
  await expect(page.getByRole('cell', { name: /^MATCHED / })).toBeVisible();
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
  const input = page.getByLabel(/^ความจุเที่ยว /).first();
  await input.fill('10');
  await page.getByRole('button', { name: 'แก้ไขรายเที่ยว', exact: true }).first().click();
  await expect(page.locator('section[aria-label="งานรายวัน"]').getByRole('alert')).toContainText(
    'เหตุผล',
  );
  await page.getByLabel('เหตุผลแก้ไข', { exact: true }).fill('ตรวจความจุจริง');
  await page.getByRole('button', { name: 'แก้ไขรายเที่ยว', exact: true }).first().click();
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
    await expect(page.getByRole('cell', { name: /^MISMATCHED / })).toBeVisible();
    const state = await page.evaluate(async () => {
      const path = '/src/storage.ts';
      const data = await (await import(path)).loadData('local');
      return data.workspaces.find((r: any) => r.recordType === 'daily').body.rows[0].tripCount;
    });
    expect(state).toBe(4);
    await page.getByRole('button', { name: 'ย้อนการแก้ไขล่าสุด', exact: true }).click();
    await context.setOffline(false);
    await page.getByRole('button', { name: 'คัดลอกข้อมูลไปวันถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'คัดลอกข้อมูลไปวันถัดไป', exact: true }).click();
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
  const canvas = page.getByLabel('พื้นที่ลงลายเซ็น', { exact: true });
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!,
    x = bounds.x + 40,
    y = bounds.y + 50;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let i = 1; i <= 4; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + i * 15, y: y + i * 5, id: 1 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.getByRole('button', { name: 'บันทึกลายเซ็น', exact: true }).click();
  await expect(page.getByText(/^สถานะหลักฐาน: READY /)).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true })
    .click();
  await page.getByRole('button', { name: 'หลักฐาน 00123', exact: true }).click();
  await expect(page.getByText(/^สถานะหลักฐาน: READY /)).toBeVisible();
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
  await expect(page.getByRole('cell', { name: /^VERIFIED / })).toBeVisible();
  await page.getByRole('button', { name: 'ปิดวันทำงาน', exact: true }).click();
  await expect(page.getByText('สถานะวัน: ปิดวันแล้ว', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เพิ่มเที่ยว 00123', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'เปิดวันใหม่พร้อมเหตุผล', exact: true }).click();
  await expect(page.locator('section[aria-label="งานรายวัน"]').getByRole('alert')).toContainText(
    'เหตุผล',
  );
  await page.getByLabel('เหตุผลแก้ไข', { exact: true }).fill('แก้หลักฐานจากหน้างาน');
  await page.getByRole('button', { name: 'เปิดวันใหม่พร้อมเหตุผล', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^REOPENED / })).toBeVisible();
  const stored = await page.evaluate(async () => {
    const path = '/src/storage.ts';
    return (await import(path)).loadData('local');
  });
  expect(stored.workspaces.find((r: any) => r.recordType === 'daily').body.closures[0].volume).toBe(
    36,
  );
  expect(stored.audit.some((a: any) => a.action === 'daily-reopen')).toBe(true);
});

test('business XLSX/CSV and survey history use persisted values and produce downloadable files', async ({
  page,
}) => {
  await seed(page);
  await createRow(page);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'รายงานธุรกิจ', exact: true })
    .click();
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
  await page.goto('http://127.0.0.1:5175');
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
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'รายงานธุรกิจ', exact: true })
    .click();
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ส่งออกรายงาน Excel', exact: true }).click();
  expect((await event).suggestedFilename()).toBe('daily-report.xlsx');
  expect(failures).toEqual([]);
  await context.setOffline(false);
});
