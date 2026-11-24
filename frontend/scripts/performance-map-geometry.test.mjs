import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  isSimpleMapPolygon,
  mapPolygonsOverlap,
  moveMapSelection,
  pointInMapPolygon,
  rectanglePoints,
  resizeMapSelection,
} from '../src/features/performance/layoutGeometry.ts';

const points = (x, y, width, height) => rectanglePoints({ x, y }, { x: x + width, y: y + height });
const seat = { id: 'seat', x: 20, y: 20, label: '1', segment: 'A', position: 1, blocked: false };
const section = { id: 'left', label: 'Left', points: null, rows: [{ id: 'row', seats: [seat] }] };
const layoutWith = (sections) => ({
  width: 100,
  height: 90,
  shapes: [],
  sections: sections.map(([id, x, y, width, height]) => ({
    ...section,
    id,
    points: points(x, y, width, height),
    rows: id === 'left' ? section.rows : [],
  })),
});
const selectSection = { kind: 'section', id: 'left' };

test('draws the same rectangle in either direction and rejects empty and crossing outlines', () => {
  assert.deepEqual(rectanglePoints({ x: 40, y: 50 }, { x: 10, y: 20 }), points(10, 20, 30, 30));
  assert.equal(isSimpleMapPolygon(points(10, 20, 30, 30)), true);
  assert.equal(isSimpleMapPolygon(points(10, 20, 0, 30)), false);
  assert.equal(
    isSimpleMapPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ]),
    false,
  );
});

test('finds area overlap with aligned edges and shared outlines but allows touching sections', () => {
  assert.equal(mapPolygonsOverlap(points(0, 0, 20, 10), points(12, 0, 10, 10)), true);
  assert.equal(mapPolygonsOverlap(points(0, 0, 20, 10), points(0, 0, 20, 10).reverse()), true);
  assert.equal(mapPolygonsOverlap(points(0, 0, 20, 10), points(20, 0, 10, 10)), false);
  assert.equal(mapPolygonsOverlap(points(0, 0, 20, 10), points(0, 10, 20, 10)), false);
});

test('moving a section clamps to the map and carries its booked seat identifiers forward', () => {
  const layout = layoutWith([['left', 10, 10, 30, 25]]);
  const moved = moveMapSelection(layout, selectSection, { x: 100, y: -25 });
  assert.deepEqual(moved.sections[0].points, points(70, 0, 30, 25));
  assert.deepEqual(moved.sections[0].rows[0].seats[0], { ...seat, x: 80, y: 10 });
  assert.deepEqual(layout.sections[0].rows[0].seats, [seat]);
});

test('moving a seat outside an irregular section leaves the draft untouched', () => {
  const layout = layoutWith([['left', 10, 10, 30, 25]]);
  const outline = [
    { x: 10, y: 10 },
    { x: 40, y: 10 },
    { x: 10, y: 40 },
  ];
  layout.sections[0].points = outline;
  assert.equal(pointInMapPolygon({ x: 30, y: 20 }, outline), true);
  assert.equal(pointInMapPolygon({ x: 30, y: 21 }, outline), false);
  assert.equal(
    moveMapSelection(layout, { kind: 'seat', id: 'seat', sectionId: 'left' }, { x: 10, y: 1 }),
    layout,
  );
});

test('resize scales seat coordinates with the section and rejects unrelated section overlap', () => {
  const layout = layoutWith([
    ['left', 10, 10, 30, 30],
    ['right', 60, 10, 30, 30],
  ]);
  const resized = resizeMapSelection(layout, selectSection, { x: 55, y: 70 });
  assert.deepEqual(resized.sections[0].points, points(10, 10, 45, 60));
  assert.deepEqual(resized.sections[0].rows[0].seats[0], { ...seat, x: 25, y: 30 });
  assert.equal(resizeMapSelection(layout, selectSection, { x: 70, y: 70 }), layout);
  assert.equal(moveMapSelection(layout, selectSection, { x: 40, y: 0 }), layout);
});
