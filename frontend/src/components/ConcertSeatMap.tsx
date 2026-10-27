import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef } from 'react';

const EMPTY_DISABLED_TICKET_TYPES: ReadonlySet<string> = new Set();

type ConcertSeatMapProps = {
  svg: string | null;
  selectedTicketTypeId: string | null;
  disabledTicketTypeIds?: ReadonlySet<string>;
  onZoneSelect: (ticketTypeId: string) => void;
};

export function ConcertSeatMap({
  svg,
  selectedTicketTypeId,
  disabledTicketTypeIds = EMPTY_DISABLED_TICKET_TYPES,
  onZoneSelect,
}: ConcertSeatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sanitizedSvg = useMemo(
    () =>
      svg
        ? DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
            ADD_ATTR: ['data-ticket-type-id', 'data-zone-name', 'tabindex', 'role', 'aria-label'],
          })
        : '',
    [svg],
  );

  useEffect(() => {
    const container = containerRef.current;
    const zones = container?.querySelectorAll<SVGGraphicsElement>('[data-ticket-type-id]');
    zones?.forEach((zone) => {
      const ticketTypeId = zone.dataset.ticketTypeId ?? '';
      const isDisabled = disabledTicketTypeIds.has(ticketTypeId);
      zone.classList.toggle('is-selected', ticketTypeId === selectedTicketTypeId);
      zone.classList.toggle('is-disabled', isDisabled);
      zone.setAttribute('aria-disabled', String(isDisabled));
      zone.setAttribute('tabindex', isDisabled ? '-1' : '0');
    });
  }, [disabledTicketTypeIds, sanitizedSvg, selectedTicketTypeId]);

  if (!sanitizedSvg) {
    return (
      <div className="seat-map-fallback">
        <span aria-hidden="true">◇</span>
        <h3>Sơ đồ chỗ không khả dụng</h3>
        <p>Bạn vẫn có thể chọn khu vé từ danh sách.</p>
      </div>
    );
  }

  function selectFromTarget(target: EventTarget | null) {
    const zone = (target as Element | null)?.closest<SVGElement>('[data-ticket-type-id]');
    const ticketTypeId = zone?.dataset.ticketTypeId;
    if (ticketTypeId && !disabledTicketTypeIds.has(ticketTypeId)) onZoneSelect(ticketTypeId);
  }

  return (
    <div
      ref={containerRef}
      className="concert-seat-map"
      onClick={(event) => selectFromTarget(event.target)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectFromTarget(event.target);
        }
      }}
      dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
    />
  );
}
