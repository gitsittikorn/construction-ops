import {
  loadTruckSheet,
  loadTruckSheetSelection,
  saveTruckSheet,
  spreadsheetId,
  spreadsheetSelection,
  readTruckSheet,
} from '../truckSheets';
import { legacyTruckHeaders as truckHeaders } from '../truckImport';
afterEach(() => vi.unstubAllGlobals());
const json = (value: unknown) => new Response(JSON.stringify(value));
function tableResponse(payload: unknown) {
  return vi
    .fn()
    .mockResolvedValueOnce(json({ sheets: [{ properties: { sheetId: 0, title: 'Trucks' } }] }))
    .mockResolvedValueOnce(json({ valueRanges: [{ values: [truckHeaders] }] }))
    .mockResolvedValueOnce(json({ valueRanges: [payload] }));
}
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
it('preserves legacy file preferences and remembers tabs atomically without cross-account leakage', async () => {
  await saveTruckSheet('sheet-selected-a', 'abc');
  expect(await loadTruckSheetSelection('sheet-selected-a')).toEqual({
    id: 'abc',
    sheetId: undefined,
  });
  await saveTruckSheet('sheet-selected-a', 'abc', 0);
  expect(await loadTruckSheetSelection('sheet-selected-a')).toEqual({ id: 'abc', sheetId: 0 });
  expect(await loadTruckSheetSelection('sheet-selected-b')).toEqual({ id: '', sheetId: undefined });
  await saveTruckSheet('sheet-selected-a', 'replacement');
  expect(await loadTruckSheetSelection('sheet-selected-a')).toEqual({
    id: 'replacement',
    sheetId: undefined,
  });
});
it('rolls back the file preference when writing its tab fails', async () => {
  await saveTruckSheet('sheet-rollback', 'original', 12);
  const original = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    if (key === 'truck-sheet-tab:sheet-rollback')
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    return original.call(this, value, key);
  });
  try {
    await expect(saveTruckSheet('sheet-rollback', 'changed', 13)).rejects.toThrow('Quota');
  } finally {
    spy.mockRestore();
  }
  expect(await loadTruckSheetSelection('sheet-rollback')).toEqual({ id: 'original', sheetId: 12 });
});
it.each(['?gid=0', '#gid=17', '?gid=17#gid=17'])(
  'reads a selected tab from the URL %s',
  (suffix) => {
    expect(
      spreadsheetSelection(`https://docs.google.com/spreadsheets/d/custom_file/edit${suffix}`),
    ).toEqual({ id: 'custom_file', sheetId: suffix.includes('=0') ? 0 : 17 });
  },
);
it.each(['#gid=bad', '#gid=-1', '#gid=', '#gid=99999999999999', '?gid=1#gid=2'])(
  'rejects an invalid or conflicting tab selector %s',
  (suffix) => {
    expect(() =>
      spreadsheetSelection(`https://docs.google.com/spreadsheets/d/custom/edit${suffix}`),
    ).toThrow('gid');
  },
);
it('reads authenticated unformatted values preserving phone text and detects numeric phones', async () => {
  const fetcher = tableResponse({
    values: [
      truckHeaders,
      ['', '81-0001', 'ภูเก็ต', '0812345678', 'หกล้อ', 6, 'ทีม A', '', 'ใช้งาน'],
      ['', '81-0002', '', 812345678, '', 0, '', '', ''],
    ],
  });
  vi.stubGlobal('fetch', fetcher);
  const rows = await readTruckSheet('private-token', 'abc');
  expect(rows[0]).toMatchObject({ phone: '0812345678', tags: ['ทีม A'], errors: [] });
  expect(rows[1].errors.length).toBeGreaterThan(0);
  expect(fetcher.mock.calls[2][0]).toContain('UNFORMATTED_VALUE');
  expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer private-token');
});
it.each([
  [401, 'หมดอายุ'],
  [403, 'Google Sheets API'],
  [404, 'ไม่พบชีต'],
  [400, 'ช่วงข้อมูล'],
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
  vi.stubGlobal('fetch', tableResponse(payload));
  await expect(readTruckSheet('token', 'abc')).rejects.toThrow();
});
it('reports connection failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('offline')));
  await expect(readTruckSheet('token', 'abc')).rejects.toThrow('อินเทอร์เน็ต');
});
