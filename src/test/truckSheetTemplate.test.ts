import { prepareTruckSheet } from '../truckSheets';
import { truckHeaders } from '../truckImport';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => vi.unstubAllGlobals());
it('creates Trucks and writes the nine literal headers atomically while preserving other tabs', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] }))
    .mockResolvedValueOnce(json({}));
  vi.stubGlobal('fetch', fetcher);
  await prepareTruckSheet('token', 'abc');
  const { requests } = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(requests[0].addSheet.properties.title).toBe('Trucks');
  expect(
    requests[1].updateCells.rows[0].values.map(
      (cell: { userEnteredValue: { stringValue: string } }) => cell.userEnteredValue.stringValue,
    ),
  ).toEqual(truckHeaders);
  expect(requests.some((r: object) => 'deleteSheet' in r)).toBe(false);
  expect(
    requests.filter(
      (r: {
        repeatCell?: { cell?: { userEnteredFormat?: { numberFormat?: { type: string } } } };
      }) => r.repeatCell?.cell?.userEnteredFormat?.numberFormat?.type === 'TEXT',
    ),
  ).toHaveLength(2);
});
it.each([{ header: [] }, { header: truckHeaders }])(
  'reuses an existing Trucks tab and never writes vehicle rows',
  async ({ header }) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ sheets: [{ properties: { sheetId: 9, title: 'Trucks' } }] }))
      .mockResolvedValueOnce(json({ values: [header] }))
      .mockResolvedValueOnce(json({}));
    vi.stubGlobal('fetch', fetcher);
    await prepareTruckSheet('token', 'abc');
    const { requests } = JSON.parse(fetcher.mock.calls[2][1].body);
    expect(requests.some((r: object) => 'addSheet' in r)).toBe(false);
    const writes = requests.filter((r: object) => 'updateCells' in r);
    expect(writes).toHaveLength(header.length ? 0 : 1);
    if (writes.length) {
      expect(writes[0].updateCells.start.rowIndex).toBe(0);
      expect(writes[0].updateCells.rows).toHaveLength(1);
    }
  },
);
it('refuses to overwrite incompatible headers', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ sheets: [{ properties: { sheetId: 0, title: 'Trucks' } }] }))
    .mockResolvedValueOnce(json({ values: [['existing data']] }));
  vi.stubGlobal('fetch', fetcher);
  await expect(prepareTruckSheet('token', 'abc')).rejects.toThrow('ไม่เขียนทับ');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('reports denied writes without successful completion', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json({ sheets: [] }))
      .mockResolvedValueOnce(json({}, 403)),
  );
  await expect(prepareTruckSheet('token', 'abc')).rejects.toThrow('403');
});
it('does not attempt writes after a failed read', async () => {
  const fetcher = vi.fn().mockRejectedValue(Error('offline'));
  vi.stubGlobal('fetch', fetcher);
  await expect(prepareTruckSheet('token', 'abc')).rejects.toThrow('อินเทอร์เน็ต');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
