import { actorUid } from './workspaceIdentity';
import type { Data } from './models';
import type { FinanceRecord, FinanceRate, ProjectExpense, RateSide } from './financeModels';
import { validateFinance } from './financeValidation';
import { commitWorkspace } from './daily';
import { emptyReportFilter, reportRows, type ReportRow } from './reports';
import { canonical } from './syncModel';

export function parseBaht(value: string) {
  if (!/^(0|[1-9]\d{0,10})(\.\d{1,2})?$/.test(value.trim()))
    throw Error('ระบุจำนวนเงินบาทไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง');
  const [whole, decimal = ''] = value.trim().split('.');
  const satang = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(satang) || satang > 1_000_000_000_000)
    throw Error('จำนวนเงินเกินขอบเขต 10,000 ล้านบาทต่อรายการ');
  return satang;
}
export function baht(satang: number) {
  if (!Number.isSafeInteger(satang)) throw Error('ยอดเงินคำนวณไม่ถูกต้อง');
  const absolute = Math.abs(satang);
  return `${satang < 0 ? '-' : ''}${Math.floor(absolute / 100).toLocaleString('th-TH')}.${String(absolute % 100).padStart(2, '0')}`;
}
export function financeRecords(data: Data, projectId: string) {
  return (data.workspaces ?? []).filter(
    (record): record is FinanceRecord =>
      record.recordType === 'finance' && record.projectId === projectId,
  );
}
export function financeVersion(data: Data, projectId: string) {
  return canonical(
    financeRecords(data, projectId)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}
function commit(
  data: Data,
  projectId: string,
  version: string,
  body: FinanceRecord['body'],
  actor: string,
  action: string,
) {
  if (
    !actor ||
    !data.projects.some((project) => project.id === projectId && project.status === 'active')
  )
    throw Error('เลือกโครงการที่กำลังดำเนินการก่อนบันทึกการเงิน');
  if (financeVersion(data, projectId) !== version)
    throw Error('ข้อมูลการเงินเปลี่ยนแล้ว กรุณาตรวจข้อมูลล่าสุดแล้วลองใหม่');
  if ((data.workspaces ?? []).some((record) => record.id === body.entry.id))
    throw Error('รายการนี้บันทึกแล้ว กรุณาตรวจประวัติ');
  const record: FinanceRecord = {
    id: body.entry.id,
    recordType: 'finance',
    projectId,
    name:
      body.kind === 'rate'
        ? 'เรตราคา'
        : body.entry.reversesId
          ? 'กลับรายการค่าใช้จ่าย'
          : 'ค่าใช้จ่าย',
    createdAt: body.entry.at,
    updatedAt: body.entry.at,
    body,
  };
  validateFinance(record);
  return commitWorkspace(data, record, actor, action);
}
export function addFinanceRate(
  data: Data,
  projectId: string,
  version: string,
  input: Pick<FinanceRate, 'side' | 'partyId' | 'unit' | 'satang' | 'effectiveFrom' | 'reason'>,
  actor: string,
) {
  if (
    input.partyId &&
    !data.masters.some((master) => master.id === input.partyId && master.kind === input.side)
  )
    throw Error('ไม่พบรถหรือคนขับของเรตราคา');
  const old = financeRecords(data, projectId)
    .flatMap((record) => (record.body.kind === 'rate' ? [record.body.entry] : []))
    .filter(
      (rate) =>
        rate.side === input.side &&
        rate.partyId === input.partyId &&
        rate.effectiveFrom === input.effectiveFrom,
    );
  const entry: FinanceRate = {
    ...input,
    id: crypto.randomUUID(),
    revision: Math.max(0, ...old.map((rate) => rate.revision)) + 1,
    reason: input.reason.trim(),
    at: new Date().toISOString(),
    by: actorUid(actor),
  };
  return commit(data, projectId, version, { kind: 'rate', entry }, actor, 'finance-rate-added');
}
export function addProjectExpense(
  data: Data,
  projectId: string,
  version: string,
  input: Pick<ProjectExpense, 'date' | 'category' | 'truckId' | 'satang' | 'reason'>,
  actor: string,
) {
  if (
    input.truckId &&
    !data.masters.some((master) => master.id === input.truckId && master.kind === 'truck')
  )
    throw Error('ไม่พบรถของค่าใช้จ่าย');
  const entry: ProjectExpense = {
    ...input,
    reason: input.reason.trim(),
    id: crypto.randomUUID(),
    reversesId: '',
    at: new Date().toISOString(),
    by: actorUid(actor),
  };
  return commit(
    data,
    projectId,
    version,
    { kind: 'expense', entry },
    actor,
    'finance-expense-added',
  );
}
export function reverseProjectExpense(
  data: Data,
  projectId: string,
  version: string,
  id: string,
  reason: string,
  actor: string,
) {
  const expenses = financeRecords(data, projectId).flatMap((record) =>
    record.body.kind === 'expense' ? [record.body.entry] : [],
  );
  const old = expenses.find((entry) => entry.id === id);
  if (!old || old.reversesId || expenses.some((entry) => entry.reversesId === id))
    throw Error('ค่าใช้จ่ายถูกกลับรายการแล้วหรือไม่พบรายการ');
  return commit(
    data,
    projectId,
    version,
    {
      kind: 'expense',
      entry: {
        ...old,
        id: `reversal-${id}`,
        reversesId: id,
        reason: reason.trim(),
        at: new Date().toISOString(),
        by: actorUid(actor),
      },
    },
    actor,
    'finance-expense-reversed',
  );
}
export function rateFor(rates: FinanceRate[], side: RateSide, row: ReportRow) {
  const partyId = side === 'revenue' ? '' : row[side];
  if (side !== 'revenue' && !partyId) return undefined;
  const eligible = rates.filter(
    (rate) =>
      rate.side === side &&
      rate.effectiveFrom <= row.date &&
      (!rate.partyId || rate.partyId === partyId),
  );
  const specific = eligible.filter((rate) => rate.partyId === partyId);
  const candidates = specific.length ? specific : eligible;
  const latestDate = candidates
    .map((rate) => rate.effectiveFrom)
    .sort()
    .at(-1);
  const dated = candidates.filter((rate) => rate.effectiveFrom === latestDate);
  const revision = Math.max(0, ...dated.map((rate) => rate.revision));
  const latest = dated.filter((rate) => rate.revision === revision);
  if (latest.length > 1)
    throw Error(
      'เรตราคาเวอร์ชันเดียวกันขัดแย้งจากหลายอุปกรณ์ กรุณาตรวจประวัติและเพิ่มฉบับแก้ไขที่มีเหตุผล',
    );
  return latest[0];
}
function checked(value: bigint) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
    throw Error('ยอดรวมเกินขอบเขตคำนวณอย่างแม่นยำ กรุณาลดช่วงวันที่');
  return Number(value);
}
export function rateAmount(rate: FinanceRate | undefined, row: ReportRow): number | null {
  if (!row.trips) return 0;
  if (!rate || (rate.unit === 'm3' && row.capacity === null)) return null;
  let perTrip = BigInt(rate.satang);
  if (rate.unit === 'm3') {
    const [mantissa, exponent = '0'] = String(row.capacity).toLowerCase().split('e');
    const [whole, decimal = ''] = mantissa.split('.');
    const scale = decimal.length - Number(exponent),
      digits = BigInt(whole + decimal);
    const numerator = perTrip * digits * (scale < 0 ? 10n ** BigInt(-scale) : 1n),
      denominator = scale > 0 ? 10n ** BigInt(scale) : 1n;
    // Round half up per trip, then sum satang; never use floating point money.
    perTrip = (numerator * 2n + denominator) / (denominator * 2n);
  }
  return checked(perTrip * BigInt(row.trips));
}
const sides = ['revenue', 'truck', 'driver'] as const;
export function financeSummary(data: Data, projectId: string, from = '', to = '') {
  const records = financeRecords(data, projectId),
    rates = records.flatMap((record) => (record.body.kind === 'rate' ? [record.body.entry] : []));
  const rows = reportRows(data, { ...emptyReportFilter, project: projectId, from, to })
    .filter((row) => row.trips > 0)
    .map((row) => {
      const selected = {
        revenue: rateFor(rates, 'revenue', row),
        truck: rateFor(rates, 'truck', row),
        driver: rateFor(rates, 'driver', row),
      };
      return {
        row,
        rates: selected,
        amounts: {
          revenue: rateAmount(selected.revenue, row),
          truck: rateAmount(selected.truck, row),
          driver: rateAmount(selected.driver, row),
        },
      };
    });
  const totals = { revenue: 0, truck: 0, driver: 0 },
    verified = { revenue: 0, truck: 0, driver: 0 },
    unknown = { revenue: 0, truck: 0, driver: 0 };
  const parties = {
    truck: new Map<string, { known: number; unknownTrips: number }>(),
    driver: new Map<string, { known: number; unknownTrips: number }>(),
  };
  for (const item of rows)
    for (const side of sides) {
      const amount = item.amounts[side];
      if (amount === null) unknown[side] += item.row.trips;
      else {
        totals[side] = checked(BigInt(totals[side]) + BigInt(amount));
        if (item.row.verified) verified[side] = checked(BigInt(verified[side]) + BigInt(amount));
      }
      if (side !== 'revenue') {
        const id = item.row[side],
          current = parties[side].get(id) ?? { known: 0, unknownTrips: 0 };
        if (amount === null) current.unknownTrips += item.row.trips;
        else current.known = checked(BigInt(current.known) + BigInt(amount));
        parties[side].set(id, current);
      }
    }
  const expenses = records
    .flatMap((record) => (record.body.kind === 'expense' ? [record.body.entry] : []))
    .filter((entry) => (!from || entry.date >= from) && (!to || entry.date <= to));
  const expenseTotal = expenses.reduce(
    (sum, entry) => checked(BigInt(sum) + BigInt(entry.satang) * (entry.reversesId ? -1n : 1n)),
    0,
  );
  return {
    rows,
    totals,
    verified,
    unknown,
    parties,
    expenses,
    expenseTotal,
    complete: Object.values(unknown).every((trips) => trips === 0),
    netKnown: checked(
      BigInt(totals.revenue) - BigInt(totals.truck) - BigInt(totals.driver) - BigInt(expenseTotal),
    ),
  };
}
