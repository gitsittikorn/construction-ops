import { test, expect, type Page } from '@playwright/test';

const navDaily = (page: Page) =>
  page
    .getByRole('navigation')
    .getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true })
    .click();
async function seed(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const fixtures = '/src/test/syncFixtures.ts',
      storage = '/src/storage.ts';
    const { fixture, truck } = await import(fixtures);
    const data = fixture();
    data.trips = [];
    data.masters = [
      { ...truck, id: 'truck', name: 'P2 Truck A', capacity: 0, truckType: 'six-wheel' },
      { ...truck, id: 'truck-b', name: 'P2 Truck B', capacity: 10 },
      { ...truck, id: 'driver-a', kind: 'driver', name: 'P2 Driver A' },
      { ...truck, id: 'driver-b', kind: 'driver', name: 'P2 Driver B' },
      { ...truck, id: 'source', kind: 'source', name: 'P2 Source' },
      { ...truck, id: 'soil', kind: 'soilType', name: 'P2 Soil' },
    ];
    await (await import(storage)).persistData('local', data);
  });
  await page.reload();
  await navDaily(page);
  await page.getByLabel('วันที่ทำงาน', { exact: true }).fill('2026-12-31');
  await page.getByRole('button', { name: 'สร้างวันทำงาน', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'เพิ่มรถในวันทำงาน' })).toBeVisible();
}
async function add(page: Page, truck: string, driver: string, count: number) {
  await page.getByLabel('รถทำงาน', { exact: true }).selectOption(truck);
  await page.getByLabel('คนขับทำงาน', { exact: true }).selectOption(driver);
  await page.getByLabel('แหล่งดินทำงาน', { exact: true }).selectOption('source');
  await page.getByLabel('ชนิดดินทำงาน', { exact: true }).selectOption('P2 Soil');
  await page.getByLabel('เที่ยวบันทึก', { exact: true }).fill(String(count));
  await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: `เพิ่มเที่ยว ${truck === 'truck' ? 'P2 Truck A' : 'P2 Truck B'}`,
      exact: true,
    }),
  ).toBeVisible();
}
async function stored(page: Page) {
  return page.evaluate(async () => {
    const storage = '/src/storage.ts';
    return (await import(storage)).loadData('local');
  });
}

