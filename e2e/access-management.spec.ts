import { test, expect } from '@playwright/test';
const viewports = [
  { width: 1440, height: 1000 },
  { width: 800, height: 1280 },
  { width: 390, height: 844 },
];
for (const viewport of viewports)
  test(`synthetic super-admin UI and real access-service policies at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const servicePath = `${process.cwd()}/backend/accessService.mjs`,
      fixturePath = `${process.cwd()}/backend/test/accessFixtures.mjs`;
    const { createAccessService } = await import(servicePath),
      { memoryAccess, identity } = await import(fixturePath);
    const state = memoryAccess(),
      service = createAccessService(state);
    await page.route('**/api/access/**', async (route) => {
      const path = new URL(route.request().url()).pathname,
        body = route.request().postDataJSON();
      try {
        const result = path.endsWith('/users/list')
          ? await service.list(identity(), 'company', body)
          : path.endsWith('/users/save')
            ? await service.save(identity(), 'company', body)
            : await service.audits(identity(), 'company');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(result),
        });
      } catch (error) {
        const safe = error as { status?: number; code?: string };
        await route.fulfill({
          status: safe.status ?? 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: safe.code ?? 'service_unavailable' }),
        });
      }
    });
    await page.goto('/e2e/access-harness.html');
    await expect(page.getByRole('button', { name: 'แก้สิทธิ์ root@example.com' })).toBeVisible();
    await page.getByLabel('อีเมล Google ที่อนุญาต', { exact: true }).fill(' NEW@example.com ');
    // Native email controls trim surrounding whitespace; the backend also normalizes it.
    await page.getByLabel('ชื่อทีมงาน', { exact: true }).fill('ทีมงานใหม่');
    await page.getByLabel('บทบาทผู้ใช้งาน', { exact: true }).selectOption('viewer');
    await page.getByRole('button', { name: 'บันทึกสิทธิ์ผู้ใช้งาน', exact: true }).click();
    const row = page.getByRole('row').filter({
      has: page.getByRole('button', { name: 'แก้สิทธิ์ new@example.com', exact: true }),
    });
    await expect(row).toContainText('รอเข้าระบบครั้งแรก');
    await expect(row).toContainText('ผู้ดูข้อมูลเท่านั้น');
    await row.getByRole('button').click();
    await page.getByLabel('สถานะบัญชีผู้ใช้งาน', { exact: true }).selectOption('disabled');
    await page.getByRole('button', { name: 'บันทึกสิทธิ์ผู้ใช้งาน', exact: true }).click();
    await expect(row).toContainText('ปิดสิทธิ์');
    await page.getByLabel('ค้นหาอีเมลผู้ใช้งาน', { exact: true }).fill('root');
    await page.getByRole('button', { name: 'ค้นหา / โหลดรายชื่อใหม่', exact: true }).click();
    await page.getByRole('button', { name: 'แก้สิทธิ์ root@example.com', exact: true }).click();
    await page.getByLabel('สถานะบัญชีผู้ใช้งาน', { exact: true }).selectOption('disabled');
    await page.getByRole('button', { name: 'บันทึกสิทธิ์ผู้ใช้งาน', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('อย่างน้อย 1 คน');
    expect(
      (await state.store.get('companies/company/access_control/state')).enabledSuperAdmins,
    ).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
    await page.goto('/e2e/access-harness.html?role=manager');
    await expect(page.getByRole('alert')).toContainText('เฉพาะผู้ดูแลสูงสุด');
    await expect(
      page.getByRole('button', { name: 'บันทึกสิทธิ์ผู้ใช้งาน', exact: true }),
    ).toHaveCount(0);
  });

for (const viewport of viewports)
  test(`viewer operational data is readable without any write controls at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/company-harness.html?role=viewer');
    const nav = page.getByRole('navigation');
    await expect(page.getByLabel('สิทธิ์บริษัทปัจจุบัน', { exact: true })).toContainText(
      'ผู้ดูข้อมูลเท่านั้น',
    );
    await expect(nav.getByRole('button', { name: 'ผู้ใช้งานและสิทธิ์', exact: true })).toHaveCount(
      0,
    );
    await expect(nav.getByRole('button', { name: 'การเงินโครงการ', exact: true })).toHaveCount(0);
    await nav.getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }).click();
    await page.getByRole('checkbox', { name: 'ทุกวันที่' }).check();
    await expect(page.getByRole('button', { name: /แก้ไขเที่ยวรถ/ })).toBeDisabled();
    await expect(
      page.getByRole('main').getByRole('button', { name: 'บันทึกเที่ยวรถ', exact: true }),
    ).toHaveCount(0);
    await nav.getByRole('button', { name: 'งานรายวันและตรวจยอด', exact: true }).click();
    await expect(page.getByRole('button', { name: 'สร้างวันทำงาน', exact: true })).toBeDisabled();
    await nav.getByRole('button', { name: 'ซิงก์และสำรองข้อมูล', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'กู้คืนไฟล์สำรอง JSON', exact: true }),
    ).toHaveCount(0);
    const stored = await page.evaluate(async () => {
      const identityPath = '/src/workspaceIdentity.ts',
        storagePath = '/src/storage.ts';
      const { cacheOwner } = await import(identityPath);
      return (await import(storagePath)).loadData(
        cacheOwner({
          actorUid: 'simulated-worker',
          companyId: 'simulated-company',
          role: 'viewer',
        }),
      );
    });
    expect(stored.trips).toHaveLength(1);
    expect(stored.trips[0].syncStatus).toBe('pending');
  });
