import type { FinanceRecord } from './financeModels';
const date = (value: unknown) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const text = (value: unknown) => typeof value === 'string' && value.length <= 500;
export function validateFinance(record: FinanceRecord) {
  const body = record.body;
  if (
    !body ||
    !['rate', 'expense'].includes(body.kind) ||
    !body.entry ||
    Object.keys(body).some((key) => !['kind', 'entry'].includes(key))
  )
    throw Error('รูปแบบการเงินโครงการไม่ถูกต้อง');
  const e = body.entry;
  const fields =
    body.kind === 'rate'
      ? [
          'id',
          'side',
          'partyId',
          'effectiveFrom',
          'unit',
          'satang',
          'revision',
          'reason',
          'at',
          'by',
        ]
      : ['id', 'date', 'category', 'truckId', 'satang', 'reason', 'reversesId', 'at', 'by'];
  if (
    Object.keys(e).length !== fields.length ||
    fields.some((key) => !(key in e)) ||
    Object.keys(e).some((key) => !fields.includes(key)) ||
    e.id !== record.id ||
    !Number.isSafeInteger(e.satang) ||
    e.satang < 0 ||
    e.satang > 1_000_000_000_000 ||
    !text(e.reason) ||
    !e.reason.trim() ||
    !text(e.by) ||
    !e.by ||
    !text(e.at) ||
    !Number.isFinite(Date.parse(e.at)) ||
    e.at !== record.createdAt ||
    record.updatedAt !== record.createdAt
  )
    throw Error('ข้อมูลการเงินหรือจำนวนเงินไม่ถูกต้อง');
  if (body.kind === 'rate') {
    const rate = body.entry;
    if (
      !['revenue', 'truck', 'driver'].includes(rate.side) ||
      !text(rate.partyId) ||
      (rate.side === 'revenue' && rate.partyId !== '') ||
      !date(rate.effectiveFrom) ||
      !['trip', 'm3'].includes(rate.unit) ||
      !Number.isSafeInteger(rate.revision) ||
      rate.revision < 1
    )
      throw Error('เรตราคาไม่ถูกต้อง');
  } else {
    const expense = body.entry;
    if (
      !date(expense.date) ||
      !['fuel', 'repair', 'other'].includes(expense.category) ||
      !text(expense.truckId) ||
      !expense.satang ||
      !text(expense.reversesId) ||
      expense.reversesId === expense.id ||
      (expense.reversesId && expense.id !== `reversal-${expense.reversesId}`)
    )
      throw Error('ค่าใช้จ่ายหรือรายการกลับไม่ถูกต้อง');
  }
}
