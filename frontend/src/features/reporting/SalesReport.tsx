import { Download, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { getOperationsEvents } from '../../api/operations';
import {
  exportSalesReport,
  getSalesBreakdown,
  getSalesSummary,
  getSalesTrend,
  type SalesBreakdown,
  type SalesBreakdownRow,
  type SalesGrouping,
  type SalesQuery,
  type SalesSummary,
  type SalesTrend,
} from '../../api/sales';
import { ConcertPicker, type ConcertPickerItem } from '../../components/admin/ConcertPicker';
import { useToast } from '../../components/feedback/toast-context';
import { dateFormatter } from '../../data/formatters';
import { bucketPoints, formatPercent, integer, money } from './salesFormat';
import {
  periodDays,
  periodError,
  periodPresets,
  presetOf,
  presetRange,
  reportingToday,
  type PeriodPreset,
} from './salesPeriod';
import { TrendChart } from './TrendChart';
import './reporting.css';

const startTime = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const allowedGroupings = (days: number): SalesGrouping[] =>
  days <= 7 ? ['hour', 'day', 'week'] : days <= 366 ? ['day', 'week'] : ['week'];

type Loaded = {
  key: string;
  summary: SalesSummary;
  trend: SalesTrend;
  performances: SalesBreakdown;
  offers?: SalesBreakdown;
};
type State = { key: string; error: 'load' | 'denied' | 'period' | 'notFound' } | Loaded | undefined;

/** Reports › Sales: live sales for the organization, one event or one performance. */
export function SalesReport({ finance }: { finance: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const today = useMemo(() => reportingToday(), []);
  const eventId = params.get('eventId') ?? '';
  const performanceId = params.get('performanceId') ?? '';
  const defaults = presetRange('last7', today);
  const from = params.get('from') ?? defaults.from;
  const to = params.get('to') ?? defaults.to;
  const groupBy = (params.get('groupBy') as SalesGrouping | null) ?? undefined;
  const error = periodError(from, to);
  const preset = presetOf(from, to, today);
  const [custom, setCustom] = useState(preset === 'custom');
  const [draft, setDraft] = useState({ from, to });
  const [draftError, setDraftError] = useState<ReturnType<typeof periodError>>();
  const [state, setState] = useState<State>();
  const [attempt, setAttempt] = useState(0);
  const [events, setEvents] = useState<ConcertPickerItem[]>([]);
  const [eventsError, setEventsError] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [performanceOptions, setPerformanceOptions] = useState<SalesBreakdownRow[]>([]);
  const [exporting, setExporting] = useState<'csv' | 'pdf'>();
  const exportRequest = useRef<AbortController>();

  const scope: SalesQuery = useMemo(
    () => ({ from, to, eventId: eventId || undefined, performanceId: performanceId || undefined }),
    [from, to, eventId, performanceId],
  );
  const key = `${eventId}|${performanceId}|${from}|${to}|${groupBy ?? ''}|${attempt}`;

  const update = useCallback(
    (changes: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params);
      for (const [name, value] of Object.entries(changes)) {
        if (value) next.set(name, value);
        else next.delete(name);
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  // Event choices come from the event directory and follow the search text.
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getOperationsEvents(
        'organizer',
        { query: eventSearch.trim() || undefined, size: 20 },
        controller.signal,
      )
        .then((page) => {
          setEventsError(false);
          setEvents(page.content.map((event) => ({ id: event.id, title: event.title })));
        })
        .catch((failure: unknown) => {
          if (!isRequestCanceled(failure)) setEventsError(true);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [eventSearch]);

  // The performances of the chosen event populate the performance choice.
  useEffect(() => {
    if (!eventId || error) {
      setPerformanceOptions([]);
      return;
    }
    const controller = new AbortController();
    getSalesBreakdown({ eventId, from, to }, 'performance', controller.signal)
      .then((breakdown) => setPerformanceOptions(breakdown.rows))
      .catch(() => undefined);
    return () => controller.abort();
  }, [eventId, from, to, error]);

  useEffect(() => {
    if (error) return;
    const controller = new AbortController();
    const scoped = !!eventId || !!performanceId;
    Promise.all([
      getSalesSummary(scope, controller.signal),
      getSalesTrend(scope, groupBy, controller.signal),
      getSalesBreakdown(scope, 'performance', controller.signal),
      scoped ? getSalesBreakdown(scope, 'offer', controller.signal) : Promise.resolve(undefined),
    ])
      .then(([summary, trend, performances, offers]) => {
        if (!controller.signal.aborted) setState({ key, summary, trend, performances, offers });
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || isRequestCanceled(failure)) return;
        const status = failure instanceof ApiClientError ? failure.status : 0;
        setState({
          key,
          error:
            status === 403
              ? 'denied'
              : status === 404
                ? 'notFound'
                : status === 400
                  ? 'period'
                  : 'load',
        });
      });
    return () => controller.abort();
  }, [scope, groupBy, key, error, eventId, performanceId]);

  const current = state && state.key === key ? state : undefined;
  const loaded = current && 'summary' in current ? current : undefined;
  const days = error ? 1 : periodDays(from, to);

  function choosePreset(next: PeriodPreset) {
    if (next === 'custom') {
      setCustom(true);
      setDraft({ from, to });
      return;
    }
    setCustom(false);
    setDraftError(undefined);
    update({ ...presetRange(next, today), groupBy: undefined });
  }

  function applyDates(event: FormEvent) {
    event.preventDefault();
    const failure = periodError(draft.from, draft.to);
    setDraftError(failure);
    if (!failure) update({ from: draft.from, to: draft.to, groupBy: undefined });
  }

  async function download(format: 'csv' | 'pdf') {
    const controller = new AbortController();
    exportRequest.current?.abort();
    exportRequest.current = controller;
    setExporting(format);
    try {
      const blob = await exportSalesReport(scope, format, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sales-${from}-to-${to}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      if (!controller.signal.aborted) toast.error(t('operations-reports:salesExportError'));
      void failure;
    } finally {
      if (!controller.signal.aborted) setExporting(undefined);
    }
  }
  useEffect(() => () => exportRequest.current?.abort(), []);

  const selectedEvent: ConcertPickerItem | undefined = eventId
    ? {
        id: eventId,
        title: loaded?.summary.scope.name ?? events.find((e) => e.id === eventId)?.title ?? '',
      }
    : undefined;
  const errorText = (failure: 'invalid' | 'reversed' | 'tooLong') =>
    failure === 'tooLong'
      ? t('operations-reports:salesPeriodTooLong', { days: 1096 })
      : t(`operations-reports:salesPeriod_${failure}`);

  return (
    <div className="sales-report">
      <section className="sales-filters" aria-label={t('operations-reports:salesFilters')}>
        <div className="sales-filter-row">
          <div>
            <ConcertPicker
              concerts={events}
              value={eventId}
              onChange={(id) =>
                update({ eventId: id || undefined, performanceId: undefined, groupBy: undefined })
              }
              label={t('operations-reports:salesEvent')}
              placeholder={t('operations-reports:salesAllEvents')}
              allowAll
              allLabel={t('operations-reports:salesAllEvents')}
              selection={selectedEvent}
              onSearch={setEventSearch}
              searchLabel={t('operations-reports:salesSearchEvents')}
            />
            {eventsError && (
              <p className="sales-note" role="status">
                {t('operations-reports:salesEventsError')}
              </p>
            )}
          </div>
          {eventId && (
            <label className="admin-field">
              <span>{t('operations-reports:salesPerformance')}</span>
              <select
                value={performanceId}
                onChange={(event) =>
                  update({ performanceId: event.target.value || undefined, groupBy: undefined })
                }
              >
                <option value="">{t('operations-reports:salesAllPerformances')}</option>
                {performanceOptions.map((row) => (
                  <option key={row.performanceId} value={row.performanceId}>
                    {row.startsAt
                      ? `${row.label} · ${startTime.format(new Date(row.startsAt))}`
                      : row.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div
          className="sales-presets"
          role="group"
          aria-label={t('operations-reports:salesPeriod')}
        >
          {periodPresets.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={
                option === 'custom' ? custom || preset === 'custom' : !custom && preset === option
              }
              onClick={() => choosePreset(option)}
            >
              {t(`operations-reports:salesPreset_${option}`)}
            </button>
          ))}
        </div>
        {(custom || preset === 'custom') && (
          <form className="revenue-date-form" onSubmit={applyDates} noValidate>
            <label className="admin-field">
              <span>{t('operations-reports:salesFrom')}</span>
              <input
                type="date"
                value={draft.from}
                aria-invalid={!!draftError}
                onChange={(event) => setDraft({ ...draft, from: event.target.value })}
              />
            </label>
            <label className="admin-field">
              <span>{t('operations-reports:salesTo')}</span>
              <input
                type="date"
                value={draft.to}
                aria-invalid={!!draftError}
                onChange={(event) => setDraft({ ...draft, to: event.target.value })}
              />
            </label>
            <button className="admin-secondary-action" type="submit">
              {t('operations-reports:salesApply')}
            </button>
          </form>
        )}
        {(draftError || error) && (
          <p className="revenue-date-error" role="alert">
            {errorText((draftError ?? error)!)}
          </p>
        )}
      </section>

      {error ? null : !current ? (
        <p role="status">{t('operations-reports:salesLoading')}</p>
      ) : !loaded ? (
        <div className="state-panel" role="alert">
          <p>{t(`operations-reports:salesError_${(current as { error: string }).error}`)}</p>
          {(current as { error: string }).error === 'denied' ? (
            <Link to="/organizer" className="admin-secondary-action">
              {t('operations-reports:backToDashboard')}
            </Link>
          ) : (
            <button
              className="admin-secondary-action"
              type="button"
              onClick={() => {
                setState(undefined);
                setAttempt((value) => value + 1);
              }}
            >
              <RefreshCw size={16} aria-hidden /> {t('operations-reports:salesRetry')}
            </button>
          )}
        </div>
      ) : (
        <SalesBody
          loaded={loaded}
          finance={finance}
          days={days}
          exporting={exporting}
          onExport={download}
          onGrouping={(next) => update({ groupBy: next })}
        />
      )}
    </div>
  );
}

function SalesBody({
  loaded,
  finance,
  days,
  exporting,
  onExport,
  onGrouping,
}: {
  loaded: Loaded;
  finance: boolean;
  days: number;
  exporting?: 'csv' | 'pdf';
  onExport: (format: 'csv' | 'pdf') => void;
  onGrouping: (value: SalesGrouping) => void;
}) {
  const { t } = useTranslation();
  const { summary, trend, performances, offers } = loaded;
  const empty = summary.ticketsSold === 0 && summary.ticketsRefunded === 0;
  const chosenScope = summary.scope.type !== 'ORGANIZATION';

  return (
    <>
      <p className="sales-note">
        {t('operations-reports:salesTimezone', {
          zone: summary.timezone,
          from: summary.from,
          to: summary.to,
        })}
      </p>
      {summary.provisional && (
        <p className="sales-provisional" role="note">
          {t('operations-reports:salesProvisional')}
        </p>
      )}
      <section className="revenue-summary-grid" aria-label={t('operations-reports:salesSummary')}>
        {summary.netSales !== undefined && (
          <Metric
            label={t('operations-reports:salesNet')}
            value={money.format(summary.netSales)}
            emphasis
          />
        )}
        {summary.grossSales !== undefined && (
          <Metric
            label={t('operations-reports:salesGross')}
            value={money.format(summary.grossSales)}
          />
        )}
        {summary.refunds !== undefined && (
          <Metric
            label={t('operations-reports:salesRefunds')}
            value={money.format(summary.refunds)}
          />
        )}
        <Metric
          label={t('operations-reports:salesTicketsSold')}
          value={integer.format(summary.ticketsSold)}
        />
        <Metric
          label={t('operations-reports:salesTicketsRefunded')}
          value={integer.format(summary.ticketsRefunded)}
        />
        <Metric
          label={t('operations-reports:salesNetTickets')}
          value={integer.format(summary.netTickets)}
        />
        <Metric
          label={t('operations-reports:salesOrders')}
          value={integer.format(summary.orders)}
        />
        {summary.sellThrough !== undefined && (
          <Metric
            label={t('operations-reports:salesSellThrough')}
            value={formatPercent(summary.sellThrough)}
            note={
              summary.capacity !== undefined
                ? t('operations-reports:salesCapacityNote', {
                    capacity: integer.format(summary.capacity),
                  })
                : undefined
            }
          />
        )}
      </section>
      {finance && (
        <div className="sales-actions">
          {(['csv', 'pdf'] as const).map((format) => (
            <button
              key={format}
              className="admin-secondary-action"
              type="button"
              disabled={!!exporting}
              onClick={() => onExport(format)}
            >
              <Download size={16} aria-hidden />
              {t(`operations-reports:salesExport_${format}`)}
            </button>
          ))}
        </div>
      )}
      {empty && <p className="sales-note">{t('operations-reports:salesEmpty')}</p>}
      <section className="revenue-section" aria-labelledby="sales-trend-heading">
        <div className="revenue-section-heading">
          <h2 id="sales-trend-heading">{t('operations-reports:salesTrend')}</h2>
          <label className="admin-field">
            <span>{t('operations-reports:salesGroupBy')}</span>
            <select
              value={trend.groupBy}
              onChange={(event) => onGrouping(event.target.value as SalesGrouping)}
            >
              {allowedGroupings(days).map((option) => (
                <option key={option} value={option}>
                  {t(`operations-reports:salesGroup_${option}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <TrendChart points={bucketPoints(trend.buckets, trend.groupBy)} />
      </section>
      <BreakdownTable
        title={t('operations-reports:salesByPerformance')}
        first={t('operations-reports:salesColPerformance')}
        rows={performances.rows}
        finance={finance}
        sellThrough
      />
      {chosenScope && offers && (
        <BreakdownTable
          title={t('operations-reports:salesByOffer')}
          first={t('operations-reports:salesColTicketType')}
          rows={offers.rows}
          finance={finance}
        />
      )}
    </>
  );
}

function Metric({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={emphasis ? 'is-emphasis' : ''}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function BreakdownTable({
  title,
  first,
  rows,
  finance,
  sellThrough = false,
}: {
  title: string;
  first: string;
  rows: SalesBreakdownRow[];
  finance: boolean;
  sellThrough?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section className="revenue-section" aria-label={title}>
      <div className="revenue-section-heading">
        <h2>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="sales-note">{t('operations-reports:salesEmpty')}</p>
      ) : (
        <div className="sales-table-wrap">
          <table className="sales-table">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">{first}</th>
                <th scope="col">{t('operations-reports:salesColSold')}</th>
                <th scope="col">{t('operations-reports:salesColRefunded')}</th>
                <th scope="col">{t('operations-reports:salesColNet')}</th>
                <th scope="col">{t('operations-reports:salesColOrders')}</th>
                {sellThrough && <th scope="col">{t('operations-reports:salesColSellThrough')}</th>}
                {finance && <th scope="col">{t('operations-reports:salesColGross')}</th>}
                {finance && <th scope="col">{t('operations-reports:salesColRefunds')}</th>}
                {finance && <th scope="col">{t('operations-reports:salesColNetSales')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.performanceId}-${row.key}`}>
                  <th scope="row">
                    {row.label}
                    {(row.detail || row.performanceTitle || row.startsAt) && (
                      <small>
                        {[
                          row.detail,
                          row.performanceTitle,
                          row.startsAt && startTime.format(new Date(row.startsAt)),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    )}
                    {row.provisional && (
                      <small>{t('operations-reports:salesProvisionalRow')}</small>
                    )}
                  </th>
                  <td>{integer.format(row.ticketsSold)}</td>
                  <td>{integer.format(row.ticketsRefunded)}</td>
                  <td>{integer.format(row.netTickets)}</td>
                  <td>{integer.format(row.orders)}</td>
                  {sellThrough && (
                    <td>{row.sellThrough === undefined ? '' : formatPercent(row.sellThrough)}</td>
                  )}
                  {finance && <td>{money.format(row.grossSales ?? 0)}</td>}
                  {finance && <td>{money.format(row.refunds ?? 0)}</td>}
                  {finance && <td>{money.format(row.netSales ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
