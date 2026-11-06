import type { Base } from './models';

export interface DailyTrip {
  id: string;
  capacity: number;
  driverId: string;
  sourceId: string;
  soilType: string;
  recordedAt: string;
  voidedAt?: string;
}

export interface DailyRow {
  transactions?: DailyTrip[];
  id: string;
  truckId: string;
  driverId: string;
  teamId: string;
  sourceId: string;
  soilType: string;
  tripCount: number;
  capacity: number;
  reportedTrips: number | null;
  notes: string;
}
export interface Verification {
  fingerprint: string;
  evidenceId: string;
  fileIds: string[];
  by: string;
  at: string;
}
export interface DailyBody {
  history?: {
    id: string;
    action: string;
    reason: string;
    at: string;
    by: string;
    changes: { rowId: string; before: DailyRow | null; after: DailyRow | null }[];
  }[];
  date: string;
  version: number;
  state: 'open' | 'closed' | 'reopened';
  rows: DailyRow[];
  verifications: Record<string, Verification>;
  closures: {
    at: string;
    by: string;
    rows: DailyRow[];
    verifications: Record<string, Verification>;
    trips: number;
    volume: number;
  }[];
  reason: string;
}
export type EvidenceCategory = 'driver-photo' | 'signature' | 'trip-slip';
export interface EvidenceBody {
  sessionId: string;
  rowId: string;
  date: string;
  truckId: string;
  driverId: string;
  fingerprint: string;
  files: { uploadId: string; category: EvidenceCategory; name: string }[];
}
export interface LevelObservation {
  type: 'BS' | 'IS' | 'FS';
  point: string;
  reading: number;
}
export interface SurveyBody {
  benchmark: string;
  elevation: number;
  datum: string;
  notes: string;
  observations: LevelObservation[];
  width: number;
  length: number;
  spacingX: number;
  spacingY: number;
  design: 'uniform' | 'slope' | 'custom';
  designLevel: number;
  slopeX: number;
  slopeY: number;
  allowance: number;
  cutSwell: number;
  points: { id: string; x: number; y: number; existing: number; customDesign: number }[];
}
type Workspace<T extends string, B> = Base & {
  recordType: T;
  projectId: string;
  name: string;
  body: B;
};
export type DailySession = Workspace<'daily', DailyBody>;
export type EvidenceRecord = Workspace<'evidence', EvidenceBody>;
export type SurveyRecord = Workspace<'survey', SurveyBody>;
export type WorkspaceRecord = DailySession | EvidenceRecord | SurveyRecord;
