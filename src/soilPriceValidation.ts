import type { SoilPrice } from './models';

export function validatePriceHistory(value: unknown): asserts value is SoilPrice[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw Error('ประวัติราคาดินไม่ถูกต้องหรือเกิน 1,000 รายการ');
  const ids = new Set<string>();
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      Object.keys(entry).sort().join(',') !==
        'at,by,id,note,satang,soilName,soilTypeId,sourceId,sourceName,unit' ||
      ['id', 'sourceId', 'soilTypeId', 'sourceName', 'soilName', 'at', 'by', 'note'].some(
        (key) => typeof entry[key] !== 'string' || entry[key].length > 500,
      ) ||
      !entry.id ||
      !entry.sourceId ||
      !entry.soilTypeId ||
      !entry.by ||
      !entry.sourceName.trim() ||
      !entry.soilName.trim() ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.at) ||
      !Number.isFinite(Date.parse(entry.at)) ||
      new Date(entry.at).toISOString() !== entry.at ||
      !Number.isSafeInteger(entry.satang) ||
      entry.satang < 0 ||
      entry.satang > 1000000000000 ||
      !['m3', 'trip'].includes(entry.unit) ||
      ids.has(entry.id)
    )
      throw Error('ประวัติราคาดินไม่ถูกต้อง');
    ids.add(entry.id);
  }
}
