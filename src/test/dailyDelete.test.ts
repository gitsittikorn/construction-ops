import {
  createDaily,
  dailySessions,
  deleteDailyRow,
  removeDailyTrip,
  saveDailyRow,
} from '../daily';
import { deleteSurvey } from '../deletion';
import { integrityIssues } from '../syncModel';
import { activeDailyTrips } from '../dailyTrips';
import { fixture, project, truck, stamp } from './syncFixtures';

const row = {
  id: 'row',
  truckId: 'truck',
  driverId: '',
  teamId: '',
  sourceId: '',
  soilType: '',
  tripCount: 2,
  capacity: 6,
  reportedTrips: null,
  notes: '',
};
function working() {
  let data = createDaily(
    { ...fixture(), trips: [], masters: [truck] },
    project.id,
    '2026-11-06',
    'o',
  );
  const id = dailySessions(data)[0].id;
  data = saveDailyRow(data, id, 1, row, 'o');
  return { data, id };
}

it('removes one trip as voided history and requires a reason', () => {
  const { data, id } = working();
  const trips = activeDailyTrips(dailySessions(data)[0].body.rows[0]);
  expect(() => removeDailyTrip(data, id, 2, 'row', trips[0].id, 'o', ' ')).toThrow('เหตุผล');
  const next = removeDailyTrip(data, id, 2, 'row', trips[0].id, 'o', 'กดเกิน');
  const saved = dailySessions(next)[0].body.rows[0];
  expect(saved.tripCount).toBe(1);
  expect(saved.transactions).toHaveLength(2);
  expect(() => removeDailyTrip(next, id, 3, 'row', trips[0].id, 'o', 'ซ้ำ')).toThrow('ไม่พบ');
});

it('deletes a truck row with its history kept, but not once evidence exists', () => {
  const { data, id } = working();
  expect(() => deleteDailyRow(data, id, 2, 'row', 'o')).toThrow('เหตุผล');
  const next = deleteDailyRow(data, id, 2, 'row', 'o', 'ใส่ผิดคัน');
  expect(dailySessions(next)[0].body.rows).toEqual([]);
  expect(dailySessions(next)[0].body.history?.at(-1)).toMatchObject({ action: 'daily-delete-row' });
  expect(integrityIssues(next)).toEqual([]);
  const proven = structuredClone(data);
  proven.workspaces!.push({
    id: 'proof',
    createdAt: stamp,
    updatedAt: stamp,
    recordType: 'evidence',
    projectId: project.id,
    name: 'proof',
    body: {
      sessionId: id,
      rowId: 'row',
      date: '2026-11-06',
      truckId: 'truck',
      driverId: '',
      fingerprint: 'x',
      files: [],
    },
  });
  expect(() => deleteDailyRow(proven, id, 2, 'row', 'o', 'x')).toThrow('หลักฐาน');
});

it('soft deletes only survey records', () => {
  const { data, id } = working();
  expect(() => deleteSurvey(data, id, 'o')).toThrow('ไม่พบงานสำรวจ');
  const survey = structuredClone(data);
  survey.workspaces = [{ ...survey.workspaces![0], id: 's', recordType: 'survey' } as never];
  const next = deleteSurvey(survey, 's', 'o');
  expect(next.workspaces).toEqual([]);
  expect(next.deletedWorkspaces?.map((item) => item.id)).toEqual(['s']);
});
