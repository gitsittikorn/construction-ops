import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectPicker from '../ProjectPicker';
import type { Project } from '../models';
const base = {
  id: 'p',
  name: 'Project',
  createdAt: 'now',
  updatedAt: 'now',
  customer: '',
  location: '',
  startDate: '',
  endDate: '',
  description: '',
};
it('keeps every project visible with a clear reason when its status prevents selection', () => {
  const projects: Project[] = (['active', 'draft', 'completed', 'archived'] as const).map(
    (status) => ({ ...base, id: status, name: status, status }),
  );
  render(<ProjectPicker projects={projects} value="" onChange={vi.fn()} />);
  expect(screen.getByRole('option', { name: 'active' })).toBeEnabled();
  expect(screen.getByRole('option', { name: /draft/ })).toBeDisabled();
  expect(screen.getByRole('option', { name: /completed/ })).toBeDisabled();
  expect(screen.getByRole('option', { name: /archived/ })).toBeDisabled();
});
it('directs the user to activate a draft without silently changing its status', async () => {
  const manage = vi.fn();
  const project: Project = { ...base, status: 'draft' };
  render(<ProjectPicker projects={[project]} value="" onChange={vi.fn()} onManage={manage} />);
  expect(screen.getByRole('status')).toHaveTextContent('เปลี่ยนสถานะ');
  await userEvent.click(screen.getByRole('button', { name: 'จัดการสถานะโครงการ' }));
  expect(manage).toHaveBeenCalledOnce();
  expect(project.status).toBe('draft');
});
it('supports choosing a project after its options arrive asynchronously', async () => {
  const onChange = vi.fn();
  const view = render(<ProjectPicker projects={[]} value="" onChange={onChange} />);
  view.rerender(
    <ProjectPicker projects={[{ ...base, status: 'active' }]} value="" onChange={onChange} />,
  );
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'โครงการ *' }), 'p');
  expect(onChange).toHaveBeenCalledWith('p');
});
it('retains the selected ID on rerender and warns if that project is later closed', () => {
  const view = render(
    <ProjectPicker projects={[{ ...base, status: 'active' }]} value="p" onChange={vi.fn()} />,
  );
  expect(screen.getByRole('combobox')).toHaveValue('p');
  view.rerender(
    <ProjectPicker projects={[{ ...base, status: 'completed' }]} value="p" onChange={vi.fn()} />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('เสร็จสิ้น');
  expect(screen.getByRole('option', { name: /Project/ })).toBeDisabled();
});
