import { render, screen, waitFor } from '@testing-library/react';
import EvidencePanel from '../EvidencePanel';
import { createDaily, dailySessions, saveDailyRow } from '../daily';
import { fixture, project, truck } from './syncFixtures';
import { listUploads } from '../uploads';

vi.mock('../uploads', () => ({ listUploads: vi.fn() }));

it('shows an IndexedDB read failure and keeps contextual evidence controls available', async () => {
  vi.mocked(listUploads).mockRejectedValue(Error('IndexedDB unavailable'));
  let data = createDaily(
    { ...fixture(), masters: [truck, { ...truck, id: 'driver', kind: 'driver' }] },
    project.id,
    '2026-11-07',
    'local',
  );
  let session = dailySessions(data)[0];
  data = saveDailyRow(
    data,
    session.id,
    session.body.version,
    {
      id: 'row',
      truckId: truck.id,
      driverId: 'driver',
      teamId: '',
      sourceId: '',
      soilType: '',
      tripCount: 1,
      capacity: 12,
      reportedTrips: null,
      notes: '',
    },
    'local',
  );
  session = dailySessions(data)[0];
  render(<EvidencePanel owner="local" data={data} session={session} row={session.body.rows[0]} />);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('IndexedDB unavailable'));
  expect(screen.getByLabelText('เลือกหลักฐานจากแกลเลอรี')).toBeEnabled();
  expect(screen.getByRole('list', { name: 'รายการตรวจหลักฐาน' })).toHaveTextContent(
    'รูปคนขับ: ยังไม่มี',
  );
});
