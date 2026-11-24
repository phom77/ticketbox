import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { BuyerState } from '../../components/feedback/BuyerState';
import { DetailSkeleton } from '../../components/feedback/Skeleton';
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
  const [failed, setFailed] = useState<'missing' | 'temporary' | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const controller = new AbortController();
    getEvent(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setEvent(data);
      })
      .catch((error) => {
        if (controller.signal.aborted || isRequestCanceled(error)) return;
        setFailed(
          error instanceof ApiClientError && error.status === 404 ? 'missing' : 'temporary',
        );
      });
    return () => controller.abort();
  }, [id, reloadKey]);

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
      <section className="buyer-page page-width performance-page">
        <BuyerState
          tone="error"
          headingLevel={1}
          title={t(
            failed === 'missing' ? 'performances:unavailable' : 'performances:loadFailedTitle',
          )}
          actions={
            <>
              {failed === 'temporary' ? (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    setFailed(null);
                    setReloadKey((key) => key + 1);
                  }}
                >
                  {t('performances:retry')}
                </button>
              ) : null}
              <Link className="button button-secondary" to="/events">
                {t('performances:events')}
              </Link>
            </>
          }
        >
          {t(failed === 'missing' ? 'performances:unavailableBody' : 'performances:loadFailed')}
        </BuyerState>
      </section>
    );
  if (!event)
    return (
      <section className="buyer-page page-width performance-page">
        <DetailSkeleton label={t('performances:loading')} />
      </section>
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
