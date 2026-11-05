import { emptyData, type Data, type Project, type Master, type Trip } from '../models';
import { prepareSync, type CloudRecord, type EntityCollection } from '../syncModel';

export const stamp = '2026-11-06T00:00:00.000Z';
export const project: Project = {
  id: 'p',
  createdAt: stamp,
  updatedAt: stamp,
  name: 'Site',
  customer: 'Historical customer',
  location: '',
  startDate: '',
  endDate: '',
  status: 'active',
  description: '',
};
export const truck: Master = {
  id: 'truck',
  createdAt: stamp,
  updatedAt: stamp,
  kind: 'truck',
  name: 'AB123',
  detail: '',
  capacity: 12,
  active: true,
};
export const trip: Trip = {
  id: 'trip',
  createdAt: stamp,
  updatedAt: stamp,
  projectId: 'p',
  truckId: 'truck',
  driverId: '',
  sourceId: '',
  soilType: 'Historical soil',
  date: '2026-11-06',
  time: '10:00',
  notes: '',
  revision: 1,
  syncStatus: 'pending',
};
export const fixture = (): Data =>
  structuredClone({ ...emptyData, projects: [project], masters: [truck], trips: [trip] });
export const cloudRecords = (data = fixture()) =>
  Object.entries(prepareSync(data, data).sync!.entries).map(([key, entry]) => ({
    collection: key.split('/')[0] as EntityCollection,
    record: entry.desired,
  }));
export const cloudProject = (): CloudRecord => cloudRecords()[0].record;
