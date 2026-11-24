import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, FileCheck, Info } from 'lucide-react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { getOperationsEvent } from '../../api/operations';
import { getApprovedOrganizations, type ApprovedOrganization } from '../../api/organizations';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useOperationsConcert } from '../../components/layout/operationsConcertNavigation';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { formatLanguage } from '../../i18n';
import { formatPerformanceDateTime } from '../organizer/performanceDateTime';
import { reportReturnPath } from '../../features/operations/reportReturn';
import '../operations/ConcertDirectoryPage.css';

type AdminEvent = Awaited<ReturnType<typeof getOperationsEvent>>;

export function AdminEventWorkspacePage() {
  const { eventId } = useParams();
  return eventId ? <EventWorkspace key={eventId} id={eventId} /> : null;
}

function EventWorkspace({ id }: { id: string }) {
  const { t } = useTranslation();
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const [result, setResult] = useState<{ data?: AdminEvent; error?: string }>();
  const [organizations, setOrganizations] = useState<ApprovedOrganization[]>([]);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getOperationsEvent(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ error: error instanceof Error ? error.message : '' });
      });
    void getApprovedOrganizations(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setOrganizations(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [id, retry]);

  const directory = location.state?.directorySearch;
  const reportBack = reportReturnPath(search.get('returnTo'), 'admin');
  const back =
    reportBack ??
    (typeof directory === 'string' && directory ? '/admin/events?' + directory : '/admin/events');
  const event = result?.data;
  const performance =
    event?.performances.find((row) => row.id === search.get('show')) ?? event?.performances[0];
  const review =
    performance?.publicationStatus &&
    '/admin/event-review?' +
      new URLSearchParams({ performanceId: performance.id, state: performance.publicationStatus });
  const operations =
    performance &&
    performance.status !== 'DRAFT' &&
    '/admin/performance-operations?' + new URLSearchParams({ performance: performance.id });
  const overview = location.pathname + location.search;
  const contextualNavigation = useMemo(
    () =>
      event && !event.legacyConcertId
        ? {
            title: event.title,
            eventId: event.id,
            performanceId: performance?.id,
            links: [
              {
                to: overview,
                label: t('admin:concertWorkspacePage_tongQuan'),
                icon: Info,
                current: true,
                state: location.state,
              },
              ...(review
                ? [{ to: review, label: t('concert-directory:openReview'), icon: FileCheck }]
                : []),
              ...(operations
                ? [{ to: operations, label: t('concert-directory:openOperations'), icon: Activity }]
                : []),
            ],
          }
        : null,
    [event, overview, location.state, performance?.id, review, operations, t],
  );
  useOperationsConcert(contextualNavigation);

  if (event?.legacyConcertId) {
    return (
      <Navigate
        replace
        to={'/admin/concerts/' + encodeURIComponent(event.legacyConcertId)}
        state={location.state}
      />
    );
  }
  const owner = event?.organizationId
    ? (organizations.find(({ id }) => id === event.organizationId)?.name ??
      t('concert-directory:organizationUnavailable'))
    : 'TicketBox';
  const displayTime = (value: string | null, timezone: string) =>
    value ? formatPerformanceDateTime(value, timezone, formatLanguage()) : '—';

  return (
    <div className="concert-directory-detail">
      <Link className="performance-flow-back" to={back}>
        {t(reportBack ? 'shared:operationsReports' : 'concert-directory:title')}
      </Link>
      {!result && <p role="status">{t('performances:loading')}</p>}
      {result && !event && (
        <section className="admin-empty-state">
          <p role="alert">{result.error || t('requestFailed')}</p>
          <button
            className="admin-secondary-action"
            type="button"
            onClick={() => {
              setResult(undefined);
              setRetry((value) => value + 1);
            }}
          >
            {t('performances:refresh')}
          </button>
        </section>
      )}
      {event && (
        <>
          <AdminPageHeader title={event.title} description={owner} />
          {event.description && <p>{event.description}</p>}
          {!performance && <p>{t('concert-directory:noPerformances')}</p>}
          {performance && (
            <section
              className="admin-data-panel"
              aria-label={t('concert-directory:selectPerformance')}
            >
              <label className="admin-field">
                {t('concert-directory:selectPerformance')}
                <WorkspaceSelect
                  label={t('concert-directory:selectPerformance')}
                  value={performance.id}
                  options={event.performances.map((row) => ({
                    value: row.id,
                    label: [displayTime(row.startsAt, row.timezone), row.venueName, row.spaceName]
                      .filter(Boolean)
                      .join(' · '),
                  }))}
                  onChange={(value) => {
                    const next = new URLSearchParams(search);
                    next.set('show', value);
                    setSearch(next, { state: location.state });
                  }}
                />
              </label>
              <dl className="publication-status">
                <div>
                  <dt>{t('concert-directory:publication')}</dt>
                  <dd>
                    {performance.publicationStatus
                      ? t(`shared:release_${performance.publicationStatus}`, {
                          defaultValue: performance.publicationStatus,
                        })
                      : t('concert-directory:publicationMissing')}
                  </dd>
                </div>
                <div>
                  <dt>{t('shared:releaseSaleAt')}</dt>
                  <dd>{displayTime(performance.saleStartAt, performance.timezone)}</dd>
                </div>
                {(
                  [
                    ['performances:ticketing', performance.ticketingAcknowledged],
                    ['performances:checkin', performance.checkinAcknowledged],
                  ] as const
                ).map(([label, synced]) => (
                  <div key={label}>
                    <dt>{t(label)}</dt>
                    <dd>
                      {synced === null
                        ? '—'
                        : t(synced ? 'performances:synced' : 'performances:notSynced')}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="admin-page-actions">
                {review && (
                  <Link className="admin-primary-action" to={review}>
                    {t('concert-directory:openReview')}
                  </Link>
                )}
                {operations && (
                  <Link className="admin-secondary-action" to={operations}>
                    {t('concert-directory:openOperations')}
                  </Link>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
