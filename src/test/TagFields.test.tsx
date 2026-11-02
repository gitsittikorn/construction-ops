import { render, screen } from '@testing-library/react';
import TagFields from '../TagFields';
import type { Master } from '../models';
const tag: Master = {
  id: 'tag',
  kind: 'tag',
  name: 'ทีม A',
  detail: '',
  capacity: 0,
  active: true,
  createdAt: 'now',
  updatedAt: 'now',
};
it('lists active tags for new records', () => {
  render(
    <TagFields
      masters={[tag, { ...tag, id: 'off', name: 'ปิดใช้', active: false }]}
      record={null}
    />,
  );
  expect(screen.getByRole('checkbox', { name: 'ทีม A' })).not.toBeChecked();
  expect(screen.queryByRole('checkbox', { name: /ปิดใช้/ })).not.toBeInTheDocument();
});
it('preserves inactive tags that are already assigned on an existing record', () => {
  render(
    <TagFields
      masters={[{ ...tag, active: false }]}
      record={{ ...tag, kind: 'truck', tagIds: ['tag'] }}
    />,
  );
  expect(screen.getByRole('checkbox', { name: 'ทีม A (ปิดใช้งาน)' })).toBeChecked();
});
