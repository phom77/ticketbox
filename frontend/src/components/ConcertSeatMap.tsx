import { translate } from '../i18n';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef } from 'react';

const EMPTY_DISABLED_TICKET_TYPES: ReadonlySet<string> = new Set();

type ConcertSeatMapProps = {
  svg: string | null;
  selectedTicketTypeId: string | null;
  disabledTicketTypeIds?: ReadonlySet<string>;
  ticketTypeLabels?: ReadonlyMap<string, string>;
  onZoneSelect: (ticketTypeId: string) => void;
  /** Hover or focus on a zone; null when it leaves. */
  onZoneHover?: (ticketTypeId: string | null) => void;
};

function zoneId(target: EventTarget | null) {
  return target instanceof Element
    ? (target.closest<SVGElement>('[data-ticket-type-id]')?.dataset.ticketTypeId ?? null)
    : null;
}

export function ConcertSeatMap({
  svg,
  selectedTicketTypeId,
  disabledTicketTypeIds = EMPTY_DISABLED_TICKET_TYPES,
  ticketTypeLabels,
  onZoneSelect,
  onZoneHover,
}: ConcertSeatMapProps) {
  useTranslation();
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
      const isDisabled =
        disabledTicketTypeIds.has(ticketTypeId) || ticketTypeLabels?.has(ticketTypeId) === false;
      const isSelected = ticketTypeId === selectedTicketTypeId;
      const label =
        ticketTypeLabels?.get(ticketTypeId) ||
        zone.getAttribute('aria-label') ||
        zone.dataset.zoneName;
      if (label) zone.setAttribute('aria-label', label);
      zone.setAttribute('role', 'button');
      zone.classList.toggle('is-selected', isSelected);
      zone.classList.toggle('is-disabled', isDisabled);
      zone.setAttribute('aria-pressed', String(isSelected));
      zone.setAttribute('aria-disabled', String(isDisabled));
      zone.setAttribute('tabindex', isDisabled ? '-1' : '0');
    });
  }, [disabledTicketTypeIds, sanitizedSvg, selectedTicketTypeId, ticketTypeLabels]);

  if (!/^<svg(?:\s|>)/.test(sanitizedSvg.trimStart())) {
    return (
      <div className="seat-map-fallback">
        <h3>{translate('shared:concertSeatMap_soDoChoKhongKhaDung')}</h3>
        <p>{translate('shared:concertSeatMap_banVanCoTheChonKhuVe')}</p>
      </div>
    );
  }

  function selectFromTarget(target: EventTarget | null) {
    const zone =
      target instanceof Element ? target.closest<SVGElement>('[data-ticket-type-id]') : null;
    const ticketTypeId = zone?.dataset.ticketTypeId;
    if (
      !ticketTypeId ||
      disabledTicketTypeIds.has(ticketTypeId) ||
      (ticketTypeLabels && !ticketTypeLabels.has(ticketTypeId))
    )
      return false;
    onZoneSelect(ticketTypeId);
    return true;
  }

  return (
    <div
      ref={containerRef}
      className="concert-seat-map"
      onClick={(event) => selectFromTarget(event.target)}
      onMouseOver={(event) => onZoneHover?.(zoneId(event.target))}
      onMouseLeave={() => onZoneHover?.(null)}
      onFocus={(event) => onZoneHover?.(zoneId(event.target))}
      onBlur={() => onZoneHover?.(null)}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && selectFromTarget(event.target)) {
          event.preventDefault();
        }
      }}
      dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
    />
  );
}
