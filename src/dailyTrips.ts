import type { Master } from './models';
import type { DailyRow, DailyTrip } from './workspaceModels';

export function defaultTripCapacity(truck?: Master) {
  if (truck && truck.capacity > 0) return truck.capacity;
  return truck?.truckType === 'six-wheel' ? 6 : undefined;
}

export function activeDailyTrips(row: DailyRow): DailyTrip[] {
  return (
    row.transactions?.filter((trip) => !trip.voidedAt) ??
    row.trips?.map((trip) => ({
      ...trip,
      driverId: row.driverId,
      sourceId: row.sourceId,
      soilType: row.soilType,
    })) ??
    []
  );
}

export function deliveredVolume(row: DailyRow) {
  return row.transactions || row.trips
    ? activeDailyTrips(row).reduce((total, trip) => total + trip.capacity, 0)
    : row.tripCount * row.capacity;
}

export function dailyTripSegments(row: DailyRow) {
  if ((!row.transactions && !row.trips) || !row.tripCount)
    return [
      {
        driverId: row.driverId,
        sourceId: row.sourceId,
        capacity: row.capacity,
        tripCount: row.tripCount,
      },
    ];
  const groups = new Map<
    string,
    { driverId: string; sourceId: string; capacity: number; tripCount: number }
  >();
  for (const trip of activeDailyTrips(row)) {
    const key = JSON.stringify([trip.driverId, trip.sourceId, trip.capacity]);
    const group = groups.get(key) ?? {
      driverId: trip.driverId,
      sourceId: trip.sourceId,
      capacity: trip.capacity,
      tripCount: 0,
    };
    group.tripCount++;
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function validateDailyTrips(row: DailyRow) {
  if (
    row.trips &&
    (!Array.isArray(row.trips) ||
      row.trips.length !== row.tripCount ||
      new Set(row.trips.map((trip) => trip.id)).size !== row.trips.length ||
      row.trips.some(
        (trip) =>
          !trip ||
          typeof trip.id !== 'string' ||
          !trip.id ||
          !Number.isFinite(trip.capacity) ||
          trip.capacity <= 0 ||
          !Number.isFinite(Date.parse(trip.recordedAt)),
      ))
  )
    throw Error('ข้อมูลรายเที่ยวไม่ถูกต้อง');
  if (row.transactions && row.trips) throw Error('รูปแบบรายเที่ยวซ้ำกัน');
  if (!row.transactions) return;
  if (!Array.isArray(row.transactions) || row.transactions.length > 5000)
    throw Error('รายการเที่ยวเกินขอบเขต 5,000 รายการต่อรถต่อวัน');
  const ids = new Set<string>();
  for (const trip of row.transactions) {
    if (
      !trip ||
      typeof trip.id !== 'string' ||
      !trip.id ||
      ids.has(trip.id) ||
      !Number.isFinite(trip.capacity) ||
      trip.capacity <= 0 ||
      typeof trip.driverId !== 'string' ||
      typeof trip.sourceId !== 'string' ||
      typeof trip.soilType !== 'string' ||
      !Number.isFinite(Date.parse(trip.recordedAt)) ||
      (trip.voidedAt !== undefined && !Number.isFinite(Date.parse(trip.voidedAt)))
    )
      throw Error('ข้อมูลเที่ยวหรือรหัสเที่ยวซ้ำไม่ถูกต้อง');
    ids.add(trip.id);
  }
  if (activeDailyTrips(row).length !== row.tripCount)
    throw Error('จำนวนเที่ยวไม่ตรงกับรายการเที่ยว');
}

// Existing count-only rows acquire deterministic legacy IDs only when edited.
// New trips retain capacity/driver/source snapshots even if defaults change later.
export function reconcileDailyTrips(
  previous: DailyRow | undefined,
  row: DailyRow,
  scope = '',
): DailyRow {
  if ((previous?.tripCount ?? 0) > 5000)
    throw Error('ข้อมูลเดิมเกิน 5,000 เที่ยว กรุณาแยกวันทำงานก่อนเพิ่มรายการ');
  if (!Number.isSafeInteger(row.tripCount) || row.tripCount < 0 || row.tripCount > 5000)
    throw Error('เที่ยวต้องเป็นจำนวนเต็มตั้งแต่ศูนย์ถึง 5,000');
  const stamp = new Date().toISOString();
  // Preserve the snapshot format already used by cloud rows until explicitly migrated.
  if (previous?.trips && !previous.transactions) {
    const trips = structuredClone(previous.trips).slice(0, row.tripCount);
    while (trips.length < row.tripCount)
      trips.push({ id: crypto.randomUUID(), capacity: row.capacity, recordedAt: stamp });
    const next = { ...row, trips };
    delete next.transactions;
    validateDailyTrips(next);
    return next;
  }
  const transactions: DailyTrip[] = structuredClone(
    previous?.transactions ??
      Array.from({ length: previous?.tripCount ?? 0 }, (_, index) => ({
        id: `legacy-${scope}-${previous!.id}-${index + 1}`,
        capacity: previous!.capacity,
        driverId: previous!.driverId,
        sourceId: previous!.sourceId,
        soilType: previous!.soilType,
        recordedAt: stamp,
      })),
  );
  let count = transactions.filter((trip) => !trip.voidedAt).length;
  for (let index = transactions.length - 1; count > row.tripCount && index >= 0; index--)
    if (!transactions[index].voidedAt) {
      transactions[index].voidedAt = stamp;
      count--;
    }
  while (count++ < row.tripCount)
    transactions.push({
      id: crypto.randomUUID(),
      capacity: row.capacity,
      driverId: row.driverId,
      sourceId: row.sourceId,
      soilType: row.soilType,
      recordedAt: stamp,
    });
  const next = { ...row, transactions };
  validateDailyTrips(next);
  return next;
}
