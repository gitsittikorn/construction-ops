import { surveyContours } from '../surveyContours';
import { gridPoints } from '../surveying';
import type { SurveyBody } from '../workspaceModels';
function body(width = 10): SurveyBody {
  return {
    benchmark: 'BM',
    elevation: 0,
    datum: 'test',
    notes: '',
    observations: [],
    width,
    length: width,
    spacingX: 1,
    spacingY: 1,
    design: 'uniform',
    designLevel: 1,
    slopeX: 0,
    slopeY: 0,
    allowance: 30,
    cutSwell: 0,
    points: gridPoints(width, width, 1, 1, 0),
  };
}
it('interpolates a linear X slope at the correct coordinates and retains the input measurements', () => {
  const value = body();
  value.points = value.points.map((point) => ({ ...point, existing: point.x }));
  const before = structuredClone(value);
  const lines = surveyContours(value);
  expect(lines.length).toBeGreaterThan(0);
  expect(new Set(lines.map((line) => line.level)).size).toBe(7);
  for (const line of lines) {
    expect(line.x1).toBeCloseTo(line.level);
    expect(line.x2).toBeCloseTo(line.level);
    expect(line.y1).toBeGreaterThanOrEqual(0);
    expect(line.y2).toBeLessThanOrEqual(10);
  }
  expect(value).toEqual(before);
});
it('does not fabricate contours on a flat plane and bounds rendering for large grids', () => {
  expect(surveyContours(body())).toEqual([]);
  const large = body(20);
  large.points = large.points.map((point) => ({ ...point, existing: point.x }));
  expect(surveyContours(large)).toEqual([]);
  expect(() => surveyContours({ ...body(), points: [] })).toThrow('จุดกริด');
});
