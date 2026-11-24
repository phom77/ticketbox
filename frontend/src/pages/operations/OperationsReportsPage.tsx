import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import type { ManagementApiScope } from '../../api/admin';
import { ApiClientError } from '../../api/client';
import {
  getOperationsEvents,
  getOperationsReport,
  type OperationsPage,
  type OperationsPerformanceRow,
} from '../../api/operations';
import { getApprovedOrganizations } from '../../api/organizations';
import { ConcertPicker, type ConcertPickerItem } from '../../components/admin/ConcertPicker';
import { WorkspaceSelect, type WorkspaceSelectOption } from '../../components/WorkspaceSelect';
import { dateFormatter, numberFormatter } from '../../data/formatters';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import { OrganizerRevenuePage } from '../organizer/OrganizerRevenuePage';
import { ReconciliationPage } from '../organizer/ReconciliationPage';
import {
  DEFAULT_PERFORMANCE_TIME_ZONE,
  resolvePerformanceDateTime,
  toPerformanceLocalDateTime,
} from '../organizer/performanceDateTime';
import '../organizer/WorkspaceRecords.css';
import './OperationsReportsPage.css';

const zone = DEFAULT_PERFORMANCE_TIME_ZONE;
const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short', timeZone: zone });
const count = numberFormatter();
const dayInMs = 86400000;
const reportStatuses = [
  'ON_SALE_NOW',
  'UPCOMING',
  'DRAFT',
  'ON_SALE',
  'SOLD_OUT',
  'CANCELLED',
  'COMPLETED',
] as const;
const reviewStatuses = [
  'SUBMITTED',
  'SCHEDULED',
  'CHANGES_REQUESTED',
  'REJECTED',
  'HELD',
  'RELEASED',
  'MISSED',
  'PUBLISHED',
  'ON_SALE',
] as const;
const offsetDateTime =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

type ReportView = 'operations' | 'reconciliation' | 'revenue';

function reportView(param: string | null, defaultView: ReportView): ReportView {
  if (param === 'operations' || param === 'reconciliation' || param === 'revenue') return param;
  return defaultView;
}

function safeReturn(target: string | null, scope: ManagementApiScope) {
  if (!target || !target.startsWith(`/${scope}/`)) return undefined;
  const url = new URL(target, window.location.origin);
  if (url.origin !== window.location.origin) return undefined;
  const path = url.pathname.split('/').filter(Boolean);
  if (
    path[0] !== scope ||
    !['events', 'concerts', 'performance-operations', 'event-review'].includes(path[1])
  )
    return undefined;
  return `${url.pathname}${url.search}${url.hash}`;
}

function performancePath(
  row: OperationsPerformanceRow,
  scope: ManagementApiScope,
  returnTo: string,
) {
  const params = new URLSearchParams({ returnTo });
  if (row.legacyConcertId)
    return `/${scope}/concerts/${encodeURIComponent(row.legacyConcertId)}?${params}`;
  params.set('show', row.id);
  return `/${scope}/events/${encodeURIComponent(row.eventId)}?${params}`;
}

