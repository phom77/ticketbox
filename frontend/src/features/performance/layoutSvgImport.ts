import type { DraftLayout } from '../../api/performanceManagement';
import type { MapSection, MapShape, Point } from '../../api/performances';

const svgNamespace = 'http://www.w3.org/2000/svg';
export const maxLayoutSvgBytes = 20 * 1024 * 1024;
const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function readLayoutSvg(source: string): DraftLayout {
  if (source.length > maxLayoutSvgBytes || /<!DOCTYPE|<\?xml-stylesheet/i.test(source))
    throw invalidSvg();
  // Source nodes stay in the detached XML document. Only plain layout data leaves this parser.
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = document.documentElement;
  if (
    svg.localName !== 'svg' ||
    svg.namespaceURI !== svgNamespace ||
    document.querySelector('parsererror')
  )
    throw invalidSvg();
  checkTransform(svg);

  const dimensions = numbers(svg.getAttribute('viewBox'));
  if (dimensions.length !== 4) throw invalidSvg();
  const [originX, originY, width, height] = dimensions;
  if (width <= 0 || height <= 0 || width > 1_000_000 || height > 1_000_000) throw invalidSvg();

  function point(rawX: number, rawY: number): Point {
    const x = rawX - originX;
    const y = rawY - originY;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > width || y > height)
      throw invalidSvg();
    return { x, y };
  }

  function polygon(element: Element): Point[] {
    checkTransform(element);
    const coordinates = numbers(element.getAttribute('points'));
    if (coordinates.length < 6 || coordinates.length > 256 || coordinates.length % 2 !== 0)
      throw invalidSvg();
    const points: Point[] = [];
    for (let i = 0; i < coordinates.length; i += 2)
      points.push(point(coordinates[i], coordinates[i + 1]));
    const area = points.reduce((sum, current, index) => {
      const next = points[(index + 1) % points.length];
      if (current.x === next.x && current.y === next.y) throw invalidSvg();
      return sum + current.x * next.y - next.x * current.y;
    }, 0);
    if (area === 0) throw invalidSvg();
    return points;
  }

  const groups = children(svg, 'g');
  const sectionElements = groups.filter(
    (element) => element.hasAttribute('data-kind') || element.hasAttribute('data-code'),
  );
  if (sectionElements.length === 0 || sectionElements.length > 500) throw invalidSvg();
  const sectionCodes = new Set<string>();
  let seatCount = 0;
  const sections: MapSection[] = sectionElements.map((element) => {
    checkTransform(element);
    const code = uniqueLabel(element.getAttribute('data-code'), sectionCodes);
    const kind = element.getAttribute('data-kind');
    if (kind !== 'ASSIGNED' && kind !== 'GA') throw invalidSvg();
    const points = polygon(onlyChild(element, 'polygon'));
    const rows = children(element, 'g').filter((row) => row.hasAttribute('data-row'));
    if (rows.length > 1000 || (kind === 'GA' && rows.length > 0)) throw invalidSvg();
    const rowCodes = new Set<string>();
    return {
      id: crypto.randomUUID(),
      code,
      label: sectionLabel(element, code),
      kind,
      points,
      rows: rows.map((row) => {
        checkTransform(row);
        const rowCode = uniqueLabel(row.getAttribute('data-row'), rowCodes);
        const seats = children(row, 'g').filter((seat) => seat.hasAttribute('data-seat'));
        seatCount += seats.length;
        if (seats.length === 0 || seats.length > 1000 || seatCount > 100_000) throw invalidSvg();
        const seatLabels = new Set<string>();
        return {
          id: crypto.randomUUID(),
          code: rowCode,
          label: label(row.getAttribute('data-label') ?? rowCode, 200),
          seats: seats.map((seat, index) => {
            checkTransform(seat);
            const circle = onlyChild(seat, 'circle');
            checkTransform(circle);
            const position = point(
              number(circle.getAttribute('cx')),
              number(circle.getAttribute('cy')),
            );
            if (!containsPoint(points, position)) throw invalidSvg();
            return {
              ...position,
              id: crypto.randomUUID(),
              label: uniqueLabel(seat.getAttribute('data-seat'), seatLabels),
              accessible: flag(seat, 'data-accessible'),
              restrictedView: flag(seat, 'data-restricted-view'),
              blocked: flag(seat, 'data-blocked'),
              segment: rowCode,
              position: index + 1,
            };
          }),
        };
      }),
    };
  });

  const shapes: MapShape[] = [];
  for (const element of groups) {
    const kind =
      element.getAttribute('data-shape') ??
      (element.id === 'stage' ? 'STAGE' : element.id === 'mixing-desk' ? 'LANDMARK' : null);
    if (!kind) continue;
    if (!['STAGE', 'AISLE', 'LANDMARK'].includes(kind) || shapes.length >= 500) throw invalidSvg();
    checkTransform(element);
    const outline = children(element, 'polygon')[0];
    const name = label(
      element.getAttribute('data-label') ??
        children(element, 'title')[0]?.textContent ??
        children(element, 'text')[0]?.textContent ??
        '',
      200,
    );
    if (outline) {
      shapes.push({ kind, label: name, points: polygon(outline) });
      continue;
    }
    const rect = onlyChild(element, 'rect');
    checkTransform(rect);
    const x = number(rect.getAttribute('x') ?? '0');
    const y = number(rect.getAttribute('y') ?? '0');
    const w = number(rect.getAttribute('width'));
    const h = number(rect.getAttribute('height'));
    if (w <= 0 || h <= 0) throw invalidSvg();
    shapes.push({
      kind,
      label: name,
      points: [point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)],
    });
  }
  return { width, height, shapes, sections };
}

