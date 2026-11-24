import { useTranslation } from 'react-i18next';
import type { Layout, MapSection, Point } from '../../api/performances';
import { mapBounds, mapSeatRadius, sectionViewBox } from '../performance/layoutTools';
import { formatPrice } from '../price/price';
import { stockLevel } from './selection';

const points = (vertices: Point[]) => vertices.map(({ x, y }) => x + ',' + y).join(' ');

export type SectionStats = {
  available: number;
  fromPrice: number | null;
  held: number;
  match: boolean;
};

export function VenueMap({
  layout,
  stats,
  selectedSection,
  onSelect,
  onTip,
}: {
  layout: Layout;
  stats: ReadonlyMap<string, SectionStats>;
  selectedSection: string | null;
  onSelect: (sectionId: string) => void;
  onTip: (tip: string | null) => void;
}) {
  const { t } = useTranslation('customer');
  return (
    <svg
      className="ts-map"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="group"
      aria-label={t('customer:ticketSelection_venueMap')}
    >
      {layout.backgroundUrl && (
        <image href={layout.backgroundUrl} width={layout.width} height={layout.height} />
      )}
      {layout.shapes.map((shape, index) => (
        <polygon key={index} className="ts-map-shape" points={points(shape.points)}>
          <title>{shape.label}</title>
        </polygon>
      ))}
      {layout.sections.map((section) => {
        const area = mapBounds(section.points);
        const info = stats.get(section.id) ?? {
          available: 0,
          fromPrice: null,
          held: 0,
          match: false,
        };
        const level = stockLevel(info.available);
        const description = [
          section.label,
          info.fromPrice != null
            ? t('customer:ticketSelection_fromPrice', { price: formatPrice(info.fromPrice) })
            : null,
          level === 'sold'
            ? t('customer:ticketSelection_soldOut')
            : t('customer:ticketSelection_available', { count: info.available }),
          info.held ? t('customer:ticketSelection_heldInSection', { count: info.held }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        const size = Math.min(
          layout.width / 55,
          area.height / 3,
          area.width / Math.max(section.code.length, 3),
        );
        const choose = () => level !== 'sold' && onSelect(section.id);
        return (
          <g
            key={section.id}
            className="ts-section"
            role="button"
            tabIndex={0}
            aria-label={description}
            aria-pressed={section.id === selectedSection}
            aria-disabled={level === 'sold'}
            data-stock={info.held ? 'selected' : level}
            data-selected={section.id === selectedSection}
            data-dim={!info.match && level !== 'sold'}
            onClick={choose}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                choose();
              }
            }}
            onMouseEnter={() => onTip(description)}
            onMouseLeave={() => onTip(null)}
            onFocus={() => onTip(description)}
            onBlur={() => onTip(null)}
          >
            <polygon className="ts-section-area" points={points(section.points)} />
            {size >= layout.width / 130 && (
              <text
                className="ts-section-label"
                x={area.x + area.width / 2}
                y={area.y + area.height / 2}
                fontSize={size}
              >
                {info.held ? '✓ ' : ''}
                {section.code}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function SeatMap({
  section,
  accessibleOnly,
  heldSeats,
  isAvailable,
  describe,
  onSelect,
  onTip,
}: {
  section: MapSection;
  accessibleOnly: boolean;
  heldSeats: ReadonlySet<string>;
  isAvailable: (seatId: string) => boolean;
  describe: (row: string, seat: string, seatId: string) => string;
  onSelect: (seatId: string) => void;
  onTip: (tip: string | null) => void;
}) {
  const bounds = mapBounds(section.points);
  const radius = mapSeatRadius(section.rows, bounds);
  return (
    <svg className="ts-map" viewBox={sectionViewBox(bounds)} aria-hidden="true">
      <polygon className="ts-section-area" data-stock="available" points={points(section.points)} />
      {section.rows.flatMap((row) =>
        row.seats
          .filter((seat) => !accessibleOnly || seat.accessible)
          .map((seat) => {
            const held = heldSeats.has(seat.id);
            const free = isAvailable(seat.id);
            return (
              <g
                key={seat.id}
                className="ts-seat"
                data-seat-id={seat.id}
                data-state={held ? 'selected' : free ? 'available' : 'sold'}
                data-accessible={seat.accessible}
                data-restricted={seat.restrictedView}
                onClick={() => onSelect(seat.id)}
                onMouseEnter={() => onTip(describe(row.label, seat.label, seat.id))}
                onMouseLeave={() => onTip(null)}
              >
                <circle cx={seat.x} cy={seat.y} r={radius} />
                {held && (
                  <path
                    d={`M${seat.x - radius * 0.5} ${seat.y} l${radius * 0.35} ${radius * 0.4} l${radius * 0.65} ${-radius * 0.8}`}
                  />
                )}
              </g>
            );
          }),
      )}
    </svg>
  );
}
