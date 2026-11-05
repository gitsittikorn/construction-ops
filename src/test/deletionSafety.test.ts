import { deleteRecord } from '../deletion';
import { emptyData } from '../models';
import { fixture, project, truck } from './syncFixtures';

it('blocks deletion of referenced projects, masters and records with queued documents', () => {
  const data = fixture();
  expect(() => deleteRecord(data, 'project', project.id, 'owner')).toThrow('ประวัติเที่ยวรถ');
  expect(() => deleteRecord(data, 'master', truck.id, 'owner')).toThrow('อ้างอิง');
  expect(() => deleteRecord(data, 'trip', 'missing', 'owner')).toThrow('ไม่พบ');
  expect(() =>
    deleteRecord({ ...emptyData, projects: [project] }, 'project', project.id, 'owner', [
      { projectId: project.id } as never,
    ]),
  ).toThrow('เอกสาร');
});
