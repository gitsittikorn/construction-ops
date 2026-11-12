import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import SearchableSelect from '../SearchableSelect';
import { searchRank } from '../searchOptions';

function Picker() {
  const [value, setValue] = useState('');
  return (
    <form aria-label="form" onSubmit={(event) => event.preventDefault()}>
      <SearchableSelect
        aria-label="รถ"
        name="truckId"
        value={value}
        required
        onChange={(event) => setValue(event.target.value)}
      >
        <option value="">เลือกรถ</option>
        <option value="one" data-search="สมชาย 0812345678">
          81-1234
        </option>
        <option value="two">82-9876</option>
        <option value="off" disabled>
          81-1235 (ปิดใช้งาน)
        </option>
      </SearchableSelect>
      <button type="submit">บันทึก</button>
    </form>
  );
}

it('ranks normalized plates, partial names and one typo, without matching unrelated short queries', () => {
  expect(searchRank('81-1234', '811234')).toBe(0);
  expect(searchRank('Somchai', 'chai')).toBe(2);
  expect(searchRank('Somchai', 'somchaj')).toBe(3);
  expect(searchRank('81-1234', 'ZZ')).toBe(Infinity);
  expect(searchRank('ดินลูกรัง', 'ลูกรัง')).toBe(2);
});

it('finds trucks by normalized plates and metadata, commits IDs through the normal form change event', async () => {
  const user = userEvent.setup();
  render(<Picker />);
  await user.click(screen.getByRole('combobox', { name: 'รถ' }));
  const search = screen.getByRole('combobox', { name: 'ค้นหาตัวเลือก' });
  await user.type(search, '811234');
  const list = screen.getByRole('listbox');
  expect(within(list).getByRole('option', { name: '81-1234' })).toBeVisible();
  expect(within(list).queryByText('82-9876')).not.toBeInTheDocument();
  await user.click(within(list).getByRole('option', { name: '81-1234' }));
  expect(screen.getByRole('combobox', { name: 'รถ' })).toHaveValue('one');
  expect(new FormData(screen.getByRole('form') as HTMLFormElement).get('truckId')).toBe('one');
  await user.click(screen.getByRole('combobox', { name: 'รถ' }));
  await user.type(screen.getByRole('combobox', { name: 'ค้นหาตัวเลือก' }), 'สมชาย');
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'รถ' })).toHaveFocus();
});

it('supports typing directly from the control, arrows/Enter, empty results, disabled options and cancellation', async () => {
  const user = userEvent.setup();
  render(<Picker />);
  screen.getByRole('combobox', { name: 'รถ' }).focus();
  await user.keyboard('82');
  expect(screen.getByRole('combobox', { name: 'ค้นหาตัวเลือก' })).toHaveValue('82');
  await user.keyboard('{Enter}');
  expect(screen.getByRole('combobox', { name: 'รถ' })).toHaveValue('two');
  await user.keyboard('{ArrowDown}');
  const search = screen.getByRole('combobox', { name: 'ค้นหาตัวเลือก' });
  await user.type(search, '81-1235');
  const disabled = within(screen.getByRole('listbox')).getByRole('option', { name: /ปิดใช้งาน/ });
  expect(disabled).toBeDisabled();
  await user.clear(search);
  await user.type(search, 'zzzzzz');
  expect(screen.getByRole('status')).toHaveTextContent('ไม่พบตัวเลือก');
  await user.keyboard('{Enter}');
  expect(screen.getByRole('combobox', { name: 'รถ' })).toHaveValue('two');
  await user.click(screen.getByRole('button', { name: 'บันทึก' }));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('preserves required validation, dynamic options and disabled controls', async () => {
  const user = userEvent.setup();
  const view = render(
    <SearchableSelect aria-label="เลือก" required>
      <option value="">เลือก</option>
    </SearchableSelect>,
  );
  expect(screen.getByRole('combobox')).toBeInvalid();
  view.rerender(
    <SearchableSelect aria-label="เลือก" required>
      <option value="">เลือก</option>
      <option value="a">มาใหม่</option>
    </SearchableSelect>,
  );
  await user.click(screen.getByRole('combobox'));
  await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'มาใหม่' }));
  expect(screen.getByRole('combobox')).toHaveValue('a');
  expect(screen.getByRole('combobox')).toBeValid();
  view.rerender(
    <SearchableSelect aria-label="เลือก" disabled>
      <option value="a">มาใหม่</option>
    </SearchableSelect>,
  );
  fireEvent.mouseDown(screen.getByRole('combobox'));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
