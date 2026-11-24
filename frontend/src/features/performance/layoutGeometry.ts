import type { DraftLayout } from '../../api/performanceManagement';
import type { Point } from '../../api/performances';

export type MapCanvasSelection =
  | { kind: 'section'; id: string }
  | { kind: 'shape'; index: number }
  | { kind: 'seat'; id: string; sectionId: string }
  | null;
type Selected = NonNullable<MapCanvasSelection>;
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const tolerance = 1e-7;
const clamp = (value: number, lower: number, upper: number) =>
  Math.min(upper, Math.max(lower, value));
const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const next = (points: Point[], index: number) => points[(index + 1) % points.length];

export function rectanglePoints(first: Point, last: Point): Point[] {
  const x = Math.min(first.x, last.x);
  const y = Math.min(first.y, last.y);
  const right = Math.max(first.x, last.x);
  const bottom = Math.max(first.y, last.y);
  return [
    { x, y },
    { x: right, y },
    { x: right, y: bottom },
    { x, y: bottom },
  ];
}

export function polygonBounds(points: Point[]): Bounds {
  return points.reduce(
    (bounds, { x, y }) => ({
      minX: Math.min(bounds.minX, x),
      minY: Math.min(bounds.minY, y),
      maxX: Math.max(bounds.maxX, x),
      maxY: Math.max(bounds.maxY, y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function onSegment(point: Point, a: Point, b: Point) {
  return (
    Math.abs(cross(a, b, point)) <= tolerance * Math.hypot(b.x - a.x, b.y - a.y) &&
    point.x >= Math.min(a.x, b.x) - tolerance &&
    point.x <= Math.max(a.x, b.x) + tolerance &&
    point.y >= Math.min(a.y, b.y) - tolerance &&
    point.y <= Math.max(a.y, b.y) + tolerance
  );
}

export function pointInMapPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (const [index, a] of polygon.entries()) {
    const b = next(polygon, index);
    if (onSegment(point, a, b)) return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y)
    )
      inside = !inside;
  }
  return inside;
}

function properIntersection(a: Point, b: Point, c: Point, d: Point) {
  const first = cross(a, b, c);
  const second = cross(a, b, d);
  const third = cross(c, d, a);
  const fourth = cross(c, d, b);
  return (
    ((first > 0 && second < 0) || (first < 0 && second > 0)) &&
    ((third > 0 && fourth < 0) || (third < 0 && fourth > 0))
  );
}

export function isSimpleMapPolygon(points: Point[]) {
  if (points.length < 3 || points.length > 128) return false;
  let area = 0;
  for (const [index, a] of points.entries()) {
    const b = next(points, index);
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || (a.x === b.x && a.y === b.y))
      return false;
    area += cross(points[0], a, b);
    for (let other = index + 2; other < points.length - (index === 0 ? 1 : 0); other++) {
      const c = points[other];
      const d = next(points, other);
      if (
        properIntersection(a, b, c, d) ||
        onSegment(a, c, d) ||
        onSegment(b, c, d) ||
        onSegment(c, a, b) ||
        onSegment(d, a, b)
      )
        return false;
    }
  }
  return Math.abs(area) > tolerance;
}

function intersectionsAt(points: Point[], y: number) {
  return points
    .flatMap((a, index) => {
      const b = next(points, index);
      if (a.y > y === b.y > y) return [];
      return [a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)];
    })
    .sort((a, b) => a - b);
}

export function mapPolygonsOverlap(first: Point[], second: Point[]) {
  const a = polygonBounds(first);
  const b = polygonBounds(second);
  if (a.minX >= b.maxX || b.minX >= a.maxX || a.minY >= b.maxY || b.minY >= a.maxY) return false;
  for (const [outer, start] of first.entries()) {
    const end = next(first, outer);
    if (second.some((other, inner) => properIntersection(start, end, other, next(second, inner))))
      return true;
  }

  // Between vertex heights, noncrossing edges keep the same left-to-right order.
  const heights = [...new Set([...first, ...second].map(({ y }) => y))].sort(
    (left, right) => left - right,
  );
  for (let index = 1; index < heights.length; index++) {
    const y = (heights[index - 1] + heights[index]) / 2;
    const left = intersectionsAt(first, y);
    const right = intersectionsAt(second, y);
    for (let i = 0; i < left.length; i += 2) {
      for (let j = 0; j < right.length; j += 2) {
        if (Math.min(left[i + 1], right[j + 1]) - Math.max(left[i], right[j]) > tolerance)
          return true;
      }
    }
  }
  return false;
}

