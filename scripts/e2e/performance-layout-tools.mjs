import assert from 'node:assert/strict';
import { readSeatCsv, seatsAlongRow } from '../../frontend/src/features/performance/layoutTools.ts';

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
