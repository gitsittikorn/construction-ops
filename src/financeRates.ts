import type { FinanceRate, RateSide } from './financeModels';
import type { ReportRow } from './reports';

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
export function checked(value: bigint) {
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
