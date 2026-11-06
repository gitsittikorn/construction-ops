import { calculateSurvey, gridPoints, levelSurvey, saveSurvey, metres } from '../surveying';
import type { SurveyBody, SurveyRecord } from '../workspaceModels';
import { fixture, project } from './syncFixtures';
import { persistData, loadData, updateData } from '../storage';

function body(): SurveyBody {
  return {
    benchmark: 'BM1',
    elevation: 0,
    datum: 'project',
    notes: '',
    observations: [],
    width: 10,
    length: 10,
    spacingX: 5,
    spacingY: 5,
    design: 'uniform',
    designLevel: 1,
    slopeX: 0,
    slopeY: 0,
    allowance: 30,
    cutSwell: 25,
    points: gridPoints(10, 10, 5, 5, 0),
  };
}
it('propagates BM through BS/IS/FS and a new HI via turning points', () => {
  const rows = levelSurvey('BM', 100, [
    { type: 'BS', point: 'BM', reading: 1.5 },
    { type: 'IS', point: 'A', reading: 2 },
    { type: 'FS', point: 'TP1', reading: 3 },
    { type: 'BS', point: 'TP1', reading: 1 },
    { type: 'FS', point: 'B', reading: 2 },
  ]);
  expect(rows.map((r) => r.hi)).toEqual([101.5, 101.5, 101.5, 99.5, 99.5]);
  expect(rows.map((r) => r.rl)).toEqual([100, 99.5, 98.5, 98.5, 97.5]);
  expect(() => levelSurvey('BM', 100, [{ type: 'IS', point: 'A', reading: 1 }])).toThrow('BS');
  expect(() => levelSurvey('BM', 100, [{ type: 'BS', point: 'other', reading: 1 }])).toThrow('TP');
  expect(() => levelSurvey('BM', 100, [{ type: 'BS', point: 'BM', reading: -1 }])).toThrow();
});
it('computes uniform areas and volumes and keeps fill allowance distinct from cut swell', () => {
  const value = calculateSurvey(body());
  expect(value.area).toBe(100);
  expect(value.fill).toBeCloseTo(100);
  expect(value.cut).toBe(0);
  expect(value.looseFill).toBeCloseTo(130);
  expect(value.fillArea).toBeCloseTo(100);
  const cut = calculateSurvey({ ...body(), designLevel: -2 });
  expect(cut.cut).toBeCloseTo(200);
  expect(cut.looseCut).toBeCloseTo(250);
  expect(cut.fill).toBe(0);
  const zero = calculateSurvey({ ...body(), designLevel: 0 });
  expect(zero.fillArea).toBe(0);
  expect(zero.cutArea).toBe(0);
});
it('integrates sloped planes and mixed cut/fill without cancellation', () => {
  const slope = calculateSurvey({ ...body(), design: 'slope', designLevel: 0, slopeX: 20 });
  expect(slope.fill).toBeCloseTo(100);
  const original = body(),
    mixed = calculateSurvey({
      ...original,
      designLevel: 0,
      points: original.points.map((p) => ({ ...p, existing: p.x / 5 - 1 })),
    });
  expect(mixed.fill).toBeCloseTo(25);
  expect(mixed.cut).toBeCloseTo(25);
  expect(mixed.fillArea).toBeCloseTo(50);
  expect(mixed.cutArea).toBeCloseTo(50);
  expect(mixed.designVolumeAboveBM - mixed.groundVolumeAboveBM).toBeCloseTo(mixed.fill - mixed.cut);
});
it('includes partial boundary cells and custom design elevations with exact area', () => {
  const points = gridPoints(11, 7, 5, 4, 0),
    value = calculateSurvey({
      ...body(),
      width: 11,
      length: 7,
      spacingX: 5,
      spacingY: 4,
      design: 'custom',
      points: points.map((p) => ({ ...p, customDesign: 2 })),
    });
  expect(points.at(-1)).toMatchObject({ x: 11, y: 7 });
  expect(value.fill).toBeCloseTo(154);
  expect(value.area).toBe(77);
});
it('rejects incomplete/duplicate grids, invalid dimensions/factors/units and excessive datasets', () => {
  expect(() => gridPoints(0, 10, 5, 5, 0)).toThrow();
  expect(() => gridPoints(1000, 1000, 1, 1, 0)).toThrow('2,500');
  expect(() => calculateSurvey({ ...body(), points: [] })).toThrow('ครบ');
  expect(() => calculateSurvey({ ...body(), allowance: NaN })).toThrow();
  expect(() => calculateSurvey({ ...body(), cutSwell: -1 })).toThrow();
  expect(metres(100, 'cm')).toBe(1);
  expect(metres(1000, 'mm')).toBe(1);
  expect(() => metres(NaN, 'm')).toThrow();
  expect(() => metres(1, 'unsupported' as never)).toThrow();
});
it('preserves survey history through IndexedDB and rejects stale saves', async () => {
  const owner = crypto.randomUUID(),
    now = '2026-11-06T00:00:00Z';
  const record: SurveyRecord = {
    id: 'survey',
    recordType: 'survey',
    projectId: project.id,
    name: 'grid',
    createdAt: now,
    updatedAt: now,
    body: body(),
  };
  await persistData(owner, fixture());
  await updateData(owner, (old) => saveSurvey(old, record, owner));
  expect((await loadData(owner)).workspaces?.[0]).toEqual(record);
  const updated = { ...record, name: 'new' };
  await updateData(owner, (old) => saveSurvey(old, updated, owner, record));
  await expect(
    updateData(owner, (old) => saveSurvey(old, { ...record, name: 'stale' }, owner, record)),
  ).rejects.toThrow('เปลี่ยน');
  expect((await loadData(owner)).audit.filter((a) => a.entityId === 'survey')).toHaveLength(2);
});
