import assert from 'node:assert/strict';
import { assignSeatsToGroup, mapSeatRadius, readSeatCsv, seatsAlongRow } from '../../frontend/src/features/performance/layoutTools.ts';

const straight = seatsAlongRow({ x: 5, y: 10 }, { x: 50, y: 50 }, 3, 0);
assert.deepEqual(straight, [{ x: 5, y: 10 }, { x: 27.5, y: 30 }, { x: 50, y: 50 }]);
const curved = seatsAlongRow({ x: 5, y: 10 }, { x: 55, y: 10 }, 3, 20);
assert.deepEqual(curved, [{ x: 5, y: 10 }, { x: 30, y: 20 }, { x: 55, y: 10 }]);
assert.deepEqual(readSeatCsv('section,row,seat,x,y\r\n"BAL,A",A,1,5,11\r\nBAL,"B""2",2,20,30'), [
  { section: 'BAL,A', row: 'A', seat: '1', x: 5, y: 11 },
  { section: 'BAL', row: 'B"2', seat: '2', x: 20, y: 30 },
]);
assert.throws(() => readSeatCsv('section,row,seat,x,y\nBAL,A,1,,8'), { message: '2' });
assert.throws(() => readSeatCsv('section,row,seat,x,y\nBAL,A,1,7,8\nBAL,A,1,9,8'), { message: '3' });
assert.throws(() => readSeatCsv('section,row,seat,x,y\nBAL,"A,1,7,8'), { message: '2' });
console.log('Seat generation and atomic CSV parsing passed.');

const seatOne = { id: 'one', rowLabel: 'A', seatLabel: '1', blocked: false };
const seatTwo = { id: 'two', rowLabel: 'A', seatLabel: '2', blocked: false };
const blocked = { id: 'three', rowLabel: 'A', seatLabel: '3', blocked: true };
const groups = [
  { id: 'standard', sectionId: 'room', kind: 'ASSIGNED', capacity: 2, seats: [seatOne, seatTwo] },
  { id: 'vip', sectionId: 'room', kind: 'ASSIGNED', capacity: 0, seats: [] },
  { id: 'unrelated', sectionId: 'another-room', kind: 'ASSIGNED', capacity: 1, seats: [{ ...seatOne, id: 'elsewhere' }] },
];
const repriced = assignSeatsToGroup(groups, 'room', [seatOne, blocked], 'vip');
assert.deepEqual(repriced.map(group => [group.capacity, group.seats.map(seat => seat.id)]), [
  [1, ['two']], [1, ['one']], [1, ['elsewhere']],
]);
assert.equal(repriced[2], groups[2]);
assert.deepEqual(assignSeatsToGroup(repriced, 'room', [seatOne], null)[1].seats, []);
assert.deepEqual(assignSeatsToGroup(groups, 'room', [seatOne], 'unrelated'), groups);
console.log('Individual seat reassignment preserves independent groups and excludes blocked seats.');

const sparseRange = { x: 0, y: 0, width: 440, height: 130 };
assert.ok(mapSeatRadius([{ seats: [{ x: 140, y: 40 }, { x: 300, y: 40 }] }], sparseRange) >= 10);
assert.ok(mapSeatRadius([{ seats: [{ x: 140, y: 40 }, { x: 145, y: 40 }] }], sparseRange) < 2.5);
