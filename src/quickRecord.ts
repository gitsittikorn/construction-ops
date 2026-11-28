import { createDaily, dailySessions, removeDailyTrip, saveDailyRow, sessionId } from './daily';
import { activeDailyTrips, defaultTripCapacity } from './dailyTrips';
import { assignedDriver, assignedTeam, truckTypes } from './masterData';
import { searchRank } from './searchOptions';
import type { Data, Master } from './models';
import type { DailyRow, DailySession } from './workspaceModels';

export const noTeam = 'none';

export interface QuickTrip {
  projectId: string;
  date: string;
  truckId: string;
  /** Chosen by the caller before the first attempt, so a retry never adds a second trip. */
  tripId: string;
  driverId: string;
  sourceId: string;
  soilType: string;
  /** Only used when the truck has no row yet and no stored capacity. */
  capacity?: number;
  reason?: string;
}

export const findSession = (data: Data, projectId: string, date: string) =>
  dailySessions(data).find((item) => item.id === sessionId(projectId, date));

const hasTrip = (session: DailySession, tripId: string) =>
  session.body.rows.some((row) =>
    (row.transactions ?? row.trips ?? []).some((trip) => trip.id === tripId),
  );

const usable = (data: Data, id: string, kind: Master['kind']) =>
  data.masters.some((item) => item.id === id && item.kind === kind && item.active);

/** Values the next trip of this truck will carry. Overrides never change master data. */
export function nextTripDefaults(
  data: Data,
  session: DailySession | undefined,
  truckId: string,
  context: { sourceId: string; soilType: string },
  override: Partial<{ driverId: string; sourceId: string; soilType: string }> = {},
) {
  const row = session?.body.rows.find((item) => item.truckId === truckId);
  const rowDriver = row && usable(data, row.driverId, 'driver') ? row.driverId : '';
  return {
    driverId: override.driverId ?? (rowDriver || assignedDriver(data.masters, truckId)),
    sourceId: override.sourceId ?? (context.sourceId || row?.sourceId || ''),
    soilType: override.soilType ?? (context.soilType || row?.soilType || ''),
    capacity: row?.capacity ?? defaultTripCapacity(data.masters.find((m) => m.id === truckId)),
  };
}

/** One tap: opens the work day and the truck row when needed, then appends one trip. */
export function recordTrip(data: Data, input: QuickTrip, actor: string): Data {
  const existing = findSession(data, input.projectId, input.date);
  if (existing && hasTrip(existing, input.tripId)) return data;
  if (!data.projects.some((p) => p.id === input.projectId && p.status === 'active'))
    throw Error('เลือกโครงการที่กำลังดำเนินการ');
  if (!usable(data, input.truckId, 'truck')) throw Error('รถคันนี้ปิดใช้งานหรือไม่พบข้อมูล');
  const next = existing ? data : createDaily(data, input.projectId, input.date, actor);
  const session = findSession(next, input.projectId, input.date)!;
  if (session.body.state === 'closed')
    throw Error('ปิดวันแล้ว ต้องเปิดวันใหม่พร้อมเหตุผลก่อนบันทึก');
  const previous = session.body.rows.find((row) => row.truckId === input.truckId);
  const values = {
    driverId: input.driverId,
    sourceId: input.sourceId,
    soilType: input.soilType,
  };
  // The older snapshot format has no per-trip driver, so changing it would rewrite history.
  if (
    previous?.trips?.length &&
    (previous.driverId !== values.driverId ||
      previous.sourceId !== values.sourceId ||
      previous.soilType !== values.soilType)
  )
    throw Error('รถคันนี้มีเที่ยวรูปแบบเดิม เปลี่ยนคนขับหรือแหล่งดินไม่ได้ กรุณาแก้ที่หน้าตรวจยอด');
  const capacity =
    previous?.capacity ??
    input.capacity ??
    defaultTripCapacity(next.masters.find((m) => m.id === input.truckId));
  if (!capacity || !(capacity > 0)) throw Error('กรุณาระบุความจุของรถคันนี้ก่อน');
  const row: DailyRow = previous
    ? { ...previous, ...values, tripCount: previous.tripCount + 1 }
    : {
        id: `row-${input.truckId}-${input.date}`,
        truckId: input.truckId,
        teamId: assignedTeam(next, input.projectId, input.truckId, input.date),
        ...values,
        tripCount: 1,
        capacity,
        reportedTrips: null,
        notes: '',
      };
  return saveDailyRow(
    next,
    session.id,
    session.body.version,
    row,
    actor,
    input.reason ?? '',
    input.tripId,
  );
}

export interface DayTrip {
  key: string;
  rowId: string;
  truckId: string;
  driverId: string;
  sourceId: string;
  soilType: string;
  capacity: number;
  recordedAt: string;
  /** Order of this trip for its truck on this day, starting at 1. */
  sequence: number;
}

