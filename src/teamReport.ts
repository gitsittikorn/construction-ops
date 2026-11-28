import type { Data } from './models';
import type { ReportRow } from './reports';
import { checked, rateAmount, rateFor } from './financeRates';

interface Tally {
  days: Map<string, number>;
  trips: number;
  satang: number;
  unpriced: number;
}
const empty = (): Tally => ({ days: new Map(), trips: 0, satang: 0, unpriced: 0 });

// A trip keeps the team recorded with it. Only trips without one use the truck's tag,
// and only when that truck has exactly one tag.
export function teamOf(data: Data, row: ReportRow) {
  if (row.team) return row.team;
  const tags = data.masters.find((item) => item.id === row.truck)?.tagIds ?? [];
  return tags.length === 1 ? tags[0] : '';
}

export function teamTable(data: Data, rows: ReportRow[], money: boolean): (string | number)[][] {
  const counted = rows.filter((row) => row.trips > 0);
  const dates = [...new Set(counted.map((row) => row.date))].sort();
  const name = (id: string) => data.masters.find((item) => item.id === id)?.name ?? id;
  const teamName = (id: string) => (id ? name(id) : 'ไม่ระบุทีม');
  const teams = new Map<string, Map<string, Tally>>();
  const teamTotals = new Map<string, Tally>();
  const grand = empty();
  for (const row of counted) {
    const team = teamOf(data, row);
    const trucks = teams.get(team) ?? new Map<string, Tally>();
    teams.set(team, trucks);
    const truck = trucks.get(row.truck) ?? empty();
    trucks.set(row.truck, truck);
    const subtotal = teamTotals.get(team) ?? empty();
    teamTotals.set(team, subtotal);
    let amount: number | null = null;
    if (money) {
      const rates = (data.workspaces ?? []).flatMap((record) =>
        record.recordType === 'finance' &&
        record.projectId === row.project &&
        record.body.kind === 'rate'
          ? [record.body.entry]
          : [],
      );
      amount = rateAmount(rateFor(rates, 'truck', row), row);
    }
    for (const tally of [truck, subtotal, grand]) {
      tally.days.set(row.date, (tally.days.get(row.date) ?? 0) + row.trips);
      tally.trips += row.trips;
      if (amount === null) tally.unpriced += row.trips;
      else tally.satang = checked(BigInt(tally.satang) + BigInt(amount));
    }
  }
  const line = (team: string, truck: string, tally: Tally) => [
    team,
    truck,
    ...dates.map((date) => tally.days.get(date) ?? 0),
    tally.trips,
    ...(money ? [tally.satang / 100, tally.unpriced] : []),
  ];
  const result: (string | number)[][] = [
    [
      'ทีม',
      'ทะเบียนรถ',
      ...dates,
      'รวมเที่ยว',
      ...(money ? ['ค่าเที่ยวรถ (บาท)', 'เที่ยวที่ยังไม่มีเรต'] : []),
    ],
  ];
  const ordered = [...teams].sort(([a], [b]) => teamName(a).localeCompare(teamName(b), 'th'));
  for (const [team, trucks] of ordered) {
    const sorted = [...trucks].sort(([a], [b]) => name(a).localeCompare(name(b), 'th'));
    for (const [truck, tally] of sorted) result.push(line(teamName(team), name(truck), tally));
    result.push(line(`รวม ${teamName(team)}`, `${trucks.size} คัน`, teamTotals.get(team)!));
  }
  if (counted.length) result.push(line('รวมทั้งหมด', '', grand));
  return result;
}
