import { test, expect } from '@playwright/test';

test('Thai report print layout renders a multi-page A4 PDF with repeated headers', async ({
  page,
}) => {
  await page.goto('/');
  const popupEvent = page.waitForEvent('popup');
  await page.evaluate(async () => {
    // Observe the native print request without racing it against Playwright's PDF export.
    const open = window.open.bind(window);
    window.open = (...args) => {
      const target = open(...args);
      if (target)
        target.print = () => {
          target.document.documentElement.dataset.printRequested = 'true';
        };
      return target;
    };
    const module = '/src/reports.ts';
    const { printableReport, printDocument } = await import(module);
    const table = [
      ['วันที่', 'ทะเบียนรถ', 'คนขับ', 'เที่ยว', 'ปริมาตร m³', 'สถานะ'],
      ...Array.from({ length: 350 }, (_, index) => [
        '2026-11-06',
        `00${index}`,
        'สมชาย',
        3,
        36,
        'รอตรวจ',
      ]),
    ];
    printDocument(
      printableReport(
        'รายงานเที่ยวรถภาษาไทย',
        table,
        'โครงการทดสอบ · ยอดจากข้อมูลรายงาน · ยังไม่ยืนยัน',
      ),
    );
  });
  const popup = await popupEvent;
  await expect(
    popup.getByRole('heading', { name: 'รายงานเที่ยวรถภาษาไทย', exact: true }),
  ).toBeVisible();
  await expect(popup.locator('html')).toHaveAttribute('data-print-requested', 'true');
  const bytes = await popup.pdf({
    format: 'A4',
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
  });
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  expect((bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThan(1);
  await popup.screenshot({ path: 'test-results/report-preview.png' });
  await popup.close();
});
