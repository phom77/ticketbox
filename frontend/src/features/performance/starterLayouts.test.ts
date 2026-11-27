import { describe, expect, it } from 'vitest';
import { maximumLayoutSeats } from './layoutAuthoring';
import { buildStarter, StarterSizeError, starterDefaults } from './starterLayouts';

const labels = {
  stage: 'Stage',
  floor: 'Floor',
  stalls: 'Stalls',
  leftStand: 'Left stand',
  rightStand: 'Right stand',
  northStand: 'North stand',
  southStand: 'South stand',
  westStand: 'West stand',
  eastStand: 'East stand',
};

describe('starter layouts', () => {
  it('builds a standing floor with two seated stands', () => {
    const { layout, seats, standingCapacity } = buildStarter(
      'standingAndStands',
      starterDefaults.standingAndStands,
      labels,
    );
    expect(layout.sections.map((section) => section.kind)).toEqual(['GA', 'ASSIGNED', 'ASSIGNED']);
    expect(layout.shapes.map((shape) => shape.kind)).toEqual(['STAGE']);
    expect(seats).toBe(2 * 10 * 20);
    expect(standingCapacity).toBe(1000);
  });

  it('builds a numbered theatre with lettered rows and an aisle split', () => {
    const { layout, seats } = buildStarter('theatre', starterDefaults.theatre, labels);
    const [stalls] = layout.sections;
    expect(seats).toBe(360);
    expect(stalls.rows.map((row) => row.code).join('')).toBe('ABCDEFGHIJKLMNO');
    const first = stalls.rows[0].seats;
    expect(first[0].label).toBe('1');
    expect(first[23].label).toBe('24');
    expect(new Set(first.map((seat) => seat.segment))).toEqual(new Set(['A-L', 'A-R']));
    expect(first.filter((seat) => seat.segment === 'A-L')).toHaveLength(12);
  });

  it('has no aisle split when the aisle is off', () => {
    const { layout } = buildStarter(
      'theatre',
      { ...starterDefaults.theatre, aisle: false },
      labels,
    );
    expect(new Set(layout.sections[0].rows[0].seats.map((seat) => seat.segment))).toEqual(
      new Set(['A']),
    );
  });

  it('builds an arena with four stands around a floor', () => {
    const { layout, seats, standingCapacity } = buildStarter(
      'arena',
      starterDefaults.arena,
      labels,
    );
    expect(layout.sections).toHaveLength(5);
    expect(layout.sections.filter((section) => section.kind === 'ASSIGNED')).toHaveLength(4);
    expect(seats).toBe(4 * 20 * 40);
    expect(standingCapacity).toBe(5000);
    expect(new Set(layout.sections.map((section) => section.code)).size).toBe(5);
  });

  it('refuses sizes above the seat limit and names the size', () => {
    const tooBig = { ...starterDefaults.arena, rows: 1000, seatsPerRow: 1000 };
    expect(() => buildStarter('arena', tooBig, labels)).toThrow(StarterSizeError);
    try {
      buildStarter('arena', { ...starterDefaults.arena, rows: 100, seatsPerRow: 300 }, labels);
    } catch (failure) {
      expect(failure).toMatchObject({ field: 'seatTotal', limit: maximumLayoutSeats });
    }
    expect(() => buildStarter('theatre', { ...starterDefaults.theatre, rows: 0 }, labels)).toThrow(
      expect.objectContaining({ field: 'rows' }),
    );
  });
});
