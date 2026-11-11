import { readTruckSheetSource } from '../truckSheets';
import { truckHeaders } from '../truckImport';
const json = (value: unknown) => new Response(JSON.stringify(value));
const data = [
  truckHeaders,
  ['', '81-0001', 'ภูเก็ต', 'หกล้อ', '0812345678', 'รถเล็ก', '', '6', '', ''],
];
const tab = (sheetId: number, title: string, rows = 65, columns = 10) => ({
  properties: {
    sheetId,
    title,
    sheetType: 'GRID',
    gridProperties: { rowCount: rows, columnCount: columns },
  },
});
function mockBook(
  tabs: ReturnType<typeof tab>[],
  headers: unknown[][][],
  tables: unknown[][][],
  id = 'custom',
) {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ sheets: tabs }))
    .mockResolvedValueOnce(
      json({ spreadsheetId: id, valueRanges: headers.map((values) => ({ values })) }),
    )
    .mockResolvedValueOnce(
      json({ spreadsheetId: id, valueRanges: tables.map((values) => ({ values })) }),
    );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

it('discovers a Thai data tab in the file selected by URL without requiring Trucks or writing to Google', async () => {
  const fetcher = mockBook([tab(17, 'รถบรรทุก')], [[truckHeaders]], [data]);
  const result = await readTruckSheetSource('test-token', 'custom');
  expect(result).toMatchObject({
    title: 'รถบรรทุก',
    sheetId: 17,
    rows: [{ plate: '81-0001', phone: '0812345678', capacity: 6, errors: [] }],
  });
  const urls = fetcher.mock.calls.map(([url]) => new URL(url));
  expect(urls.every((url) => url.pathname.startsWith('/v4/spreadsheets/custom'))).toBe(true);
  expect(urls[1].searchParams.getAll('ranges')).toEqual(["'รถบรรทุก'!A1:J1"]);
  expect(urls[2].searchParams.getAll('ranges')).toEqual(["'รถบรรทุก'!A1:J65"]);
  expect(
    fetcher.mock.calls.every(
      ([, init]) =>
        !init.method && !init.body && init.headers.Authorization === 'Bearer test-token',
    ),
  ).toBe(true);
});
it('uses gid even when another tab is called Trucks and escapes apostrophes', async () => {
  const fetcher = mockBook([tab(1, 'Trucks'), tab(2, "Owner's Fleet")], [[truckHeaders]], [data]);
  expect((await readTruckSheetSource('token', 'custom', 2)).title).toBe("Owner's Fleet");
  expect(new URL(fetcher.mock.calls[2][0]).searchParams.getAll('ranges')).toEqual([
    "'Owner''s Fleet'!A1:J65",
  ]);
});
it('ignores empty Trucks and reference tabs when one populated Thai data tab exists', async () => {
  const fetcher = mockBook(
    [
      tab(0, 'Trucks'),
      tab(1, 'รถบรรทุก'),
      tab(2, 'Examples'),
      tab(3, 'Tags'),
      tab(4, 'Instructions'),
    ],
    [[truckHeaders], [truckHeaders]],
    [[truckHeaders], data],
  );
  expect((await readTruckSheetSource('token', 'custom')).sheetId).toBe(1);
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.getAll('ranges')).toHaveLength(2);
});
it('rejects multiple populated data tabs instead of silently choosing or merging vehicles', async () => {
  mockBook([tab(1, 'Fleet A'), tab(2, 'Fleet B')], [[truckHeaders], [truckHeaders]], [data, data]);
  await expect(readTruckSheetSource('token', 'custom')).rejects.toThrow('หลายแท็บ');
});
it.each([999, 2])(
  'does not fall back when gid %s selects a missing or reference tab',
  async (gid) => {
    const fetcher = mockBook([tab(1, 'รถบรรทุก'), tab(2, 'Examples')], [], []);
    await expect(readTruckSheetSource('token', 'custom', gid)).rejects.toThrow('ไม่พบแท็บ');
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it('stops at incompatible headers without downloading rows', async () => {
  const fetcher = mockBook([tab(1, 'Sheet1')], [[['unrelated']]], [data]);
  await expect(readTruckSheetSource('token', 'custom')).rejects.toThrow('หัวคอลัมน์');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([{ sheets: 'bad' }, { sheets: [{}] }, { sheets: [tab(-1, 'Fleet')] }])(
  'rejects malformed tab metadata',
  async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(payload)));
    await expect(readTruckSheetSource('token', 'custom')).rejects.toThrow('ข้อมูลไม่ถูกต้อง');
  },
);
it('rejects mismatching file identity, incomplete ranges and malformed JSON', async () => {
  const fetcher = mockBook([tab(1, 'Fleet')], [[truckHeaders]], [data], 'other');
  await expect(readTruckSheetSource('token', 'custom')).rejects.toThrow('ข้อมูลไม่ถูกต้อง');
  fetcher
    .mockReset()
    .mockResolvedValueOnce(json({ sheets: [tab(1, 'Fleet')] }))
    .mockResolvedValueOnce(json({ valueRanges: [] }));
  await expect(readTruckSheetSource('token', 'custom')).rejects.toThrow('ข้อมูลไม่ถูกต้อง');
  fetcher.mockReset().mockResolvedValueOnce(new Response('not-json'));
  await expect(readTruckSheetSource('token', 'custom')).rejects.toThrow('ข้อมูลไม่ถูกต้อง');
});
it('bounds row counts, response bytes and auto-discovery breadth', async () => {
  mockBook(
    [tab(1, 'Fleet', 5000)],
    [[truckHeaders]],
    [[truckHeaders, ...Array.from({ length: 1001 }, () => data[1])]],
  );
  await expect(readTruckSheetSource('token', 'custom')).rejects.toThrow('1,000');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(' '.repeat(5 * 1024 * 1024 + 1))));
  await expect(readTruckSheetSource('token', 'custom')).rejects.toThrow('5 MB');
  mockBook(
    Array.from({ length: 51 }, (_, i) => tab(i, `Fleet ${i}`)),
    [],
    [],
  );
  await expect(readTruckSheetSource('token', 'custom')).rejects.toThrow('gid');
});
