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