/** Newest first. Count-only rows from older data have no individual trips to list. */
export function dayTrips(session: DailySession | undefined): DayTrip[] {
  return (session?.body.rows ?? [])
    .flatMap((row) =>
      activeDailyTrips(row).map((trip, index) => ({
        key: trip.id,
        rowId: row.id,
        truckId: row.truckId,
        driverId: trip.driverId,
        sourceId: trip.sourceId,
        soilType: trip.soilType,
        capacity: trip.capacity,
        recordedAt: trip.recordedAt,
        sequence: index + 1,
      })),
    )
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.sequence - a.sequence);
}

export function removeTrips(
  data: Data,
  projectId: string,
  date: string,
  trips: { id: string; rowId: string; label: string }[],
  actor: string,
  reason: string,
) {
  const result = {
    data,
    deleted: [] as string[],
    failed: [] as { id: string; label: string; reason: string }[],
  };
  for (const trip of trips) {
    try {
      const session = findSession(result.data, projectId, date);
      if (!session) throw Error('ไม่พบวันทำงาน');
      result.data = removeDailyTrip(
        result.data,
        session.id,
        session.body.version,
        trip.rowId,
        trip.id,
        actor,
        reason,
      );
      result.deleted.push(trip.id);
    } catch (error) {
      result.failed.push({
        id: trip.id,
        label: trip.label,
        reason: error instanceof Error ? error.message : 'ลบไม่สำเร็จ',
      });
    }
  }
  return result;
}

/** A truck's teams come from its tags; a truck without tags uses its assigned driver's tags. */
export function truckTeams(masters: Master[], truck: Master): string[] {
  const known = (ids: string[] = []) =>
    ids.filter((id) => masters.some((item) => item.id === id && item.kind === 'tag'));
  const own = known(truck.tagIds);
  if (own.length) return own;
  return known(masters.find((item) => item.id === truck.driverId)?.tagIds);
}

export function truckCards(
  data: Data,
  session: DailySession | undefined,
  query: string,
  team: string,
) {
  const counts = new Map(session?.body.rows.map((row) => [row.truckId, row]) ?? []);
  const byId = new Map(data.masters.map((item) => [item.id, item]));
  return data.masters
    .filter((item) => item.kind === 'truck' && (item.active || counts.has(item.id)))
    .map((truck) => {
      const row = counts.get(truck.id);
      const driver = byId.get(row?.driverId || truck.driverId || '');
      const teams = truckTeams(data.masters, truck);
      return {
        truck,
        driver,
        teams,
        teamNames: teams.map((id) => byId.get(id)?.name ?? ''),
        type: truck.truckType ? truckTypes[truck.truckType] : '',
        trips: row?.tripCount ?? 0,
      };
    })
    .filter(
      (card) =>
        (!team || (team === noTeam ? !card.teams.length : card.teams.includes(team))) &&
        // Exact partial matches only: a near miss here would put a trip on the wrong truck.
        searchRank(
          [
            card.truck.name,
            card.truck.province,
            card.driver?.name,
            card.driver?.nickname,
            card.truck.nickname,
            card.truck.phone,
            card.driver?.phone,
          ].join(' '),
          query,
        ) < 3,
    )
    .sort((a, b) => a.truck.name.localeCompare(b.truck.name, 'th', { numeric: true }));
}

export const summaryGroups = {
  truck: 'รถ',
  driver: 'คนขับ',
  team: 'ทีม',
  source: 'แหล่งดิน',
  soil: 'ชนิดดิน',
} as const;
export type SummaryGroup = keyof typeof summaryGroups;

/** Day totals; each trip is counted exactly once whichever dimension is chosen. */
export function daySummary(data: Data, session: DailySession | undefined, group: SummaryGroup) {
  const name = (id: string) => data.masters.find((m) => m.id === id)?.name ?? '';
  const totals = new Map<string, number>();
  const add = (label: string, trips: number) =>
    totals.set(label || 'ไม่ระบุ', (totals.get(label || 'ไม่ระบุ') ?? 0) + trips);
  for (const row of session?.body.rows ?? []) {
    const label = (driverId: string, sourceId: string, soil: string) =>
      group === 'truck'
        ? name(row.truckId)
        : group === 'driver'
          ? name(driverId)
          : group === 'team'
            ? name(row.teamId)
            : group === 'source'
              ? name(sourceId)
              : soil;
    const trips = activeDailyTrips(row);
    if (trips.length)
      for (const trip of trips) add(label(trip.driverId, trip.sourceId, trip.soilType), 1);
    else if (row.tripCount) add(label(row.driverId, row.sourceId, row.soilType), row.tripCount);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b, 'th', { numeric: true }));
}