for (const viewport of [
  { width: 800, height: 1280 },
  { width: 1280, height: 800 },
])
  test(`P2 tablet ${viewport.width}: multiple trucks, snapshots, correction, preview and duplicate next day`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await seed(page);
    await add(page, 'truck', 'driver-a', 10);
    await expect(page.getByText(/เที่ยวบันทึก 10 · ปริมาตร 60 m³/)).toBeVisible();
    await add(page, 'truck-b', 'driver-b', 2);
    await expect(page.getByText(/เที่ยวบันทึก 12 · ปริมาตร 80 m³/)).toBeVisible();
    await page.getByRole('button', { name: 'แก้ไข P2 Truck A', exact: true }).click();
    await page.getByLabel('ความจุต่อเที่ยว', { exact: true }).fill('8');
    await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'เพิ่มรถในวันทำงาน' })).toBeVisible();
    await expect(page.getByText(/เที่ยวบันทึก 12 · ปริมาตร 80 m³/)).toBeVisible();
    const plus = page.getByRole('button', { name: 'เพิ่มเที่ยว P2 Truck A', exact: true });
    expect((await plus.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await plus.dblclick();
    await expect(page.getByText(/เที่ยวบันทึก 13 · ปริมาตร 88 m³/)).toBeVisible();
    const before = (await stored(page)).workspaces.find((s: any) => s.body.date === '2026-12-31');
    expect(before.body.rows.find((r: any) => r.truckId === 'truck').transactions).toHaveLength(11);
    await page.getByText('แก้ไขเที่ยวรายรายการพร้อมเหตุผล', { exact: true }).click();
    const correctedTrip = before.body.rows.find((r: any) => r.truckId === 'truck').transactions[0];
    await page.getByLabel('เที่ยวที่ต้องแก้ไข', { exact: true }).selectOption(correctedTrip.id);
    await page.getByLabel('ความจุเที่ยวที่แก้ไข', { exact: true }).fill('7');
    await page.getByLabel('เหตุผลแก้ไขเที่ยว', { exact: true }).fill('ตรวจใบเที่ยวแก้ความจุ');
    await page.getByRole('button', { name: 'บันทึกแก้ไขเที่ยว', exact: true }).click();
    await expect(page.getByText(/เที่ยวบันทึก 13 · ปริมาตร 89 m³/)).toBeVisible();
    const originalDay = (await stored(page)).workspaces.find(
      (s: any) => s.body.date === '2026-12-31',
    );
    await page.getByLabel('กรองรถรายวัน').selectOption('truck-b');
    await expect(plus).toHaveCount(0);
    await page.getByLabel('กรองรถรายวัน').selectOption('');
    await page.getByLabel('กรองคนขับรายวัน').selectOption('driver-a');
    await expect(
      page.getByRole('button', { name: 'เพิ่มเที่ยว P2 Truck B', exact: true }),
    ).toHaveCount(0);
    await page.getByLabel('กรองคนขับรายวัน').selectOption('');
    await page.getByRole('button', { name: 'คัดลอกข้อมูลไปวันถัดไป', exact: true }).click();
    await expect(page.getByRole('region', { name: 'ตัวอย่างคัดลอกวันถัดไป' })).toContainText(
      '2027-01-01',
    );
    expect(
      (await stored(page)).workspaces.filter((s: any) => s.recordType === 'daily'),
    ).toHaveLength(1);
    await page.getByRole('button', { name: 'ยกเลิกคัดลอก', exact: true }).click();
    await page.getByRole('button', { name: 'คัดลอกข้อมูลไปวันถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันคัดลอกวันถัดไป', exact: true }).dblclick();
    await expect(page.getByRole('region', { name: 'ตัวอย่างคัดลอกวันถัดไป' })).toHaveCount(0);
    await page.getByRole('button', { name: 'คัดลอกข้อมูลไปวันถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันคัดลอกวันถัดไป', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'งานรายวัน', exact: true }).getByRole('alert'),
    ).toContainText('มีอยู่แล้ว');
    await page.getByRole('button', { name: 'ยกเลิกคัดลอก', exact: true }).click();
    const after = await stored(page),
      sessions = after.workspaces.filter((s: any) => s.recordType === 'daily');
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s: any) => s.body.date === '2026-12-31')).toEqual(originalDay);
    const next = sessions.find((s: any) => s.body.date === '2027-01-01');
    expect(next.body.rows.every((r: any) => r.tripCount === 0 && r.transactions.length === 0)).toBe(
      true,
    );
    expect(next.body.rows[0].id).not.toBe(before.body.rows[0].id);
    await page.screenshot({
      path: `docs/screenshots/phase2-daily-${viewport.width}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
  });

test('P2 unsaved draft and context survive navigation and refresh without creating trip records', async ({
  page,
}) => {
  await seed(page);
  await page.getByLabel('รถทำงาน', { exact: true }).selectOption('truck');
  await page.getByLabel('คนขับทำงาน', { exact: true }).selectOption('driver-a');
  await page.getByLabel('หมายเหตุงาน', { exact: true }).fill('ร่างยังไม่ได้ส่ง');
  await expect(page.getByText('เก็บร่างในเครื่องแล้ว', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'โครงการ', exact: true }).click();
  await navDaily(page);
  await expect(page.getByLabel('หมายเหตุงาน', { exact: true })).toHaveValue('ร่างยังไม่ได้ส่ง');
  await page.reload();
  await navDaily(page);
  await expect(page.getByLabel('วันที่ทำงาน', { exact: true })).toHaveValue('2026-12-31');
  await expect(page.getByLabel('รถทำงาน', { exact: true })).toHaveValue('truck');
  await expect(page.getByLabel('ความจุต่อเที่ยว', { exact: true })).toHaveValue('6');
  await expect(page.getByLabel('หมายเหตุงาน', { exact: true })).toHaveValue('ร่างยังไม่ได้ส่ง');
  expect((await stored(page)).workspaces[0].body.rows).toHaveLength(0);
});

test('P2 production PWA daily pending transactions and draft survive an offline restart', async ({
  page,
  context,
}) => {
  await page.goto('http://127.0.0.1:5175');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('P2 Offline');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true })
    .click();
  await page.getByRole('button', { name: 'เพิ่มข้อมูล', exact: true }).click();
  await page.getByLabel('ทะเบียนรถ', { exact: true }).fill('P2-OFFLINE');
  await page.getByLabel('ความจุ (m³)', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await navDaily(page);
  await context.setOffline(true);
  await page.getByLabel('วันที่ทำงาน', { exact: true }).fill('2026-11-06');
  await page.getByRole('button', { name: 'สร้างวันทำงาน', exact: true }).click();
  await page.getByLabel('รถทำงาน', { exact: true }).selectOption({ label: 'P2-OFFLINE' });
  await page.getByRole('button', { name: 'บันทึกยอดรถ', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มเที่ยว P2-OFFLINE', exact: true }).dblclick();
  await expect(page.getByText(/เที่ยวบันทึก 1 · ปริมาตร 6 m³/)).toBeVisible();
  await page.getByLabel('หมายเหตุงาน', { exact: true }).fill('offline draft');
  await expect(page.getByText('เก็บร่างในเครื่องแล้ว', { exact: true })).toBeVisible();
  await page.reload();
  await navDaily(page);
  await expect(page.getByText(/เที่ยวบันทึก 1 · ปริมาตร 6 m³/)).toBeVisible();
  await expect(page.getByLabel('หมายเหตุงาน', { exact: true })).toHaveValue('offline draft');
  await expect(
    page.getByText('วันทำงานบันทึกในเครื่อง — รอซิงก์ Cloud', { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.getByText('วันทำงานบันทึกในเครื่อง — รอซิงก์ Cloud', { exact: true }),
  ).toBeVisible();
});
