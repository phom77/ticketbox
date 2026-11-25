import { ArrowUpRight, MapPin, Ticket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MouseEventHandler } from 'react';
import { Link } from 'react-router-dom';
import { RemoteImage } from './RemoteImage';
import { currency, dateFormatter } from '../data/formatters';
import { eventSaleLabels, type ConcertSaleState } from '../features/concert/concertSale';
import { concertTimeZone } from '../features/discovery/filters';
import './EventCard.css';

export type EventCardItem = {
  id: string;
  href?: string;
  title: string;
  venue: string;
  city?: string | null;
  eventDate: string;
  status: ConcertSaleState;
  image: string | null;
  minPrice?: number | null;
  performanceCount?: number;
  /** Relative day shown as a badge, such as the Today and Tomorrow rows on the home page. */
  dayBadge?: 'today' | 'tomorrow' | null;
};

const zone = { timeZone: concertTimeZone };
const dayFormat = dateFormatter({ day: 'numeric', ...zone });
const monthFormat = dateFormatter({ month: 'short', ...zone });
const weekdayFormat = dateFormatter({ weekday: 'short', ...zone });
const timeFormat = dateFormatter({ hour: 'numeric', minute: '2-digit', ...zone });

export function EventDateBlock({ value }: { value: string }) {
  const { t } = useTranslation('public');
  const date = Date.parse(value);
  if (!Number.isFinite(date)) {
    return (
      <span className="event-date-block event-date-block-tba">
        {t('public:discovery_dateTbaShort')}
      </span>
    );
  }
  return (
    <time className="event-date-block" dateTime={value}>
      <span className="event-date-month">{monthFormat.format(date)}</span>
      <span className="event-date-day">{dayFormat.format(date)}</span>
      <span className="event-date-time">
        {weekdayFormat.format(date)} · {timeFormat.format(date)}
      </span>
    </time>
  );
}

export function EventCard({
  event,
  priority = false,
  action,
  heading: Heading = 'h3',
  linkId,
  onOpen,
}: {
  event: EventCardItem;
  priority?: boolean;
  action?: string;
  heading?: 'h2' | 'h3';
  linkId?: string;
  onOpen?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const { t } = useTranslation('public');
  const place = [event.venue || t('public:discovery_venueToBeAnnounced'), event.city]
    .filter(Boolean)
    .join(' · ');
  const hasPrice = typeof event.minPrice === 'number' && event.status !== 'cancelled';
  const dates = event.performanceCount ?? 1;

  return (
    <article className="concert-card">
      <Link
        aria-label={action ? `${event.title} · ${action}` : event.title}
        id={linkId}
        onClick={onOpen}
        to={event.href ?? `/concerts/${encodeURIComponent(event.id)}`}
      >
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
          <span className="concert-card-badges">
            {event.dayBadge ? (
              <span className="concert-card-status" data-sale-state="day">
                {t(
                  event.dayBadge === 'today'
                    ? 'public:discovery_dayToday'
                    : 'public:discovery_dayTomorrow',
                )}
              </span>
            ) : null}
            <span className="concert-card-status" data-sale-state={event.status}>
              {t(eventSaleLabels[event.status])}
            </span>
          </span>
        </div>
        <div className="concert-card-body">
          <EventDateBlock value={event.eventDate} />
          <div className="concert-card-text">
            <Heading>{event.title}</Heading>
            <p>
              <MapPin aria-hidden="true" />
              {place}
            </p>
            {hasPrice || dates > 1 ? (
              <p className="concert-card-meta">
                {hasPrice ? (
                  <span className="concert-card-price">
                    {t('public:discovery_fromPrice', {
                      price: currency.format(event.minPrice as number),
                    })}
                    <span className="sr-only"> {t('shared:price_feesIncluded')}</span>
                  </span>
                ) : null}
                {dates > 1 ? (
                  <span className="concert-card-dates">
                    {t('public:discovery_dateCount', { count: dates })}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <span className="concert-card-action">
            {action ?? t('public:discovery_viewEvent')} <ArrowUpRight aria-hidden="true" />
          </span>
        </div>
      </Link>
    </article>
  );
}