export function OperationsReportsPage({ scope }: { scope: ManagementApiScope }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const organization = useOrganization();
  const organizer = scope === 'organizer';
  const organizationId = organizer ? organization?.selected?.id : undefined;
  const grants = organization?.selected?.grants;
  const operations = !organizer || !!grants?.includes('EVENTS');
  const finance = !organizer || !!grants?.includes('FINANCE');
  const view = reportView(
    params.get('view'),
    !operations && finance ? 'reconciliation' : 'operations',
  );
  const allowed = view === 'operations' ? operations : finance && (view !== 'revenue' || organizer);
  const previous = useRef(organizationId);
  const switchingOrganization = previous.current !== organizationId;
  const resetFilters = switchingOrganization && params.size > (params.has('view') ? 1 : 0);

  useLayoutEffect(() => {
    if (!switchingOrganization) return;
    previous.current = organizationId;
    if (!resetFilters) return;
    setParams(params.has('view') ? { view } : {}, { replace: true });
  }, [organizationId, params, resetFilters, setParams, switchingOrganization, view]);

  const returnTo = allowed && !resetFilters ? safeReturn(params.get('returnTo'), scope) : undefined;
  const concertId = allowed && !resetFilters ? params.get('concertId') : null;
  const reconciliation = new URLSearchParams({ view: 'reconciliation' });
  if (view === 'operations' && concertId) {
    reconciliation.set('concertId', concertId);
    if (returnTo) reconciliation.set('returnTo', returnTo);
  }

  return (
    <div className="workspace-records operations-reports">
      <header className="workspace-records-header operations-reports-header">
        <h1>{t('operations-reports:title')}</h1>
        <div className="workspace-records-actions">
          {returnTo && (
            <Link to={returnTo} className="admin-secondary-action">
              <ArrowLeft size={16} aria-hidden />
              {t('operations-reports:backToConcert')}
            </Link>
          )}
          {organizer && finance && (
            <Link to="/organizer/orders" className="admin-secondary-action">
              {t('operations-reports:orders')}
            </Link>
          )}
        </div>
      </header>
      <nav aria-label={t('operations-reports:views')} className="operations-report-views">
        {operations && (
          <Link
            to={view === 'operations' ? `?${params}` : '?view=operations'}
            aria-current={view === 'operations' ? 'page' : undefined}
          >
            {t('operations-reports:operations')}
          </Link>
        )}
        {finance && (
          <Link
            to={view === 'reconciliation' ? `?${params}` : `?${reconciliation}`}
            aria-current={view === 'reconciliation' ? 'page' : undefined}
          >
            {t('operations-reports:reconciliation')}
          </Link>
        )}
        {organizer && finance && (
          <Link
            to={view === 'revenue' ? `?${params}` : '?view=revenue'}
            aria-current={view === 'revenue' ? 'page' : undefined}
          >
            {t('operations-reports:revenue')}
          </Link>
        )}
      </nav>
      {!allowed ? (
        <ReportAccessNotice scope={scope} area={view === 'operations' ? 'operations' : 'finance'} />
      ) : resetFilters ? (
        <p role="status">{t('operations-reports:loading')}</p>
      ) : view === 'operations' ? (
        <OperationalReport key={organizationId ?? scope} scope={scope} />
      ) : view === 'reconciliation' ? (
        <ReconciliationPage key={organizationId ?? scope} scope={scope} embedded />
      ) : (
        <OrganizerRevenuePage key={organizationId} embedded />
      )}
    </div>
  );
}

function ReportAccessNotice({
  scope,
  area,
}: {
  scope: ManagementApiScope;
  area: 'operations' | 'finance';
}) {
  const { t } = useTranslation();
  return (
    <section className="workspace-records-panel operations-report-message">
      <p role="status">
        {scope === 'admin'
          ? t('operations-reports:unavailableView')
          : t(
              area === 'operations'
                ? 'operations-reports:operationsAccess'
                : 'operations-reports:financeAccess',
            )}
      </p>
      <Link to={`/${scope}`} className="admin-secondary-action">
        {t('operations-reports:backToDashboard')}
      </Link>
    </section>
  );
}

function instantIsValid(value: string | undefined) {
  if (!value) return true;
  const day = value.slice(0, 10);
  const date = Date.parse(`${day}T00:00:00Z`);
  return (
    offsetDateTime.test(value) &&
    !day.startsWith('0000-') &&
    Number.isFinite(date) &&
    new Date(date).toISOString().startsWith(day) &&
    Number.isFinite(Date.parse(value))
  );
}

function pageNumber(value: string | null) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 2147483647 ? number : 0;
}

function readFilters(params: URLSearchParams, scope: ManagementApiScope) {
  return {
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    asOf: params.get('asOf') ?? undefined,
    eventId: params.get('eventId') || undefined,
    concertId: params.get('concertId') || undefined,
    performanceId: params.get('performanceId') || undefined,
    status: params.get('status') || undefined,
    organizationId: scope === 'admin' ? params.get('organizationId') || undefined : undefined,
    page: pageNumber(params.get('page')),
  };
}

