import { validatePriceHistory } from './soilPriceValidation';
import type { Data, Master, SoilPrice } from './models';
import { actorUid } from './workspaceIdentity';
import { companyRole } from './workspaceIdentity';
import { saveMaster } from './masterData';

export function priceHistory(data: Data, soil: Master, sourceId = '') {
  return data.masters
    .filter((item) => item.kind === 'soilPrice' && item.soilPrice?.soilTypeId === soil.id)
    .map((item) => item.soilPrice!)
    .filter((entry) => !sourceId || entry.sourceId === sourceId)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    .map((entry, index) => ({ ...entry, sequence: index + 1 }))
    .sort((a, b) => b.at.localeCompare(a.at) || b.sequence - a.sequence);
}

export function saveSoilPrice(
  data: Data,
  input: {
    soilId: string;
    sourceId: string;
    amount: string;
    unit: string;
    note: string;
  },
  actor: string,
): Data {
  if (companyRole(actor) === 'operator') throw Error('การปรับราคาต้องให้ผู้จัดการดำเนินการ');
  const soil = data.masters.find(
    (item) => item.id === input.soilId && item.kind === 'soilType' && item.active,
  );
  const source = data.masters.find(
    (item) => item.id === input.sourceId && item.kind === 'source' && item.active,
  );
  if (!soil || !source) throw Error('กรุณาเลือกชนิดดินและแหล่งดินที่เปิดใช้งาน');
  if (!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(input.amount.trim()))
    throw Error('ราคาต้องเป็นเลขตั้งแต่ศูนย์ ทศนิยมไม่เกิน 2 ตำแหน่ง');
  const [whole, decimal = ''] = input.amount.trim().split('.');
  const satang = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (satang > 1000000000000 || !['m3', 'trip'].includes(input.unit) || input.note.length > 500)
    throw Error('ราคาหรือหน่วยราคาไม่ถูกต้อง');
  const at = new Date().toISOString();
  const entry: SoilPrice = {
    id: crypto.randomUUID(),
    soilTypeId: soil.id,
    sourceId: source.id,
    sourceName: source.name,
    soilName: soil.name,
    satang,
    unit: input.unit as SoilPrice['unit'],
    at,
    by: actorUid(actor),
    note: input.note.trim(),
  };
  validatePriceHistory([entry]);
  return saveMaster(
    data,
    {
      id: entry.id,
      kind: 'soilPrice',
      name: `${soil.name} · ${source.name}`.slice(0, 200),
      detail: '',
      capacity: 0,
      active: true,
      createdAt: at,
      updatedAt: at,
      soilPrice: entry,
    },
    actor,
    true,
  );
}
