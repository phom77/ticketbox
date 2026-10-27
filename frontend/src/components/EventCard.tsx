import { Link } from 'react-router-dom';
import type { ConcertStatus } from '../api/concerts';
import { eventDate } from '../data/formatters';
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
  const isSoldOut = event.status === 'SOLD_OUT' || event.status === 'sold-out';
  const isSellingFast = event.status === 'selling-fast';
  const isUpcoming = event.status === 'DRAFT';
  const date = new Date(event.eventDate);
  const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(
    date,
  );
  const month = new Intl.DateTimeFormat('vi-VN', { month: 'short' })
    .format(date)
    .toLocaleUpperCase('vi-VN');
  const day = new Intl.DateTimeFormat('vi-VN', { day: '2-digit' }).format(date);

  return (
    <article className="event-card">
      <Link to={`/concerts/${event.id}`} aria-label={`Xem ${event.title}`}>
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
              ? 'Hết vé'
              : isSellingFast
                ? 'Sắp hết vé'
                : isUpcoming
                  ? 'Sắp mở bán'
                  : 'Đang bán'}
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
              <strong>{event.supportingText ?? 'Tìm vé'}</strong>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
