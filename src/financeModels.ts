import type { Base } from './models';
export type RateSide = 'revenue' | 'truck' | 'driver';
export interface FinanceRate {
  id: string;
  side: RateSide;
  partyId: string;
  effectiveFrom: string;
  unit: 'trip' | 'm3';
  satang: number;
  revision: number;
  reason: string;
  at: string;
  by: string;
}
export interface ProjectExpense {
  id: string;
  date: string;
  category: 'fuel' | 'repair' | 'other';
  truckId: string;
  satang: number;
  reason: string;
  reversesId: string;
  at: string;
  by: string;
}
export type FinanceRecord = Base & {
  recordType: 'finance';
  projectId: string;
  name: string;
  body: { kind: 'rate'; entry: FinanceRate } | { kind: 'expense'; entry: ProjectExpense };
};
