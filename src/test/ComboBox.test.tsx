import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import ComboBox from '../ComboBox';

function Harness() {
  const [value, setValue] = useState('');
  return (
    <>
      <ComboBox
        label="กรองรถ"
        value={value}
        onChange={setValue}
        options={[
          { value: 'a', label: '70-1234', search: 'สมชาย' },
          { value: 'b', label: '81-9999' },
        ]}
      />
      <output>{value || 'all'}</output>
    </>
  );
}

it('suggests close matches while typing, picks one and can return to all', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const box = screen.getByRole('combobox', { name: 'กรองรถ' });
  await user.type(box, '701234');
  expect(screen.getAllByRole('option')).toHaveLength(1);
  await user.keyboard('{Enter}');
  expect(screen.getByRole('status')).toHaveTextContent('a');
  expect(box).toHaveValue('70-1234');
  await user.clear(box);
  expect(screen.getByRole('status')).toHaveTextContent('all');
});

it('reports no match and keeps the previous choice when abandoned', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const box = screen.getByRole('combobox', { name: 'กรองรถ' });
  await user.click(box);
  await user.click(screen.getByRole('option', { name: '81-9999' }));
  await user.type(box, 'zzzz', { initialSelectionStart: 0, initialSelectionEnd: 7 });
  expect(screen.getByRole('listbox')).toHaveTextContent('ไม่พบ');
  await user.tab();
  expect(box).toHaveValue('81-9999');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