function selectionPoints(layout: DraftLayout, selection: Selected): Point[] {
  if (selection.kind === 'shape') return layout.shapes[selection.index]?.points ?? [];
  const targetId = selection.kind === 'section' ? selection.id : selection.sectionId;
  return layout.sections.find(({ id }) => id === targetId)?.points ?? [];
}

export function clampMapMove(layout: DraftLayout, selection: Selected, delta: Point): Point {
  if (selection.kind === 'seat') return delta;
  const points = selectionPoints(layout, selection);
  if (!points.length) return { x: 0, y: 0 };
  const { minX, minY, maxX, maxY } = polygonBounds(points);
  return {
    x: clamp(delta.x, -minX, layout.width - maxX),
    y: clamp(delta.y, -minY, layout.height - maxY),
  };
}

export function moveMapSelection(layout: DraftLayout, selection: Selected, delta: Point) {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return layout;
  const { x, y } = clampMapMove(layout, selection, delta);
  if (!x && !y) return layout;
  if (selection.kind === 'seat') {
    const section = layout.sections.find(({ id }) => id === selection.sectionId);
    const row = section?.rows.find(({ seats }) => seats.some(({ id }) => id === selection.id));
    const seat = row?.seats.find(({ id }) => id === selection.id);
    if (!section || !row || !seat) return layout;
    const moved = { ...seat, x: seat.x + x, y: seat.y + y };
    if (!pointInMapPolygon(moved, section.points)) return layout;
    return {
      ...layout,
      sections: layout.sections.map((item) =>
        item !== section
          ? item
          : {
              ...section,
              rows: section.rows.map((entry) =>
                entry !== row
                  ? entry
                  : {
                      ...row,
                      seats: row.seats.map((candidate) => (candidate === seat ? moved : candidate)),
                    },
              ),
            },
      ),
    };
  }

  return transformSelection(layout, selection, (point) => ({ x: point.x + x, y: point.y + y }));
}

export function mapResizeScale(layout: DraftLayout, selection: Selected, corner: Point) {
  if (selection.kind === 'seat') return null;
  const points = selectionPoints(layout, selection);
  if (!points.length) return null;
  const { minX, minY, maxX, maxY } = polygonBounds(points);
  const minWidth = Math.min(maxX - minX, layout.width / 100);
  const minHeight = Math.min(maxY - minY, layout.height / 100);
  const scaleX = (clamp(corner.x, minX + minWidth, layout.width) - minX) / (maxX - minX);
  const scaleY = (clamp(corner.y, minY + minHeight, layout.height) - minY) / (maxY - minY);
  if (!(scaleX > 0) || !(scaleY > 0)) return null;
  return { minX, minY, scaleX, scaleY };
}

export function resizeMapSelection(layout: DraftLayout, selection: Selected, corner: Point) {
  const scale = mapResizeScale(layout, selection, corner);
  if (!scale || selection.kind === 'seat' || (scale.scaleX === 1 && scale.scaleY === 1))
    return layout;
  const { minX, minY, scaleX, scaleY } = scale;
  return transformSelection(layout, selection, (point) => ({
    x: minX + (point.x - minX) * scaleX,
    y: minY + (point.y - minY) * scaleY,
  }));
}

function transformSelection(
  layout: DraftLayout,
  selection: Exclude<Selected, { kind: 'seat' }>,
  transform: (point: Point) => Point,
) {
  if (selection.kind === 'shape') {
    if (!layout.shapes[selection.index]) return layout;
    return {
      ...layout,
      shapes: layout.shapes.map((shape, index) =>
        index === selection.index ? { ...shape, points: shape.points.map(transform) } : shape,
      ),
    };
  }
  const section = layout.sections.find(({ id }) => id === selection.id);
  if (!section) return layout;
  const points = section.points.map(transform);
  if (
    layout.sections.some((entry) => entry !== section && mapPolygonsOverlap(points, entry.points))
  )
    return layout;
  return {
    ...layout,
    sections: layout.sections.map((entry) =>
      entry !== section
        ? entry
        : {
            ...section,
            points,
            rows: section.rows.map((row) => ({
              ...row,
              seats: row.seats.map((seat) => ({ ...seat, ...transform(seat) })),
            })),
          },
    ),
  };
}
