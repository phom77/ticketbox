import type { Point } from '../../api/performances';

export const maximumLayoutSeats = 100_000;

export function nextSectionCode(sections: { code: string }[], label: string) {
  const base = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/Đ/g, 'D').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 75) || 'SEC';
  const used = new Set(sections.map(({ code }) => code));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

export function nextRowLabel(rows: { code: string }[]) {
  const used = new Set(rows.map(({ code }) => code));
  let index = 0;
  while (used.has(alphaLabel(index))) index++;
  return alphaLabel(index);
}

function alphaLabel(index: number) {
  let name = '';
  for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) {
    name = String.fromCharCode(65 + (number - 1) % 26) + name;
  }
  return name;
}

type GridSettings = { rows: number; seats: number; firstSeat: number; aisle: boolean };

export function generateSeatGrid(outline: Point[], { rows, seats, firstSeat, aisle }: GridSettings) {
  if (!Number.isInteger(rows) || rows < 1 || rows > 1000 || !Number.isInteger(seats) || seats < 1 || seats > 1000
    || rows * seats > maximumLayoutSeats || !Number.isSafeInteger(firstSeat + seats - 1) || firstSeat < 1
    || !Number.isInteger(firstSeat) || (aisle && seats < 2) || outline.length < 3) {
    throw new RangeError('Invalid seating grid');
  }
  const minY = Math.min(...outline.map(({ y }) => y));
  const maxY = Math.max(...outline.map(({ y }) => y));
  if (!(maxY > minY)) throw new RangeError('Invalid seating section');

  return Array.from({ length: rows }, (_, row) => {
    const y = minY + (maxY - minY) * (row + 1) / (rows + 1);
    const intersections: number[] = [];
    for (const [index, start] of outline.entries()) {
      const end = outline[(index + 1) % outline.length];
      if ((start.y > y) === (end.y > y)) continue;
      intersections.push(start.x + (end.x - start.x) * (y - start.y) / (end.y - start.y));
    }
    intersections.sort((a, b) => a - b);
    let left = 0;
    let width = 0;
    // Use a single continuous span so seats never bridge a void in a concave section.
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const span = intersections[i + 1] - intersections[i];
      if (span > width) {
        left = intersections[i];
        width = span;
      }
    }
    if (!Number.isFinite(width) || width <= 0) throw new RangeError('No seating span at row');
    const middle = Math.ceil(seats / 2);
    const aisleUnits = aisle ? 1.5 : 0;
    const spacing = width / (seats + 1 + aisleUnits);
    return Array.from({ length: seats }, (_, seat) => {
      const rightOfAisle = aisle && seat >= middle;
      return {
        x: left + spacing * (seat + 1 + (rightOfAisle ? aisleUnits : 0)),
        y,
        label: String(firstSeat + seat),
        segmentSuffix: aisle ? (rightOfAisle ? '-R' : '-L') : '',
        position: rightOfAisle ? seat - middle + 1 : seat + 1,
      };
    });
  });
}
