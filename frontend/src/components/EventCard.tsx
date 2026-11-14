import { formatLanguage, translate } from '../i18n';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ConcertStatus } from '../api/concerts';
import { eventDate, dateFormatter } from '../data/formatters';
import { RemoteImage } from './RemoteImage';

export type EventCardItem = {
  id: string | number;
  title: string;
  venue: string;
  eventDate: string;
  status: ConcertStatus | 'available' | 'selling-fast' | 'sold-out';
  image: string | null;
  supportingText?: string;
};

export function EventCard({
  event,
  priority = false,
}: {
  event: EventCardItem;
  priority?: boolean;
}) {
  useTranslation();
  const isSoldOut = event.status === 'SOLD_OUT' || event.status === 'sold-out';
  const isSellingFast = event.status === 'selling-fast';
  const isUpcoming = event.status === 'DRAFT';
  const date = new Date(event.eventDate);
  const time = dateFormatter({ hour: '2-digit', minute: '2-digit' }).format(
    date,
  );
  const month = dateFormatter({ month: 'short' })
    .format(date)
    .toLocaleUpperCase(formatLanguage());
  const day = dateFormatter({ day: '2-digit' }).format(date);

  return (
    <article className="event-card">
      <Link to={`/concerts/${event.id}`} aria-label={translate('shared:eventCard_viewEvent', { title: event.title })}>
        <div className="event-image-wrap">
          <RemoteImage
            src={event.image ?? undefined}
            alt=""
            width="720"
            height="405"
            loading={priority ? 'eager' : 'lazy'}
          />
          <span
            className={`status-pill ${isSoldOut ? 'status-sold-out' : isSellingFast ? 'status-selling-fast' : isUpcoming ? 'status-upcoming' : 'status-on-sale'}`}
          >
            {isSoldOut
              ? translate("shared:eventCard_hetVe")
              : isSellingFast
                ? translate("shared:eventCard_sapHetVe")
                : isUpcoming
                  ? translate("shared:eventCard_sapMoBan")
                  : translate("shared:eventCard_dangBan")}
          </span>
          <span className="card-arrow" aria-hidden="true">
            →
          </span>
        </div>
        <div className="event-card-copy">
          <div className="event-date-tile" aria-hidden="true">
            <span>{month}</span>
            <strong>{day}</strong>
          </div>
          <div className="event-card-details">
            <p className="event-date">
              {eventDate.format(date)} · {time}
            </p>
            <h3>{event.title}</h3>
            <p>{event.venue}</p>
            <div className="event-price">
              <strong>{event.supportingText ?? translate("shared:eventCard_timVe")}</strong>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
