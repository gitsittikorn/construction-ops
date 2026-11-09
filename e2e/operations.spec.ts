import { test, expect } from '@playwright/test';
test('project coordinates can be added, edited, opened in Maps and cleared without deleting the project', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('Coordinate site');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'โครงการ', exact: true }).click();
  await page.getByRole('button', { name: /ดู \/ แก้ไข/ }).click();
  await page.getByLabel('พิกัด (Lat, Lng)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('ให้ครบ');
  await page.getByLabel('พิกัด (Lat, Lng)', { exact: true }).fill('0, 0');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page.getByRole('link', { name: 'เปิด Google Maps ที่พิกัด 0, 0' })).toBeVisible();
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'โครงการ', exact: true }).click();
  const link = page.getByRole('link', { name: 'เปิด Google Maps ที่พิกัด 0, 0' });
  await expect(link).toBeVisible();
  await context.route('https://www.google.com/maps/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><title>Maps URL test</title></html>' }),
  );
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(new URL(popup.url()).searchParams.get('query')).toBe('0,0');
  await popup.close();
  await page.getByRole('button', { name: /ดู \/ แก้ไข/ }).click();
  await expect(page.getByLabel('พิกัด (Lat, Lng)', { exact: true })).toHaveValue('0, 0');
  await page.getByLabel('พิกัด (Lat, Lng)', { exact: true }).fill('-13.1234567, 100.7654321');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'เปิด Google Maps ที่พิกัด -13.1234567, 100.7654321' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /ดู \/ แก้ไข/ }).click();
  await page.getByLabel('พิกัด (Lat, Lng)', { exact: true }).clear();
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /เปิด Google Maps/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Coordinate site', exact: true })).toBeVisible();
});
test('settings audit history scrolls inside a bounded panel and retains old entries', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByText('เริ่มต้นโครงการแรก', { exact: true }).waitFor();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('construction-ops');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('state', 'readwrite');
        tx.objectStore('state').put(
          {
            projects: [],
            masters: [],
            trips: [],
            audit: Array.from({ length: 40 }, (_, index) => ({
              id: `event-${index}`,
              entityId: `entity-${index}`,
              action: `history-event-${index}`,
              at: '2026-11-02T10:00:00Z',
              actor: 'local',
              before: null,
              after: null,
            })),
          },
          'local',
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'การตั้งค่า', exact: true })
    .click();
  const history = page.getByRole('region', { name: 'รายการประวัติการเปลี่ยนแปลง', exact: true });
  await expect(history.locator('.audit-row')).toHaveCount(40);
  const metrics = await history.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    panelHeight: element.parentElement!.getBoundingClientRect().height,
  }));
  expect(metrics.clientHeight).toBeLessThanOrEqual(300);
  expect(metrics.panelHeight).toBeLessThanOrEqual(420);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  await history.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await history.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(history.getByText('history-event-0', { exact: true })).toBeAttached();
});
test('soil types can be created, edited and selected, while old trip names survive deactivation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('Soil project');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มข้อมูล', exact: true }).click();
  await page.getByLabel('ทะเบียนรถ', { exact: true }).fill('81-2222');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page.getByRole('button', { name: 'ชนิดดิน', exact: true }).click();
  await page.getByRole('button', { name: 'เพิ่มข้อมูล', exact: true }).click();
  await page.getByLabel('ชื่อชนิดดิน', { exact: true }).fill('ดินถม');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page.getByRole('button', { name: /ดินถม.*ใช้งาน/ }).click();
  await page.getByLabel('ชื่อชนิดดิน', { exact: true }).fill('ดินลูกรัง');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page.getByRole('button', { name: /ดินลูกรัง.*ใช้งาน/ })).toBeVisible();
  await page.reload();
  await nav.getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'รถบรรทุก *', exact: true })
    .selectOption({ label: '81-2222' });
  await page
    .getByRole('combobox', { name: 'ชนิดดิน', exact: true })
    .selectOption({ label: 'ดินลูกรัง' });
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await nav.getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true }).click();
  await page.getByRole('button', { name: 'ชนิดดิน', exact: true }).click();
  await page.getByRole('button', { name: /ดินลูกรัง.*ใช้งาน/ }).click();
  await page.getByRole('combobox', { name: 'สถานะ', exact: true }).selectOption('false');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await nav.getByRole('button', { name: /^บันทึกเที่ยวรถ/ }).click();
  await page.getByRole('button', { name: /แก้ไขเที่ยวรถ/ }).click();
  await expect(page.getByRole('combobox', { name: 'ชนิดดิน', exact: true })).toHaveValue(
    'ดินลูกรัง',
  );
  await page.getByLabel('หมายเหตุ', { exact: true }).fill('Keep historical soil');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'ชนิดดิน', exact: true })).not.toContainText(
    'ดินลูกรัง',
  );
});
test('a draft project stays visible and can be activated before selecting it in a trip', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('Draft site');
  await page.getByRole('combobox', { name: 'สถานะ', exact: true }).selectOption('draft');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true })
    .click();
  await page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'โครงการ *', exact: true })).toContainText(
    'Draft site',
  );
  await expect(
    page.getByRole('dialog').getByRole('option', { name: /Draft site/ }),
  ).toHaveJSProperty('disabled', true);
  await page.getByRole('button', { name: 'จัดการสถานะโครงการ', exact: true }).click();
  await page.getByRole('button', { name: /ดู \/ แก้ไข/ }).click();
  await page.getByRole('combobox', { name: 'สถานะ', exact: true }).selectOption('active');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true })
    .click();
  await page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('option', { name: 'Draft site', exact: true }),
  ).toHaveJSProperty('disabled', false);
  await page
    .getByRole('combobox', { name: 'โครงการ *', exact: true })
    .selectOption({ label: 'Draft site' });
  await expect(page.getByRole('combobox', { name: 'โครงการ *', exact: true })).not.toHaveValue('');
});
test('the user can switch between active projects and keep the chosen value', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: 'โครงการ', exact: true }).click();
  for (const name of ['Site A', 'Site B']) {
    await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
    await page.getByLabel('ชื่อโครงการ', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  }
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true })
    .click();
  await page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  const select = page.getByRole('combobox', { name: 'โครงการ *', exact: true });
  await select.selectOption({ label: 'Site B' });
  const id = await select.inputValue();
  await page.getByLabel('หมายเหตุ', { exact: true }).fill('Keep selected project');
  await expect(select).toHaveValue(id);
  await select.selectOption({ label: 'Site A' });
  await expect(select).not.toHaveValue(id);
});
test('all master categories remain selectable in a trip after entry and reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('Browser project');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true })
    .click();
  for (const [kind, name] of [
    ['รถบรรทุก', '81-5555'],
    ['คนขับรถ', 'Driver A'],
    ['แหล่งดิน', 'Source A'],
    ['ลูกค้า', 'Customer A'],
  ]) {
    await page.getByRole('button', { name: kind, exact: true }).click();
    await page.getByRole('button', { name: 'เพิ่มข้อมูล', exact: true }).click();
    await page.getByLabel(kind === 'รถบรรทุก' ? 'ทะเบียนรถ' : 'ชื่อ', { exact: true }).fill(name);
    if (kind === 'รถบรรทุก') await page.getByLabel('ความจุ (m³)', { exact: true }).fill('12');
    await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true })
    .click();
  await page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  await expect(page.getByLabel('รถบรรทุก *')).toContainText('81-5555');
  await expect(page.getByRole('combobox', { name: 'คนขับรถ', exact: true })).toContainText(
    'Driver A',
  );
  await expect(page.getByRole('combobox', { name: 'แหล่งดิน', exact: true })).toContainText(
    'Source A',
  );
  await page.getByLabel('รถบรรทุก *').selectOption({ label: '81-5555' });
  await page
    .getByRole('combobox', { name: 'คนขับรถ', exact: true })
    .selectOption({ label: 'Driver A' });
  await page
    .getByRole('combobox', { name: 'แหล่งดิน', exact: true })
    .selectOption({ label: 'Source A' });
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Source A', exact: true })).toBeVisible();
});
test('a trip form receives trucks created in another open tab', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('Shared project');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true })
    .click();
  await page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
  const other = await context.newPage();
  await other.goto('/');
  await other
    .getByRole('navigation')
    .getByRole('button', { name: 'ข้อมูลพื้นฐาน', exact: true })
    .click();
  await other.getByRole('button', { name: 'เพิ่มข้อมูล', exact: true }).click();
  await other.getByLabel('ทะเบียนรถ', { exact: true }).fill('99-9999');
  await other.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await expect(other.getByText('99-9999', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'รถบรรทุก *', exact: true })).toContainText(
    '99-9999',
  );
});
test('native file selection is queued durably and clearly waits for Drive connection', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'เพิ่มโครงการ', exact: true }).click();
  await page.getByLabel('ชื่อโครงการ', { exact: true }).fill('File project');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'การตั้งค่า', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'โครงการสำหรับเอกสาร *', exact: true })
    .selectOption({ label: 'File project' });
  await page.getByLabel('เลือกรูปภาพ / PDF *').setInputFiles({
    name: 'evidence.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-test-original'),
  });
  await page.getByRole('button', { name: 'อัปโหลดไฟล์ที่เลือก', exact: true }).click();
  await expect(page.getByText('evidence.pdf', { exact: true })).toBeVisible();
  await expect(page.getByText('รออัปโหลด', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'ยังไม่ได้อัปโหลด' })).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'การตั้งค่า', exact: true })
    .click();
  await expect(page.getByText('evidence.pdf', { exact: true })).toBeVisible();
  const original = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('construction-ops');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      const records = await new Promise<any[]>((resolve, reject) => {
        const r = db.transaction('uploads').objectStore('uploads').getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return await records[0].blob.text();
    } finally {
      db.close();
    }
  });
  expect(original).toBe('%PDF-test-original');
});