type Filters = ReturnType<typeof readFilters>;
type State =
  | { key: string; result: OperationsPage<OperationsPerformanceRow> }
  | { key: string; error: 'loadError' | 'requestPeriod' | 'denied' };

function periodError(filters: Pick<Filters, 'from' | 'to' | 'asOf'>) {
  if (![filters.from, filters.to, filters.asOf].every(instantIsValid)) return 'invalidPeriod';
  if (filters.from && filters.to) {
    const duration = Date.parse(filters.to) - Date.parse(filters.from);
    if (duration <= 0) return 'reversedPeriod';
    if (duration > 366 * dayInMs) return 'rangeTooLong';
  }
  return undefined;
}

function OperationalReport({ scope }: { scope: ManagementApiScope }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params, scope), [params, scope]);
  const [state, setState] = useState<State>();
  const [retry, setRetry] = useState(0);
  const [organizationOptions, setOrganizationOptions] = useState<WorkspaceSelectOption[]>([]);
  const [organizationError, setOrganizationError] = useState(false);
  const invalid = periodError(filters);
  const requestKey = JSON.stringify([filters, retry]);
  const active = state?.key === requestKey ? state : undefined;
  const report = active && 'result' in active ? active.result : undefined;
  const error = active && 'error' in active ? active.error : undefined;
  const firstRow = report?.content[0];

  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController();
    void getOperationsReport(scope, filters, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState({ key: requestKey, result });
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        const status = failure instanceof ApiClientError ? failure.status : undefined;
        setState({
          key: requestKey,
          error: status === 403 ? 'denied' : status === 400 ? 'requestPeriod' : 'loadError',
        });
      });
    return () => controller.abort();
  }, [filters, invalid, requestKey, scope]);

  useEffect(() => {
    if (scope !== 'admin') return;
    const controller = new AbortController();
    void getApprovedOrganizations(controller.signal)
      .then((organizations) => {
        if (!controller.signal.aborted) {
          setOrganizationError(false);
          setOrganizationOptions(organizations.map(({ id, name }) => ({ value: id, label: name })));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setOrganizationError(true);
      });
    return () => controller.abort();
  }, [retry, scope]);

  function apply(next: Omit<Filters, 'page'>) {
    const query = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete('page');
    if (query.toString() === params.toString()) setRetry((value) => value + 1);
    else setParams(query);
  }

  if (error === 'denied') return <ReportAccessNotice scope={scope} area="operations" />;

  return (
    <>
      <OperationalFilters
        key={JSON.stringify({ ...filters, page: 0 })}
        scope={scope}
        filters={filters}
        organizations={organizationOptions}
        organizationError={organizationError}
        reportSelection={
          firstRow && (filters.eventId || filters.concertId)
            ? { id: filters.eventId ?? filters.concertId ?? '', title: firstRow.title }
            : undefined
        }
        performanceLabel={
          firstRow?.startsAt && filters.performanceId === firstRow.id
            ? dateTime.format(new Date(firstRow.startsAt))
            : undefined
        }
        invalid={invalid ?? (error === 'requestPeriod' ? error : undefined)}
        apply={apply}
        retryOrganizations={() => setRetry((value) => value + 1)}
      />
      {!invalid && !active && (
        <p className="workspace-records-panel operations-report-message" role="status">
          {t('operations-reports:loading')}
        </p>
      )}
      {error === 'loadError' && (
        <div className="workspace-records-panel operations-report-message">
          <p role="alert">{t('operations-reports:loadError')}</p>
          <button
            className="admin-secondary-action"
            type="button"
            onClick={() => setRetry((value) => value + 1)}
          >
            {t('operations-reports:retry')}
          </button>
        </div>
      )}
      {report && <OperationalResults report={report} scope={scope} params={params} />}
    </>
  );
}

type FilterProblem = ReturnType<typeof periodError> | 'requestPeriod';

