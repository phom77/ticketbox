import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { isRequestCanceled } from '../../api/client';
import { getEvent, performancePath, type EventDetails } from '../../api/performances';
import { useAuth } from '../../features/auth/AuthContext';
import { performanceTime } from '../../features/performance/format';

export function EventPage() {
  const { eventId } = useParams();
  return eventId ? <EventDetailsPage key={eventId} id={eventId} /> : null;
}

function EventDetailsPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { search } = useLocation();
  const selectedId = new URLSearchParams(search).get('performance');
  const selectedShow = useRef<HTMLLIElement>(null);
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const controller = new AbortController();
    getEvent(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setEvent(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isRequestCanceled(error)) setFailed(true);
      });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    const show = selectedShow.current;
    if (!show) return;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      show.scrollIntoView({ behavior: 'instant', block: 'nearest' });
      show.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [event, selectedId]);

  useEffect(() => {
    const next = event?.performances
      .flatMap((performance) => [
        Date.parse(performance.saleStartAt),
        Date.parse(performance.saleEndAt),
      ])
      .filter((boundary) => boundary > now)
      .sort((first, second) => first - second)[0];
    if (!next) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(0, next - Date.now()), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [event, now]);

  if (failed)
    return (
      <section className="page-width performance-page">
        <p role="alert">{t('performances:loadFailed')}</p>
        <Link to="/events">{t('performances:events')}</Link>
      </section>
    );
  if (!event)
    return (
      <p className="page-width performance-page" role="status">
        {t('performances:loading')}
      </p>
    );

  return (
    <section className="page-width performance-page">
      <Link to="/events">{t('performances:events')}</Link>
      <h1>{event.title}</h1>
      {event.description && <p>{event.description}</p>}
      <h2>{t('performances:schedule')}</h2>
      {event.performances.length === 0 && <p>{t('performances:noPerformances')}</p>}
      <ul className="performance-list">
        {event.performances.map((performance) => {
          const saleClosed =
            performance.status !== 'ON_SALE' ||
            performance.salesSuspended ||
            Date.parse(performance.saleEndAt) <= now;
          const opensAt = Date.parse(performance.saleStartAt);
          const comingSoon = !saleClosed && opensAt > now;
          const canBuy = !user || user.role === 'AUDIENCE';
          const base = performance.legacyConcertId
            ? '/concerts/' + encodeURIComponent(performance.legacyConcertId)
            : performancePath(id, performance.id);
          const selected = performance.id === selectedId;
          return (
            <li
              key={performance.id}
              className="performance-show"
              ref={selected ? selectedShow : undefined}
              tabIndex={selected ? -1 : undefined}
              data-selected={selected || undefined}
            >
              <div>
                <strong>{performance.venueName}</strong>
                <p>
                  <time dateTime={performance.startsAt}>{performanceTime(performance)}</time>
                </p>
              </div>
              {saleClosed ? (
                <span>{t('performances:saleClosed')}</span>
              ) : comingSoon ? (
                <span>
                  {t('public:homePage_sapMoBan')} ·{' '}
                  {performanceTime({ ...performance, startsAt: performance.saleStartAt })}
                </span>
              ) : (
                canBuy && (
                  <Link className="button button-primary" to={base + '/waiting-room'}>
                    {t('performances:buy')}
                  </Link>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
