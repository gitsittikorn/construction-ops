export type SyncStatus = 'pending' | 'synced' | 'error';
export interface Base {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export interface Project extends Base {
  name: string;
  customer: string;
  location: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  description: string;
}
export interface Master extends Base {
  kind: 'truck' | 'driver' | 'source' | 'customer';
  name: string;
  detail: string;
  capacity: number;
  active: boolean;
}
export interface Trip extends Base {
  projectId: string;
  date: string;
  time: string;
  truckId: string;
  driverId: string;
  sourceId: string;
  soilType: string;
  notes: string;
  syncStatus: SyncStatus;
  revision: number;
}
export interface Audit {
  id: string;
  entityId: string;
  action: string;
  at: string;
  actor: string;
  before: unknown;
  after: unknown;
}
export interface Data {
  projects: Project[];
  masters: Master[];
  trips: Trip[];
  audit: Audit[];
}
export const emptyData: Data = { projects: [], masters: [], trips: [], audit: [] };
