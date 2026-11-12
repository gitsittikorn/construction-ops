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
  latitude?: number;
  longitude?: number;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  description: string;
}
export interface Master extends Base {
  kind: 'truck' | 'driver' | 'source' | 'customer' | 'soilType' | 'tag' | 'soilPrice';
  name: string;
  detail: string;
  capacity: number;
  active: boolean;
  province?: string;
  phone?: string;
  nickname?: string;
  truckType?: 'six-wheel' | 'ten-wheel' | 'other';
  tagIds?: string[];
  driverId?: string;
  soilPrice?: SoilPrice;
}
export interface SoilPrice {
  id: string;
  sourceId: string;
  soilTypeId: string;
  sourceName: string;
  soilName: string;
  satang: number;
  unit: 'm3' | 'trip';
  at: string;
  by: string;
  note: string;
}
export interface Trip extends Base {
  capacityPerTrip?: number;
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
  workspaces?: import('./workspaceModels').WorkspaceRecord[];
  deletedWorkspaces?: (import('./workspaceModels').WorkspaceRecord & { deletedAt: string })[];
  projects: Project[];
  masters: Master[];
  trips: Trip[];
  deletedTrips?: (Trip & { deletedAt: string })[];
  deletedProjects?: (Project & { deletedAt: string })[];
  deletedMasters?: (Master & { deletedAt: string })[];
  sync?: import('./syncModel').SyncState;
  audit: Audit[];
}
export const emptyData: Data = { projects: [], masters: [], trips: [], audit: [] };
