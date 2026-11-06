import type { Data } from './models';
import type { LevelObservation, SurveyBody, SurveyRecord } from './workspaceModels';
import { canonical } from './syncModel';
import { commitWorkspace } from './daily';

export function levelSurvey(
  benchmark: string,
  elevation: number,
  observations: LevelObservation[],
) {
  if (!benchmark.trim() || !Number.isFinite(elevation))
    throw Error('ระบุชื่อ BM และระดับที่ถูกต้อง');
  let reference = benchmark,
    rl = elevation,
    hi: number | null = null;
  return observations.map((o) => {
    if (
      !o.point.trim() ||
      !Number.isFinite(o.reading) ||
      o.reading < 0 ||
      !['BS', 'IS', 'FS'].includes(o.type)
    )
      throw Error('ข้อมูลอ่านไม้ระดับไม่ถูกต้อง');
    if (o.type === 'BS') {
      if (hi !== null || o.point !== reference)
        throw Error('BS ต้องอ้าง BM/TP ล่าสุด และต้องมี FS ก่อนย้ายกล้อง');
      hi = rl + o.reading;
      return { ...o, hi, rl };
    }
    if (hi === null) throw Error('ต้องอ่าน BS ก่อน IS/FS');
    const result = { ...o, hi, rl: hi - o.reading };
    if (o.type === 'FS') {
      reference = o.point;
      rl = result.rl;
      hi = null;
    }
    return result;
  });
}
export function gridPoints(
  width: number,
  length: number,
  spacingX: number,
  spacingY: number,
  elevation: number,
) {
  if (
    ![width, length, spacingX, spacingY, elevation].every(Number.isFinite) ||
    Math.min(width, length, spacingX, spacingY) <= 0
  )
    throw Error('ขนาดแปลงและระยะกริดต้องมากกว่าศูนย์');
  const nx = Math.ceil(width / spacingX),
    ny = Math.ceil(length / spacingY);
  if ((nx + 1) * (ny + 1) > 2500) throw Error('กริดเกิน 2,500 จุด กรุณาเพิ่มระยะห่าง');
  return Array.from({ length: ny + 1 }, (_, y) =>
    Array.from({ length: nx + 1 }, (_, x) => ({
      id: `G${x}-${y}`,
      x: Math.min(x * spacingX, width),
      y: Math.min(y * spacingY, length),
      existing: elevation,
      customDesign: elevation,
    })),
  ).flat();
}
export function designElevation(body: SurveyBody, point: SurveyBody['points'][number]) {
  return body.design === 'custom'
    ? point.customDesign
    : body.designLevel +
        (body.design === 'slope' ? (body.slopeX * point.x + body.slopeY * point.y) / 100 : 0);
}
interface Vertex {
  x: number;
  y: number;
  z: number;
}
const area = (a: Vertex, b: Vertex, c: Vertex) =>
  Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
