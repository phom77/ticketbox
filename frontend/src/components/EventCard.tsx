import { ArrowUpRight, CalendarDays, MapPin, Ticket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MouseEventHandler } from 'react';
import { Link } from 'react-router-dom';
import { RemoteImage } from './RemoteImage';
import { dateFormatter } from '../data/formatters';
import { eventSaleLabels, type ConcertSaleState } from '../features/concert/concertSale';
import { concertTimeZone } from '../features/discovery/filters';
import './EventCard.css';

export type EventCardItem = {
  id: string;
  href?: string;
  title: string;
  venue: string;
  eventDate: string;
  status: ConcertSaleState;
  image: string | null;
  supportingText?: string;
};

const dateTime = dateFormatter({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: concertTimeZone,
});

export function EventCard({
  event,
  priority = false,
  preview = false,
  action,
  heading: Heading = 'h3',
  linkId,
  onOpen,
}: {
  event: EventCardItem;
  priority?: boolean;
  preview?: boolean;
  action?: string;
  heading?: 'h2' | 'h3';
  linkId?: string;
  onOpen?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const { t } = useTranslation('public');
  const date = Date.parse(event.eventDate);
  const details = (
    <>
      <div className="concert-card-media">
        {event.image ? (
          <RemoteImage
            src={event.image}
            alt=""
            width="720"
            height="405"
            loading={priority ? 'eager' : 'lazy'}
          />
        ) : (
          <Ticket aria-hidden="true" />
        )}
      </div>
      <div className="concert-card-body">
        <span className="concert-card-status" data-sale-state={event.status}>
          {t(eventSaleLabels[event.status])}
        </span>
        <Heading>{event.title}</Heading>
        <p>
          <CalendarDays aria-hidden="true" />
          {Number.isFinite(date) ? (
            <time dateTime={event.eventDate}>{dateTime.format(date)}</time>
          ) : (
            t('public:discovery_dateToBeAnnounced')
          )}
        </p>
        <p>
          <MapPin aria-hidden="true" />
          {event.venue || t('public:discovery_venueToBeAnnounced')}
        </p>
        {event.supportingText ? (
          <p className="concert-card-support">{event.supportingText}</p>
        ) : null}
        {!preview && action ? (
          <span className="concert-card-action">
            {action} <ArrowUpRight aria-hidden="true" />
          </span>
        ) : !preview ? (
          <ArrowUpRight className="concert-card-link-icon" aria-hidden="true" />
        ) : null}
      </div>
    </>
  );

  return (
    <article className="concert-card">
      {preview ? (
        <div>{details}</div>
      ) : (
        <Link
          aria-label={action ? `${event.title} · ${action}` : event.title}
          id={linkId}
          onClick={onOpen}
          to={event.href ?? `/concerts/${encodeURIComponent(event.id)}`}
        >
          {details}
        </Link>
      )}
    </article>
  );
}