function OperationalFilters({
  scope,
  filters,
  organizations,
  organizationError,
  reportSelection,
  performanceLabel,
  invalid,
  apply,
  retryOrganizations,
}: {
  scope: ManagementApiScope;
  filters: Filters;
  organizations: WorkspaceSelectOption[];
  organizationError: boolean;
  reportSelection?: ConcertPickerItem;
  performanceLabel?: string;
  invalid: FilterProblem;
  apply: (next: Omit<Filters, 'page'>) => void;
  retryOrganizations: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({
    ...filters,
    from: toPerformanceLocalDateTime(filters.from, zone),
    to: toPerformanceLocalDateTime(filters.to, zone),
  });
  const [problem, setProblem] = useState<FilterProblem>();
  const [validated, setValidated] = useState(false);
  const [concertQuery, setConcertQuery] = useState('');
  const [result, setResult] = useState<{
    key: string;
    concerts: ConcertPickerItem[];
    error?: boolean;
  }>();
  const [selection, setSelection] = useState<ConcertPickerItem>();
  const optionKey = JSON.stringify([draft.organizationId, concertQuery]);
  const concerts = result?.key === optionKey ? result.concerts : [];
  const filterProblem = validated ? problem : invalid;
  const concertValue = draft.eventId ?? draft.concertId ?? '';

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        void getOperationsEvents(
          scope,
          { organizationId: draft.organizationId, query: concertQuery, size: 50 },
          controller.signal,
        )
          .then((events) => {
            if (!controller.signal.aborted) {
              setResult({
                key: optionKey,
                concerts: events.content.map(({ id, title }) => ({ id, title })),
              });
            }
          })
          .catch(() => {
            if (!controller.signal.aborted)
              setResult({ key: optionKey, concerts: [], error: true });
          });
      },
      concertQuery ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [scope, concertQuery, draft.organizationId, optionKey]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = resolvePerformanceDateTime(draft.from, zone, filters.from);
    const to = resolvePerformanceDateTime(draft.to, zone, filters.to);
    setValidated(true);
    if (!from.ok || !to.ok) {
      setProblem('invalidPeriod');
      return;
    }
    const next: Omit<Filters, 'page'> = {
      ...draft,
      from: from.instant ?? undefined,
      to: to.instant ?? undefined,
    };
    next.asOf =
      draft.status === filters.status && instantIsValid(filters.asOf) ? filters.asOf : undefined;
    if (draft.status === 'ON_SALE_NOW' && !next.asOf) next.asOf = new Date().toISOString();
    if (draft.status === 'UPCOMING' && !next.from && !next.to) {
      const start = next.asOf ? Date.parse(next.asOf) : Date.now();
      next.from = new Date(start).toISOString();
      next.to = new Date(start + 7 * dayInMs).toISOString();
    }
    const issue = periodError(next);
    setProblem(issue);
    if (!issue) apply(next);
  }

  return (
    <section
      className="workspace-records-panel operations-report-filter-panel"
      aria-labelledby="operations-filter-heading"
    >
      <h2 id="operations-filter-heading">{t('operations-reports:operationalReport')}</h2>
      <form className="operations-report-filters" noValidate onSubmit={submit}>
        <label className="workspace-records-field">
          {t('operations-reports:from')}
          <input
            type="datetime-local"
            step="1"
            value={draft.from}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            aria-invalid={filterProblem ? true : undefined}
            aria-describedby={
              filterProblem
                ? 'operations-period-note operations-period-error'
                : 'operations-period-note'
            }
          />
        </label>
        <label className="workspace-records-field">
          {t('operations-reports:to')}
          <input
            type="datetime-local"
            step="1"
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            aria-invalid={filterProblem ? true : undefined}
            aria-describedby={
              filterProblem
                ? 'operations-period-note operations-period-error'
                : 'operations-period-note'
            }
          />
        </label>
        <label className="workspace-records-field">
          {t('operations-reports:status')}
          <WorkspaceSelect
            label={t('operations-reports:status')}
            value={draft.status ?? ''}
            onChange={(status) => setDraft({ ...draft, status: status || undefined })}
            options={[
              { value: '', label: t('operations-reports:allStatuses') },
              ...reportStatuses.map((status) => ({
                value: status,
                label: t(`operations-reports:status_${status}`),
              })),
            ]}
          />
        </label>
        {scope === 'admin' && (
          <label className="workspace-records-field">
            {t('operations-reports:organization')}
            <WorkspaceSelect
              label={t('operations-reports:organization')}
              value={draft.organizationId ?? ''}
              onChange={(organizationId) => {
                setSelection(undefined);
                setDraft({
                  ...draft,
                  organizationId: organizationId || undefined,
                  eventId: undefined,
                  concertId: undefined,
                  performanceId: undefined,
                });
              }}
              options={[
                { value: '', label: t('operations-reports:allOrganizations') },
                ...organizations,
              ]}
              placeholder={t('operations-reports:selectedOrganization')}
            />
          </label>
        )}
        <ConcertPicker
          label={t('operations-reports:concert')}
          allLabel={t('operations-reports:allConcerts')}
          placeholder={t('operations-reports:selectedConcert')}
          compact
          allowAll
          concerts={concerts}
          selection={selection ?? reportSelection}
          value={concertValue}
          onSearch={setConcertQuery}
          searching={result?.key !== optionKey}
          searchLabel={t('operations-reports:searchConcerts')}
          onChange={(id) => {
            setSelection(concerts.find((concert) => concert.id === id));
            setDraft({
              ...draft,
              eventId: id || undefined,
              concertId: undefined,
              performanceId: undefined,
            });
          }}
        />
        <button className="admin-primary-action" type="submit">
          {t('operations-reports:applyFilters')}
        </button>
      </form>
      <p id="operations-period-note" className="workspace-records-field-note">
        {t('operations-reports:periodNote')}
      </p>
      {draft.performanceId && (
        <div className="operations-report-context">
          <p>
            {performanceLabel
              ? t('operations-reports:performanceAt', { date: performanceLabel })
              : t('operations-reports:selectedPerformance')}
          </p>
          <button
            type="button"
            className="admin-secondary-action"
            onClick={() => setDraft({ ...draft, performanceId: undefined })}
          >
            {t('operations-reports:clearPerformance')}
          </button>
        </div>
      )}
      {filters.status === 'UPCOMING' && !filters.from && !filters.to && (
        <p className="workspace-records-field-note">{t('operations-reports:upcomingPeriod')}</p>
      )}
      {filters.asOf && instantIsValid(filters.asOf) && (
        <p className="workspace-records-field-note">
          {t('operations-reports:asOf', { date: dateTime.format(new Date(filters.asOf)) })}
        </p>
      )}
      {filterProblem && (
        <p id="operations-period-error" role="alert" className="admin-notice error">
          {t(`operations-reports:${filterProblem}`)}
        </p>
      )}
      {result?.key === optionKey && result.error && (
        <p role="status" className="workspace-records-field-note">
          {t('operations-reports:concertsError')}
        </p>
      )}
      {organizationError && (
        <div className="operations-report-context">
          <p role="status" className="workspace-records-field-note">
            {t('operations-reports:organizationsError')}
          </p>
          <button type="button" className="admin-secondary-action" onClick={retryOrganizations}>
            {t('operations-reports:retry')}
          </button>
        </div>
      )}
    </section>
  );
}

