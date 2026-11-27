import { describe, expect, it } from 'vitest';
import { SeatCsvError, seatCsvProblemKey } from './layoutTools';

describe('seatCsvProblemKey', () => {
  it('reports a limit on line 1 as a limit, not a header problem', () => {
    expect(seatCsvProblemKey(new SeatCsvError(1, undefined, 'limit'))).toBe(
      'performance-layout:csvProblem_limit',
    );
    expect(seatCsvProblemKey(new SeatCsvError(7, 'row', 'limit'))).toBe(
      'performance-layout:csvProblem_limit',
    );
  });

  it('keeps the header, format and column problems', () => {
    expect(seatCsvProblemKey(new SeatCsvError(1))).toBe('performance-layout:csvProblem_header');
    expect(seatCsvProblemKey(new SeatCsvError(4))).toBe('performance-layout:csvProblem_format');
    expect(seatCsvProblemKey(new SeatCsvError(4, 'x', 'number'))).toBe(
      'performance-layout:csvProblem_number',
    );
  });
});
