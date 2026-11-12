import { actorUid } from './workspaceIdentity';
import type { Data, Trip, Project, Master } from './models';
export function workDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function workTimestamp(value: string, seconds = false) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        ...(seconds ? { second: '2-digit' as const } : {}),
      })
    : value;
}
export function validateProject(project: Project) {
  if (!project.name.trim()) throw Error('กรุณาระบุชื่อโครงการ');
  if (project.endDate && project.startDate && project.endDate < project.startDate)
    throw Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น');
  if (
    (project.latitude !== undefined || project.longitude !== undefined) &&
    !projectMapsUrl(project.latitude, project.longitude)
  )
    throw Error(
      'กรุณาระบุ Latitude และ Longitude ให้ครบ โดย Latitude อยู่ระหว่าง -90 ถึง 90 และ Longitude ระหว่าง -180 ถึง 180',
    );
}
export function projectMapsUrl(latitude?: number, longitude?: number): string | null {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  )
    return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}
export function parseCoordinateInput(value: string): Pick<Project, 'latitude' | 'longitude'> {
  if (!value.trim()) return {};
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length !== 2 || parts.some((part) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(part)))
    throw Error('กรุณาระบุพิกัดให้ครบในรูปแบบ lat, lng เช่น 13.7563, 100.5018');
  return parseProjectCoordinates(parts[0], parts[1]);
}
export function parseProjectCoordinates(
  latitude: string,
  longitude: string,
): Pick<Project, 'latitude' | 'longitude'> {
  const lat = latitude.trim(),
    lng = longitude.trim();
  if (!lat && !lng) return {};
  if (!lat || !lng || !projectMapsUrl(Number(lat), Number(lng)))
    throw Error(
      'กรุณาระบุ Latitude และ Longitude ให้ครบ โดย Latitude อยู่ระหว่าง -90 ถึง 90 และ Longitude ระหว่าง -180 ถึง 180',
    );
  return { latitude: Number(lat), longitude: Number(lng) };
}
export function validateMaster(master: Master) {
  if (!master.name.trim()) throw Error('กรุณาระบุชื่อหรือทะเบียนรถ');
  if (!Number.isFinite(master.capacity) || master.capacity < 0)
    throw Error('ความจุต้องเป็นเลขศูนย์หรือมากกว่า');
}
export function saveTrip(data: Data, trip: Trip, actor = 'local'): Data {
  if (!data.projects.some((p) => p.id === trip.projectId && p.status === 'active'))
    throw Error('กรุณาเลือกโครงการที่กำลังดำเนินการ');
  if (!data.masters.some((m) => m.id === trip.truckId && m.kind === 'truck' && m.active))
    throw Error('กรุณาเลือกรถที่พร้อมใช้งาน');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(trip.date) ||
    !Number.isFinite(Date.parse(trip.date)) ||
    new Date(trip.date).toISOString().slice(0, 10) !== trip.date ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(trip.time)
  )
    throw Error('กรุณาระบุวันที่และเวลาให้ถูกต้อง');
  for (const [id, kind] of [
    [trip.driverId, 'driver'],
    [trip.sourceId, 'source'],
  ])
    if (id && !data.masters.some((m) => m.id === id && m.kind === kind && m.active))
      throw Error('ข้อมูลคนขับหรือแหล่งดินไม่พร้อมใช้งาน');
  const previous = data.trips.find((t) => t.id === trip.id);
  const capacity =
    trip.capacityPerTrip ??
    (previous?.truckId === trip.truckId
      ? previous.capacityPerTrip
      : data.masters.find((m) => m.id === trip.truckId)?.capacity);
  if (capacity !== undefined && Number.isFinite(capacity) && capacity > 0)
    trip = { ...trip, capacityPerTrip: capacity };
  if (
    trip.soilType &&
    trip.soilType !== previous?.soilType &&
    !data.masters.some(
      (master) => master.kind === 'soilType' && master.active && master.name === trip.soilType,
    )
  )
    throw Error('กรุณาเลือกชนิดดินที่เปิดใช้งานจากข้อมูลพื้นฐาน');
  if (previous && previous.revision === trip.revision) {
    if (JSON.stringify(previous) !== JSON.stringify(trip))
      throw Error('รายการ ID เดียวกันมีข้อมูลไม่ตรงกัน กรุณาตรวจสอบ');
    return data;
  }
  if (previous && trip.revision !== previous.revision + 1)
    throw Error('ข้อมูลเปลี่ยนแปลงแล้ว กรุณาเปิดรายการใหม่');
  return {
    ...data,
    trips: [...data.trips.filter((t) => t.id !== trip.id), trip],
    audit: [
      ...data.audit,
      {
        id: crypto.randomUUID(),
        entityId: trip.id,
        action: previous ? 'update' : 'create',
        at: new Date().toISOString(),
        actor: actorUid(actor),
        before: previous ?? null,
        after: trip,
      },
    ],
  };
}
export function survey(knownRL: number, backsight: number, reading: number, target: number) {
  if (![knownRL, backsight, reading, target].every(Number.isFinite) || backsight < 0 || reading < 0)
    throw Error('ค่าระดับไม่ถูกต้อง');
  const hi = knownRL + backsight;
  const rl = hi - reading;
  return { hi, rl, fill: Math.max(0, target - rl), cut: Math.max(0, rl - target) };
}
export function volume(
  area: number,
  height: number,
  looseFactor: number,
  settlement: number,
  capacity: number,
) {
  if (
    ![area, height, looseFactor, settlement, capacity].every(Number.isFinite) ||
    area <= 0 ||
    height < 0 ||
    looseFactor <= 0 ||
    settlement < 0 ||
    capacity <= 0
  )
    throw Error('กรุณาระบุค่าคำนวณให้ถูกต้อง');
  const compacted = area * height;
  const allowance = (compacted * settlement) / 100;
  const loose = (compacted + allowance) * looseFactor;
  return { compacted, allowance, loose, trips: Math.ceil(loose / capacity) };
}
export function csv(rows: string[][]) {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map(
            (value) =>
              '"' + (/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""') + '"',
          )
          .join(','),
      )
      .join('\r\n')
  );
}
