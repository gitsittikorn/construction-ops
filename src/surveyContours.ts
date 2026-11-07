import type { SurveyBody } from './workspaceModels';
import { calculateSurvey } from './surveying';

// Visualization uses the same SW–NE piecewise-linear triangles as volume integration.
export function surveyContours(body: SurveyBody) {
  calculateSurvey(body);
  if (body.points.length > 400) return [];
  const values = body.points.map((point) => point.existing);
  const low = Math.min(...values),
    high = Math.max(...values);
  if (low === high) return [];
  const levels = Array.from({ length: 7 }, (_, index) => low + ((index + 1) * (high - low)) / 8);
  const points = new Map(body.points.map((point) => [point.id, point]));
  const segments: { level: number; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let y = 0; y < Math.ceil(body.length / body.spacingY); y++)
    for (let x = 0; x < Math.ceil(body.width / body.spacingX); x++) {
      const a = points.get(`G${x}-${y}`)!,
        b = points.get(`G${x + 1}-${y}`)!,
        c = points.get(`G${x + 1}-${y + 1}`)!,
        d = points.get(`G${x}-${y + 1}`)!;
      for (const triangle of [
        [a, b, c],
        [a, c, d],
      ])
        for (const level of levels) {
          const crossings: { x: number; y: number }[] = [];
          for (let index = 0; index < 3; index++) {
            const start = triangle[index],
              end = triangle[(index + 1) % 3];
            if (
              (start.existing < level && end.existing >= level) ||
              (end.existing < level && start.existing >= level)
            ) {
              const fraction = (level - start.existing) / (end.existing - start.existing);
              const point = {
                x: start.x + fraction * (end.x - start.x),
                y: start.y + fraction * (end.y - start.y),
              };
              if (
                !crossings.some(
                  (other) =>
                    Math.abs(other.x - point.x) < 1e-9 && Math.abs(other.y - point.y) < 1e-9,
                )
              )
                crossings.push(point);
            }
          }
          if (crossings.length === 2)
            segments.push({
              level,
              x1: crossings[0].x,
              y1: crossings[0].y,
              x2: crossings[1].x,
              y2: crossings[1].y,
            });
        }
    }
  return segments;
}