function sectionLabel(element: Element, code: string): string {
  const explicit = element.getAttribute('data-label');
  if (explicit !== null) return label(explicit, 200);
  const title = children(element, 'title')[0]?.textContent?.trim() || code;
  const name = title.startsWith(code + ' · ') ? title.slice(code.length + 3) : title;
  const capacity = ' · ' + element.getAttribute('data-capacity') + ' vé';
  return label(
    element.hasAttribute('data-capacity') && name.endsWith(capacity)
      ? name.slice(0, -capacity.length)
      : name,
    200,
  );
}

function containsPoint(points: Point[], seat: Point): boolean {
  let inside = false;
  for (const [index, a] of points.entries()) {
    const b = points[(index + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const cross = dx * (seat.y - a.y) - dy * (seat.x - a.x);
    if (
      Math.abs(cross) < 1e-7 * Math.hypot(dx, dy) &&
      seat.x >= Math.min(a.x, b.x) &&
      seat.x <= Math.max(a.x, b.x) &&
      seat.y >= Math.min(a.y, b.y) &&
      seat.y <= Math.max(a.y, b.y)
    )
      return true;
    if (a.y > seat.y !== b.y > seat.y && seat.x < a.x + (dx * (seat.y - a.y)) / dy)
      inside = !inside;
  }
  return inside;
}

function children(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter(
    (child) => child.namespaceURI === svgNamespace && child.localName === name,
  );
}

function onlyChild(parent: Element, name: string): Element {
  const matches = children(parent, name);
  if (matches.length !== 1) throw invalidSvg();
  return matches[0];
}

function checkTransform(element: Element) {
  if (element.hasAttribute('transform')) throw invalidSvg();
}

function label(raw: string | null, limit: number): string {
  const value = raw?.trim();
  if (!value || value.length > limit) throw invalidSvg();
  return value;
}

function uniqueLabel(raw: string | null, seen: Set<string>): string {
  const value = label(raw, 100);
  if (seen.has(value)) throw invalidSvg();
  seen.add(value);
  return value;
}

function flag(element: Element, name: string): boolean {
  const value = element.getAttribute(name);
  if (value !== null && value !== 'true' && value !== 'false') throw invalidSvg();
  return value === 'true';
}

function numbers(value: string | null): number[] {
  return (value ?? '')
    .trim()
    .split(/[,\s]+/)
    .map(number);
}

function number(value: string | null): number {
  const token = value?.trim() ?? '';
  const parsed = Number(token);
  if (!numberPattern.test(token) || !Number.isFinite(parsed)) throw invalidSvg();
  return parsed;
}

function invalidSvg() {
  return new Error('Unsupported layout SVG');
}
