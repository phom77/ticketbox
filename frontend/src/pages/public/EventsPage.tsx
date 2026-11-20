import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { isRequestCanceled } from '../../api/client';
import { eventPath, getEvent, listEvents, performancePath, type EventDetails } from '../../api/performances';
import { useAuth } from '../../features/auth/AuthContext';
import { performanceTime } from '../../features/performance/format';

export function EventsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ page: number; events: EventDetails[]; last: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    listEvents(page, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ page, events: data.content, last: data.last });
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isRequestCanceled(error)) setFailed(true);
      });
    return () => controller.abort();
  }, [page]);

  const events = result?.page === page ? result.events : null;
  return (
    <section className="page-width performance-page">
      <h1>{t('performances:events')}</h1>
      {failed ? <p role="alert">{t('performances:loadFailed')}</p>
        : !events ? <p role="status">{t('performances:loading')}</p>
        : events.length === 0 ? <p>{t('performances:noEvents')}</p>
        : <ul className="performance-list">{events.map((event) => (
          <li key={event.id}>
            <Link to={eventPath(event.id)}>{event.title}</Link>
            {event.description && <p>{event.description}</p>}
          </li>
        ))}</ul>}
      {result?.page === page && (page > 0 || !result.last) && (
        <div className="performance-actions">
          <button type="button" className="button button-secondary" disabled={page === 0} onClick={() => { setFailed(false); setPage(page - 1); }}>{t('performances:previous')}</button>
          <button type="button" className="button button-secondary" disabled={result.last} onClick={() => { setFailed(false); setPage(page + 1); }}>{t('performances:next')}</button>
        </div>
      )}
    </section>
  );
}

export function EventPage() {
  const { eventId } = useParams();
  return eventId ? <EventDetailsPage key={eventId} id={eventId} /> : null;
}

function EventDetailsPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    getEvent(id, controller.signal).then((data) => {
      if (!controller.signal.aborted) setEvent(data);
    }).catch((error) => {
      if (!controller.signal.aborted && !isRequestCanceled(error)) setFailed(true);
    });
    return () => controller.abort();
  }, [id]);

  if (failed) return <section className="page-width performance-page"><p role="alert">{t('performances:loadFailed')}</p><Link to="/events">{t('performances:events')}</Link></section>;
  if (!event) return <p className="page-width performance-page" role="status">{t('performances:loading')}</p>;

  return (
    <section className="page-width performance-page">
      <Link to="/events">{t('performances:events')}</Link>
      <h1>{event.title}</h1>
      {event.description && <p>{event.description}</p>}
      <h2>{t('performances:schedule')}</h2>
      {event.performances.length === 0 && <p>{t('performances:noPerformances')}</p>}
      <ul className="performance-list">
        {event.performances.map((performance) => {
          const saleClosed = performance.status !== 'ON_SALE' || Date.parse(performance.saleEndAt) <= Date.now();
          const canBuy = !user || user.role === 'AUDIENCE';
          const base = performance.legacyConcertId
            ? '/concerts/' + encodeURIComponent(performance.legacyConcertId)
            : performancePath(id, performance.id);
          return (
            <li key={performance.id} className="performance-show">
              <div>
                <strong>{performance.venueName}</strong>
                <p><time dateTime={performance.startsAt}>{performanceTime(performance)}</time></p>
              </div>
              {saleClosed ? <span>{t('performances:saleClosed')}</span>
                : canBuy && <Link className="button button-primary" to={base + '/waiting-room'}>{t('performances:buy')}</Link>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
