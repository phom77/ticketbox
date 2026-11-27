import type { DraftLayout } from '../../api/performanceManagement';
import type { MapSection, MapShape, Point } from '../../api/performances';
import {
  generateSeatGrid,
  maximumLayoutSeats,
  nextRowLabel,
  nextSectionCode,
} from './layoutAuthoring';

export const starterIds = ['standingAndStands', 'theatre', 'arena'] as const;
export type StarterId = (typeof starterIds)[number];

export type StarterSizes = {
  floorCapacity: number;
  rows: number;
  seatsPerRow: number;
  stands: number;
  aisle: boolean;
};

export const starterDefaults: Record<StarterId, StarterSizes> = {
  standingAndStands: { floorCapacity: 1000, rows: 10, seatsPerRow: 20, stands: 2, aisle: false },
  theatre: { floorCapacity: 0, rows: 15, seatsPerRow: 24, stands: 1, aisle: true },
  arena: { floorCapacity: 5000, rows: 20, seatsPerRow: 40, stands: 4, aisle: false },
};

export type StarterField = keyof StarterSizes;
export class StarterSizeError extends Error {
  constructor(
    readonly field: 'rows' | 'seatsPerRow' | 'floorCapacity' | 'stands' | 'seatTotal',
    readonly limit?: number,
  ) {
    super('Invalid starter size: ' + field);
  }
}

export type StarterResult = {
  layout: DraftLayout;
  seats: number;
  /** Places on the standing floor, to enter as a ticket type capacity. 0 when there is none. */
  standingCapacity: number;
};

const rect = (left: number, top: number, right: number, bottom: number): Point[] => [
  { x: left, y: top },
  { x: right, y: top },
  { x: right, y: bottom },
  { x: left, y: bottom },
];

const key = () => globalThis.crypto.randomUUID();

function integer(value: number, field: StarterSizeError['field'], min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new StarterSizeError(field, max);
}

/** Largest number of seats per row that still fits the starter's seat limit for the chosen rows and stands. */
export function maxSeatsPerRow(rows: number, stands: number) {
  return Math.min(1000, Math.floor(maximumLayoutSeats / Math.max(1, rows * stands)));
}

function seatedSection(
  existing: MapSection[],
  label: string,
  points: Point[],
  rows: number,
  seatsPerRow: number,
  aisle: boolean,
): MapSection {
  const grid = generateSeatGrid(points, { rows, seats: seatsPerRow, firstSeat: 1, aisle });
  const labels: MapSection['rows'] = [];
  for (const row of grid) {
    const code = nextRowLabel(labels);
    labels.push({
      id: key(),
      code,
      label: code,
      seats: row.map(({ segmentSuffix, ...seat }) => ({
        ...seat,
        id: key(),
        segment: code + segmentSuffix,
        accessible: false,
        blocked: false,
        restrictedView: false,
      })),
    });
  }
  return {
    id: key(),
    code: nextSectionCode(existing, label),
    label,
    kind: 'ASSIGNED',
    points,
    rows: labels,
  };
}

function standingSection(existing: MapSection[], label: string, points: Point[]): MapSection {
  return { id: key(), code: nextSectionCode(existing, label), label, kind: 'GA', points, rows: [] };
}

export function buildStarter(
  id: StarterId,
  sizes: StarterSizes,
  labels: Record<string, string>,
): StarterResult {
  const seatedRows = sizes.rows;
  const sections: MapSection[] = [];
  const stage = (points: Point[]): MapShape => ({ kind: 'STAGE', label: labels.stage, points });
  const width = 1000;
  let height = 600;
  let shapes: MapShape[];
  let standingCapacity = 0;

  if (id === 'standingAndStands') {
    integer(sizes.floorCapacity, 'floorCapacity', 1, 1_000_000);
    integer(seatedRows, 'rows', 1, 1000);
    integer(sizes.seatsPerRow, 'seatsPerRow', 1, 1000);
    if (seatedRows * sizes.seatsPerRow * 2 > maximumLayoutSeats) {
      throw new StarterSizeError('seatTotal', maximumLayoutSeats);
    }
    shapes = [stage(rect(300, 20, 700, 80))];
    sections.push(standingSection(sections, labels.floor, rect(250, 110, 750, 560)));
    sections.push(
      seatedSection(
        sections,
        labels.leftStand,
        rect(30, 110, 220, 560),
        seatedRows,
        sizes.seatsPerRow,
        false,
      ),
    );
    sections.push(
      seatedSection(
        sections,
        labels.rightStand,
        rect(780, 110, 970, 560),
        seatedRows,
        sizes.seatsPerRow,
        false,
      ),
    );
    standingCapacity = sizes.floorCapacity;
  } else if (id === 'theatre') {
    integer(seatedRows, 'rows', 1, 1000);
    integer(sizes.seatsPerRow, 'seatsPerRow', sizes.aisle ? 2 : 1, 1000);
    if (seatedRows * sizes.seatsPerRow > maximumLayoutSeats) {
      throw new StarterSizeError('seatTotal', maximumLayoutSeats);
    }
    shapes = [stage(rect(250, 20, 750, 80))];
    sections.push(
      seatedSection(
        sections,
        labels.stalls,
        rect(100, 110, 900, 570),
        seatedRows,
        sizes.seatsPerRow,
        sizes.aisle,
      ),
    );
  } else {
    integer(sizes.floorCapacity, 'floorCapacity', 1, 1_000_000);
    integer(sizes.stands, 'stands', 1, 4);
    integer(seatedRows, 'rows', 1, 1000);
    integer(sizes.seatsPerRow, 'seatsPerRow', 1, 1000);
    if (seatedRows * sizes.seatsPerRow * sizes.stands > maximumLayoutSeats) {
      throw new StarterSizeError('seatTotal', maximumLayoutSeats);
    }
    height = 700;
    shapes = [stage(rect(400, 15, 600, 55))];
    sections.push(standingSection(sections, labels.floor, rect(260, 220, 740, 480)));
    const stands = [
      [labels.northStand, rect(260, 70, 740, 200)],
      [labels.southStand, rect(260, 500, 740, 630)],
      [labels.westStand, rect(40, 70, 240, 630)],
      [labels.eastStand, rect(760, 70, 960, 630)],
    ] as const;
    for (const [label, points] of stands.slice(0, sizes.stands)) {
      sections.push(
        seatedSection(sections, label, [...points], seatedRows, sizes.seatsPerRow, false),
      );
    }
    standingCapacity = sizes.floorCapacity;
  }
  const seats = sections.reduce(
    (total, section) => total + section.rows.reduce((sum, row) => sum + row.seats.length, 0),
    0,
  );
  return { layout: { width, height, shapes, sections }, seats, standingCapacity };
}
