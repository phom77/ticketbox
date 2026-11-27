import { describe, expect, it } from 'vitest';
import { layoutSvgSample, seatCsvSample } from './layoutSamples';
import { readLayoutSvg } from './layoutSvgImport';
import { readSeatCsv, SeatCsvError } from './layoutTools';

describe('layout samples', () => {
  it('imports the sample CSV unchanged', () => {
    const seats = readSeatCsv(seatCsvSample());
    expect(seats).toHaveLength(24);
    expect(new Set(seats.map((seat) => seat.section))).toEqual(new Set(['STALLS', 'BALCONY']));
    expect(seats.some((seat) => seat.row === 'A, front')).toBe(true);
  });

  it('imports the sample SVG unchanged with its seat flags', () => {
    const layout = readLayoutSvg(layoutSvgSample());
    expect(layout.width).toBe(1000);
    expect(layout.height).toBe(600);
    expect(layout.shapes.map((shape) => shape.kind)).toEqual(['STAGE']);
    expect(layout.sections.map((section) => [section.code, section.kind])).toEqual([
      ['FLOOR', 'GA'],
      ['STALLS', 'ASSIGNED'],
    ]);
    const seats = layout.sections[1].rows.flatMap((row) => row.seats);
    expect(seats.some((seat) => seat.accessible)).toBe(true);
    expect(seats.some((seat) => seat.restrictedView)).toBe(true);
    expect(seats.some((seat) => seat.blocked)).toBe(true);
  });

  it('names the line and the column of a bad CSV value', () => {
    const lines = seatCsvSample().trimEnd().split('\n');
    lines[13] = lines[13].replace(/,[^,]*,[^,]*$/, ',abc,300');
    expect.assertions(3);
    try {
      readSeatCsv(lines.join('\n'));
    } catch (failure) {
      expect(failure).toBeInstanceOf(SeatCsvError);
      expect((failure as SeatCsvError).line).toBe(14);
      expect((failure as SeatCsvError).column).toBe('x');
    }
  });

  it('reports a missing header at line 1 and a short line without a column', () => {
    expect(() => readSeatCsv('a,b\n')).toThrow(expect.objectContaining({ line: 1 }));
    expect(() => readSeatCsv('section,row,seat,x,y\nA,B,1\n')).toThrow(
      expect.objectContaining({ line: 2, column: undefined }),
    );
  });
});