function positivePart(vertices: Vertex[]) {
  if (vertices.every((v) => v.z <= 0)) return { area: 0, volume: 0 };
  const polygon: Vertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    if (a.z >= 0) polygon.push(a);
    if ((a.z < 0 && b.z > 0) || (a.z > 0 && b.z < 0)) {
      const t = a.z / (a.z - b.z);
      polygon.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: 0 });
    }
  }
  let sumArea = 0,
    volume = 0;
  for (let i = 1; i < polygon.length - 1; i++) {
    const a = polygon[0],
      b = polygon[i],
      c = polygon[i + 1],
      triangleArea = area(a, b, c);
    sumArea += triangleArea;
    volume += (triangleArea * (a.z + b.z + c.z)) / 3;
  }
  return { area: sumArea, volume };
}
export function calculateSurvey(body: SurveyBody) {
  levelSurvey(body.benchmark, body.elevation, body.observations);
  if (
    !['uniform', 'slope', 'custom'].includes(body.design) ||
    ![body.designLevel, body.slopeX, body.slopeY, body.allowance, body.cutSwell].every(
      Number.isFinite,
    ) ||
    body.allowance < 0 ||
    body.allowance > 200 ||
    body.cutSwell < 0 ||
    body.cutSwell > 200
  )
    throw Error('ระดับแบบและค่าเผื่อต้องเป็นค่าที่ถูกต้อง (0–200%)');
  const required = gridPoints(
      body.width,
      body.length,
      body.spacingX,
      body.spacingY,
      body.elevation,
    ),
    points = new Map(body.points.map((p) => [p.id, p]));
  if (points.size !== required.length || body.points.length !== points.size)
    throw Error('จุดกริดไม่ครบหรือซ้ำ กรุณาสร้างกริดตามขนาดแปลง');
  for (const p of required) {
    const value = points.get(p.id);
    if (
      !value ||
      Math.abs(value.x - p.x) > 1e-9 ||
      Math.abs(value.y - p.y) > 1e-9 ||
      ![value.x, value.y, value.existing, value.customDesign].every(Number.isFinite)
    )
      throw Error('ตำแหน่งหรือระดับกริดไม่ถูกต้อง');
  }
  const nx = Math.ceil(body.width / body.spacingX),
    ny = Math.ceil(body.length / body.spacingY);
  let fill = 0,
    cut = 0,
    fillArea = 0,
    cutArea = 0,
    groundVolume = 0,
    designVolume = 0;
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++) {
      const a = points.get(`G${x}-${y}`)!,
        b = points.get(`G${x + 1}-${y}`)!,
        c = points.get(`G${x + 1}-${y + 1}`)!,
        d = points.get(`G${x}-${y + 1}`)!;
      for (const triangle of [
        [a, b, c],
        [a, c, d],
      ]) {
        const depths = triangle.map((p) => ({
            x: p.x,
            y: p.y,
            z: designElevation(body, p) - p.existing,
          })),
          positive = positivePart(depths),
          negative = positivePart(depths.map((v) => ({ ...v, z: -v.z }))),
          triangleArea = area(depths[0], depths[1], depths[2]);
        fill += positive.volume;
        cut += negative.volume;
        fillArea += positive.area;
        cutArea += negative.area;
        groundVolume +=
          triangleArea * (triangle.reduce((n, p) => n + p.existing, 0) / 3 - body.elevation);
        designVolume +=
          triangleArea *
          (triangle.reduce((n, p) => n + designElevation(body, p), 0) / 3 - body.elevation);
      }
    }
  const result = {
    area: body.width * body.length,
    fillArea,
    cutArea,
    fill,
    cut,
    compacted: fill,
    looseFill: fill * (1 + body.allowance / 100),
    looseCut: cut * (1 + body.cutSwell / 100),
    groundVolumeAboveBM: groundVolume,
    designVolumeAboveBM: designVolume,
  };
  if (Object.values(result).some((value) => !Number.isFinite(value)))
    throw Error('ผลคำนวณเกินขอบเขตตัวเลข กรุณาตรวจหน่วยและระดับ');
  return result;
}
export function saveSurvey(
  data: Data,
  record: SurveyRecord,
  actor: string,
  expected?: SurveyRecord,
) {
  const before = data.workspaces?.find((r) => r.id === record.id);
  if ((before && (!expected || canonical(before) !== canonical(expected))) || (!before && expected))
    throw Error('งานสำรวจเปลี่ยนแล้ว กรุณาโหลดฉบับล่าสุด');
  if (!data.projects.some((p) => p.id === record.projectId)) throw Error('ไม่พบโครงการของงานสำรวจ');
  calculateSurvey(record.body);
  return commitWorkspace(data, record, actor, 'survey-save');
}
export function metres(value: number, unit: 'm' | 'cm' | 'mm') {
  if (!Number.isFinite(value) || !['m', 'cm', 'mm'].includes(unit)) throw Error('ค่าไม่ถูกต้อง');
  return value / (unit === 'm' ? 1 : unit === 'cm' ? 100 : 1000);
}
export function surveyTable(record: SurveyRecord): (string | number)[][] {
  return [
    ['จุด', 'X m', 'Y m', 'ระดับเดิม m', 'ระดับแบบ m', 'ถม m', 'ตัด m'],
    ...record.body.points.map((p) => {
      const design = designElevation(record.body, p),
        difference = design - p.existing;
      return [
        p.id,
        p.x,
        p.y,
        p.existing,
        design,
        Math.max(0, difference),
        Math.max(0, -difference),
      ];
    }),
  ];
}
