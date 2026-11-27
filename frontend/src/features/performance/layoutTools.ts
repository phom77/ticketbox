import type { SaleGroup } from '../../api/performanceManagement';
import type { Point } from '../../api/performances';

export function assignSeatsToGroup(
  groups: SaleGroup[],
  sectionId: string,
  seats: SaleGroup['seats'],
  targetId: string | null,
) {
  const inSection = (group: SaleGroup) =>
    group.kind === 'ASSIGNED' && group.sectionId === sectionId;
  if (targetId && !groups.some((group) => inSection(group) && group.id === targetId)) return groups;
  const assignable = new Map(seats.filter((seat) => !seat.blocked).map((seat) => [seat.id, seat]));

  return groups.map((group) => {
    if (!inSection(group)) return group;
    const nextSeats = group.seats.filter((seat) => !assignable.has(seat.id));
    if (group.id === targetId) nextSeats.push(...assignable.values());
    return {
      ...group,
      seats: nextSeats,
      capacity: nextSeats.filter((seat) => !seat.blocked).length,
    };
  });
}

export function mapBounds(vertices: Point[]) {
  const x = Math.min(...vertices.map((point) => point.x));
  const y = Math.min(...vertices.map((point) => point.y));
  const width = Math.max(...vertices.map((point) => point.x)) - x;
  const height = Math.max(...vertices.map((point) => point.y)) - y;
  return { x, y, width, height };
}

export function sectionViewBox({ x, y, width, height }: ReturnType<typeof mapBounds>) {
  const padding = Math.max(1, Math.max(width, height) / 30);
  return `${x - padding} ${y - padding} ${width + padding * 2} ${height + padding * 2}`;
}

export function mapSeatRadius(
  rows: { seats: Point[] }[],
  { width, height }: ReturnType<typeof mapBounds>,
) {
  let radius = Math.min(Math.max(width, height) / 40, (height / (rows.length + 1)) * 0.42);
  for (const { seats } of rows) {
    for (let index = 1; index < seats.length; index++) {
      const distance = Math.hypot(
        seats[index].x - seats[index - 1].x,
        seats[index].y - seats[index - 1].y,
      );
      if (distance > 0) radius = Math.min(radius, distance * 0.36);
    }
  }
  return radius;
}

export function seatsAlongRow(first: Point, last: Point, count: number, curve: number): Point[] {
  if (!Number.isInteger(count) || count < 1 || count > 1000 || !Number.isFinite(curve)) {
    throw new RangeError('Invalid row dimensions');
  }
  const length = Math.hypot(last.x - first.x, last.y - first.y);
  if (!Number.isFinite(length) || length === 0) throw new RangeError('Invalid row dimensions');
  const midpoint = {
    x: (first.x + last.x) / 2 - (curve * (last.y - first.y)) / length,
    y: (first.y + last.y) / 2 + (curve * (last.x - first.x)) / length,
  };
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const start = (1 - t) ** 2;
    const middle = 2 * t * (1 - t);
    return {
      x: start * first.x + middle * midpoint.x + t ** 2 * last.x,
      y: start * first.y + middle * midpoint.y + t ** 2 * last.y,
    };
  });
}

type SeatCsvEntry = Point & { section: string; row: string; seat: string };

export const seatCsvColumns = ['section', 'row', 'seat', 'x', 'y'] as const;
export type SeatCsvColumn = (typeof seatCsvColumns)[number];

/** A CSV problem at a 1-based line, and at a column when one value is at fault. */
export type SeatCsvReason =
  | 'format'
  | 'empty'
  | 'number'
  | 'duplicate'
  | 'section'
  | 'outside'
  | 'limit';

export class SeatCsvError extends Error {
  constructor(
    readonly line: number,
    readonly column?: SeatCsvColumn,
    readonly reason: SeatCsvReason = 'format',
  ) {
    super(String(line));
  }
}

export function readSeatCsv(text: string): SeatCsvEntry[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines.shift()?.trim().toLowerCase();
  if (header !== seatCsvColumns.join(',')) throw new SeatCsvError(1);
  const seats: SeatCsvEntry[] = [];
  const labels = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let cursor = 0;
    while (cursor < line.length) {
      const field = /(?:"((?:[^"]|"")*)"|([^,"]*))(,|$)/y;
      field.lastIndex = cursor;
      const match = field.exec(line);
      if (!match) throw new SeatCsvError(index + 2);
      fields.push((match[1]?.replace(/""/g, '"') ?? match[2]).trim());
      if (field.lastIndex === cursor) break;
      cursor = field.lastIndex;
      if (cursor === line.length && match[3] === ',') fields.push('');
    }
    const [section, row, seat, x, y] = fields;
    const key = JSON.stringify([section, row, seat]);
    const lineNumber = index + 2;
    if (fields.length !== 5) throw new SeatCsvError(lineNumber);
    const empty = fields.findIndex((entry) => !entry);
    if (empty >= 0) throw new SeatCsvError(lineNumber, seatCsvColumns[empty], 'empty');
    if (!Number.isFinite(Number(x))) throw new SeatCsvError(lineNumber, 'x', 'number');
    if (!Number.isFinite(Number(y))) throw new SeatCsvError(lineNumber, 'y', 'number');
    if (labels.has(key)) throw new SeatCsvError(lineNumber, 'seat', 'duplicate');
    labels.add(key);
    seats.push({ section, row, seat, x: Number(x), y: Number(y) });
  }
  return seats;
}
