import { loadTruckSheet, saveTruckSheet, spreadsheetId, readTruckSheet } from '../truckSheets';
import { legacyTruckHeaders as truckHeaders } from '../truckImport';
afterEach(() => vi.unstubAllGlobals());
it('accepts normal Sheets links and rejects published or unrelated URLs', () => {
  expect(spreadsheetId('https://docs.google.com/spreadsheets/d/abc_123/edit#gid=0')).toBe(
    'abc_123',
  );
  for (const value of [
    'https://evil.example/spreadsheets/d/abc/edit',
    'http://docs.google.com/spreadsheets/d/abc/edit',
    'https://docs.google.com/spreadsheets/d/e/published/pubhtml',
    'bad',
  ])
    expect(() => spreadsheetId(value)).toThrow('ลิงก์');
});
it('remembers the selected sheet independently for each owner', async () => {
  await saveTruckSheet('sheet-owner-a', 'abc');
  expect(await loadTruckSheet('sheet-owner-a')).toBe('abc');
  expect(await loadTruckSheet('sheet-owner-b')).toBe('');
});
it('reads authenticated unformatted values preserving phone text and detects numeric phones', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        values: [
          truckHeaders,
          ['', '81-0001', 'ภูเก็ต', '0812345678', 'หกล้อ', 6, 'ทีม A', '', 'ใช้งาน'],
          ['', '81-0002', '', 812345678, '', 0, '', '', ''],
        ],
      }),
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  const rows = await readTruckSheet('private-token', 'abc');
  expect(rows[0]).toMatchObject({ phone: '0812345678', tags: ['ทีม A'], errors: [] });
  expect(rows[1].errors.length).toBeGreaterThan(0);
  expect(fetcher.mock.calls[0][0]).toContain('UNFORMATTED_VALUE');
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer private-token');
});
it.each([
  [401, 'หมดอายุ'],
  [403, 'Google Sheets API'],
  [404, 'ไม่พบชีต'],
  [400, 'Trucks'],
  [500, '500'],
])('reports API status %s', async (status, message) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
  await expect(readTruckSheet('token', 'abc')).rejects.toThrow(String(message));
});
it.each([
  {},
  { values: 'bad' },
  { values: [truckHeaders] },
  { values: [['bad']] },
  { values: [truckHeaders, ...Array.from({ length: 1001 }, () => [''])] },
])('rejects invalid, empty or oversized row sets', async (payload) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
  await expect(readTruckSheet('token', 'abc')).rejects.toThrow();
});
it('reports connection failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('offline')));
  await expect(readTruckSheet('token', 'abc')).rejects.toThrow('อินเทอร์เน็ต');
});
