import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkspaceErrorBoundary from '../WorkspaceErrorBoundary';
it('keeps the normal workspace visible and offers a clear retry instead of a blank screen on failed rendering', async () => {
  const view = render(
    <WorkspaceErrorBoundary>
      <p>workspace</p>
    </WorkspaceErrorBoundary>,
  );
  expect(screen.getByText('workspace')).toBeInTheDocument();
  view.unmount();
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {}),
    retry = vi.fn();
  function Broken(): never {
    throw Error('offline dynamic import');
  }
  try {
    render(
      <WorkspaceErrorBoundary onRetry={retry}>
        <Broken />
      </WorkspaceErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('คิวในเครื่องยังถูกเก็บไว้');
    await userEvent.click(screen.getByRole('button', { name: 'โหลดแอปใหม่โดยเก็บข้อมูลเดิม' }));
    expect(retry).toHaveBeenCalledOnce();
  } finally {
    spy.mockRestore();
  }
});
