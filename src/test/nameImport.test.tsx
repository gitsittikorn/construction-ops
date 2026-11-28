import { fireEvent, render, screen } from '@testing-library/react';
import NameImportPanel from '../NameImportPanel';
import { applyNameImport, parseNameRows, planNameImport, readNameSheet } from '../nameImport';
import { emptyData, type Data } from '../models';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), identity: { uid: 'owner', email: 'a@b.c' } }));
vi.mock('../firebase', () => ({ getSessionIdentity: () => mocks.identity }));
vi.mock('../drive', () => ({ loadGoogleIdentity: async () => {} }));
vi.mock('../googleSheetsAuth', () => ({
  requestSheetsToken: mocks.auth,
  verifySheetsAccount: async () => {},
}));
beforeEach(() => mocks.auth.mockReset().mockResolvedValue({ token: 'token' }));
afterEach(() => vi.unstubAllGlobals());

// Fictitious names in the layout of the two tabs.
const sources = [
  ['รหัสแหล่งดิน', 'ลำดับ', 'แหล่งดิน'],
  ['', '1', 'บ่อหนึ่ง'],
  ['', '2', ' บ่อ  สอง '],
  [],
  ['', '', ' '],
];
const soils = [
  ['รหัสวัสดุ', 'ลำดับ', 'รายการ'],
  ['', '1', 'ดินถม'],
  ['', '2', 'หิน 3/4'],
];
const book = (title: string, values: unknown[][]) =>
  vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.includes('fields=')
            ? { sheets: [{ properties: { sheetId: 7, title } }] }
            : { values },
        ),
      ),
  );

it('reads both layouts, ignoring blank rows and tidying spaces', () => {
  expect(parseNameRows('source', sources).map((row) => row.name)).toEqual(['บ่อหนึ่ง', 'บ่อ สอง']);
  expect(parseNameRows('soilType', soils).map((row) => row.name)).toEqual(['ดินถม', 'หิน 3/4']);
  expect(() => parseNameRows('soilType', [['ลำดับ']])).toThrow('รายการ');
});

it('adds new names once, keeps existing ones and does not duplicate on re-import', () => {
  const rows = parseNameRows('soilType', [...soils, ['', '3', 'ดินถม']]);
  expect(planNameImport('soilType', rows, []).map((row) => row.action)).toEqual([
    'create',
    'create',
    'skip',
  ]);
  const data = applyNameImport(emptyData, 'soilType', rows, 'owner', []);
  expect(data.masters.map((item) => [item.kind, item.name])).toEqual([
    ['soilType', 'ดินถม'],
    ['soilType', 'หิน 3/4'],
  ]);
  const again = applyNameImport(data, 'soilType', rows, 'owner', data.masters);
  expect(again).toEqual(data);
  // The same name may exist in another category.
  expect(planNameImport('source', rows, data.masters)[0].action).toBe('create');
});

it('renames only by code and writes nothing when a row is wrong or the data moved on', () => {
  const data = applyNameImport(emptyData, 'source', parseNameRows('source', sources), 'owner', []);
  const [first] = data.masters;
  const renamed = applyNameImport(
    data,
    'source',
    [{ row: 2, id: first.id, name: 'บ่อใหม่' }],
    'owner',
    data.masters,
  );
  expect(renamed.masters.find((item) => item.id === first.id)?.name).toBe('บ่อใหม่');
  const bad = [
    { row: 2, id: '', name: 'บ่อเพิ่ม' },
    { row: 3, id: 'unknown', name: 'x' },
  ];
  expect(() => applyNameImport(data, 'source', bad, 'owner', data.masters)).toThrow('ผิดพลาด');
  expect(() => applyNameImport(data, 'source', bad, 'owner', [])).toThrow('เปลี่ยน');
  expect(planNameImport('source', [{ row: 2, id: '', name: '' }], [])[0].action).toBe('error');
});

it('finds the tab by its name and reports a missing tab or a refused request', async () => {
  vi.stubGlobal('fetch', book('ชนิดดิน', soils));
  expect((await readNameSheet('token', 'abc', 'soilType')).rows).toHaveLength(2);
  await expect(readNameSheet('token', 'abc', 'source')).rejects.toThrow('ไม่พบแท็บ แหล่งดิน');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 403 })),
  );
  await expect(readNameSheet('token', 'abc', 'source')).rejects.toThrow('ไม่อนุญาต');
});

function Harness() {
  const state = { data: emptyData as Data };
  return (
    <NameImportPanel
      kind="source"
      data={state.data}
      actor="owner"
      onChange={async (change) => {
        state.data = change(state.data);
      }}
    />
  );
}

it('previews before writing and shows a connection error without data', async () => {
  vi.stubGlobal('fetch', book('แหล่งดิน', sources));
  render(<Harness />);
  await vi.waitFor(() => expect(screen.getByRole('textbox', { hidden: true })).not.toHaveValue(''));
  const read = () =>
    fireEvent.click(screen.getByRole('button', { name: 'อ่านแหล่งดินจากชีต', hidden: true }));
  read();
  expect(await screen.findByText('บ่อหนึ่ง')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันนำเข้าแหล่งดิน', hidden: true }));
  expect(await screen.findByText(/นำเข้าแหล่งดินสำเร็จ เพิ่ม 2/)).toBeInTheDocument();
  mocks.auth.mockRejectedValueOnce(Error('ปิดหน้าต่าง Google'));
  read();
  expect(await screen.findByRole('alert', { hidden: true })).toHaveTextContent('ปิดหน้าต่าง');
  expect(screen.queryByRole('table', { hidden: true })).toBeNull();
});