function OperationalResults({
  report,
  scope,
  params,
}: {
  report: OperationsPage<OperationsPerformanceRow>;
  scope: ManagementApiScope;
  params: URLSearchParams;
}) {
  const { t } = useTranslation();
  const root = `/${scope}/reports`;
  const page = report.number;
  function pagePath(index: number) {
    const query = new URLSearchParams(params);
    if (index > 0) query.set('page', String(index));
    else query.delete('page');
    return `?${query}`;
  }
  function syncStatus(acknowledged: boolean | null) {
    return t(
      acknowledged === null
        ? 'operations-reports:noData'
        : acknowledged
          ? 'operations-reports:synced'
          : 'operations-reports:awaitingSync',
    );
  }
  return (
    <section
      className="workspace-records-panel operations-report-results"
      aria-labelledby="operations-results-heading"
    >
      <header className="workspace-records-toolbar">
        <h2 id="operations-results-heading">{t('operations-reports:results')}</h2>
        <p role="status">
          {t('operations-reports:total', {
            count: report.totalElements,
            formatted: count.format(report.totalElements),
          })}
        </p>
      </header>
      {report.content.length ? (
        <div
          className="admin-table-wrap"
          tabIndex={0}
          role="region"
          aria-label={t('operations-reports:results')}
        >
          <table
            className="admin-table operations-report-table"
            aria-labelledby="operations-results-heading"
          >
            <thead>
              <tr>
                <th scope="col">{t('operations-reports:concert')}</th>
                <th scope="col">{t('operations-reports:performance')}</th>
                <th scope="col">{t('operations-reports:performanceTime')}</th>
                <th scope="col">{t('operations-reports:status')}</th>
                <th scope="col">{t('operations-reports:publication')}</th>
                <th scope="col">{t('operations-reports:ticketSync')}</th>
                <th scope="col">{t('operations-reports:checkinSync')}</th>
              </tr>
            </thead>
            <tbody>
              {report.content.map((row) => {
                const startsAt = row.startsAt
                  ? dateTime.format(new Date(row.startsAt))
                  : t('operations-reports:unscheduled');
                const status = reportStatuses.find((value) => value === row.status);
                const review = reviewStatuses.find((value) => value === row.publicationStatus);
                return (
                  <tr key={row.id}>
                    <th scope="row">{row.title}</th>
                    <td>
                      <Link
                        to={performancePath(row, scope, `${root}?${params}`)}
                        aria-label={t('operations-reports:openPerformanceNamed', {
                          title: row.title,
                          date: startsAt,
                        })}
                      >
                        {t('operations-reports:openPerformance')}
                        <ArrowRight size={15} aria-hidden />
                      </Link>
                      <small>{[row.venueName, row.spaceName].filter(Boolean).join(' · ')}</small>
                    </td>
                    <td>
                      {row.startsAt ? <time dateTime={row.startsAt}>{startsAt}</time> : startsAt}
                    </td>
                    <td>
                      {status ? t(`operations-reports:status_${status}`) : row.status}
                      {row.salesSuspended && (
                        <small>{t('operations-reports:salesSuspended')}</small>
                      )}
                    </td>
                    <td>
                      {review
                        ? t(`operations-reports:review_${review}`)
                        : (row.publicationStatus ?? t('operations-reports:noData'))}
                    </td>
                    <td>{syncStatus(row.ticketingAcknowledged)}</td>
                    <td>{syncStatus(row.checkinAcknowledged)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="workspace-records-empty">
          {t(report.totalElements ? 'operations-reports:pageEmpty' : 'operations-reports:empty')}
        </p>
      )}
      {(report.totalPages > 1 || page > 0) && (
        <nav className="reconciliation-pagination" aria-label={t('operations-reports:pagination')}>
          <Link
            className="admin-secondary-action"
            to={pagePath(page - 1)}
            aria-disabled={page <= 0}
            tabIndex={page <= 0 ? -1 : undefined}
            onClick={(event) => {
              if (page <= 0) event.preventDefault();
            }}
          >
            {t('operations-reports:previousPage')}
          </Link>
          <span>
            {t('operations-reports:pageNumber', {
              page: count.format(page + 1),
              total: count.format(Math.max(1, report.totalPages)),
            })}
          </span>
          <Link
            className="admin-secondary-action"
            to={pagePath(page + 1)}
            aria-disabled={page + 1 >= report.totalPages}
            tabIndex={page + 1 >= report.totalPages ? -1 : undefined}
            onClick={(event) => {
              if (page + 1 >= report.totalPages) event.preventDefault();
            }}
          >
            {t('operations-reports:nextPage')}
          </Link>
        </nav>
      )}
    </section>
  );
}
