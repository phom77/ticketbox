import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSeatGrid, nextRowLabel, nextSectionCode } from '../src/features/performance/layoutAuthoring.ts';

const room = [
  { x: 20, y: 30 }, { x: 240, y: 30 }, { x: 200, y: 130 }, { x: 60, y: 130 },
];

test('builds a numbered seating block with a center aisle and unique rows', () => {
  const rows = generateSeatGrid(room, { rows: 3, seats: 8, firstSeat: 101, aisle: true });
  assert.equal(rows.length, 3);
  assert.equal(rows.flat().length, 24);
  for (const row of rows) {
    assert.deepEqual(row.map((seat) => seat.label), ['101', '102', '103', '104', '105', '106', '107', '108']);
    assert.ok(row.slice(0, 4).every((seat) => seat.x < 130));
    assert.ok(row.slice(4).every((seat) => seat.x > 130));
    assert.ok(row[4].x - row[3].x > row[2].x - row[1].x);
  }
  assert.ok(rows[0][0].x < rows[2][0].x);
  assert.equal(nextRowLabel([{ code: 'A' }, { code: 'C' }]), 'B');
  assert.equal(nextRowLabel(Array.from({ length: 26 }, (_, index) => ({ code: String.fromCharCode(65 + index) }))), 'AA');
});

test('does not place seats in the missing arm of a concave section', () => {
  const indent = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 35, y: 40 },
    { x: 35, y: 100 }, { x: 0, y: 100 },
  ];
  const rows = generateSeatGrid(indent, { rows: 5, seats: 6, firstSeat: 1, aisle: false });
  assert.equal(rows.flat().length, 30);
  assert.ok(rows.flat().every((seat) => seat.y < 40 || seat.x < 35));
});

test('rejects excessive quantities and allocates a unique section code automatically', () => {
  assert.throws(() => generateSeatGrid(room, { rows: 1000, seats: 1000, firstSeat: 1, aisle: false }), RangeError);
  assert.throws(() => generateSeatGrid(room, { rows: 3, seats: 1, firstSeat: 1, aisle: true }), RangeError);
  assert.equal(nextSectionCode([{ code: 'VIP' }, { code: 'VIP-2' }], 'VÍP'), 'VIP-3');
  assert.equal(nextSectionCode([], '特別席'), 'SEC');
});
