import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getManagedCheckinSummary, type CheckinSummary } from '../../api/management/checkin';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import {
  getSalesOnSale,
  getSalesSummary,
  getSalesUpcoming,
  type SalesPerformanceStatus,
  type SalesSummary,
} from '../../api/sales';
import { dashboardTime } from '../operations-dashboard/dashboardContext';
import { formatPercent, integer, money } from './salesFormat';
import { presetRange, reportingToday } from './salesPeriod';
import '../operations-dashboard/dashboard.css';
import './reporting.css';

type Result<T> =
  | { status: 'loading' }
  | { status: 'error'; forbidden: boolean }
  | { status: 'ready'; data: T };

/** Loads one dashboard section on its own, with retry. A failure here never affects the other sections. */
function useSection<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<Result<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ status: 'ready', data });
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted || isRequestCanceled(failure)) return;
        setResult({
          status: 'error',
          forbidden: failure instanceof ApiClientError && failure.status === 403,
        });
      });
    return () => controller.abort();
  }, [load, attempt]);
  const retry = () => {
    setResult({ status: 'loading' });
    setAttempt((value) => value + 1);
  };
  return [result, retry] as const;
}

function Section<T>({
  title,
  result,
  retry,
  action,
  children,
}: {
  title: string;
  result: Result<T>;
  retry: () => void;
  action?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <section className="operations-dashboard-metric" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {result.status === 'loading' && (
        <p className="operations-dashboard-caption" role="status">
          {t('operations-dashboard:loading')}
        </p>
      )}
      {result.status === 'error' && (
        <div className="operations-dashboard-error">
          <p role="alert">
            {t(
              result.forbidden
                ? 'operations-dashboard:forbidden'
                : 'operations-dashboard:loadError',
            )}
          </p>
          <button className="admin-secondary-action" type="button" onClick={retry}>
            {t('operations-dashboard:retry')}
          </button>
        </div>
      )}
      {result.status === 'ready' && children(result.data)}
      {action}
    </section>
  );
}

const salesLink = (extra: Record<string, string> = {}) =>
  '/organizer/reports?' + new URLSearchParams({ view: 'sales', ...extra });

/** Overview sales strip, performances on sale and the next seven days. Money appears only with FINANCE. */
export function OverviewSales({ finance }: { finance: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="operations-dashboard-group" aria-labelledby="organizer-dashboard-sales">
      <h2 id="organizer-dashboard-sales">{t('operations-dashboard:salesTitle')}</h2>
      <div className="operations-dashboard-grid">
        <SalesStrip finance={finance} />
        <OnSaleNow />
        <NextSevenDays />
      </div>
    </section>
  );
}

function SalesStrip({ finance }: { finance: boolean }) {
  const { t } = useTranslation();
  const load = useCallback(async (signal: AbortSignal) => {
    const today = reportingToday();
    const [day, week] = await Promise.all([
      getSalesSummary(presetRange('today', today), signal),
      getSalesSummary(presetRange('last7', today), signal),
    ]);
    return { day, week };
  }, []);
  const [result, retry] = useSection(load);
  return (
    <Section
      title={t('operations-dashboard:salesStrip')}
      result={result}
      retry={retry}
      action={
        <Link className="admin-secondary-action" to={salesLink()}>
          {t('operations-dashboard:openSalesReport')}
        </Link>
      }
    >
      {({ day, week }) => (
        <dl className="sales-strip">
          <Period label={t('operations-dashboard:salesToday')} summary={day} finance={finance} />
          <Period label={t('operations-dashboard:salesLast7')} summary={week} finance={finance} />
        </dl>
      )}
    </Section>
  );
}

function Period({
  label,
  summary,
  finance,
}: {
  label: string;
  summary: SalesSummary;
  finance: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {t('operations-dashboard:salesTickets', { tickets: integer.format(summary.netTickets) })}
      </dd>
      {finance && summary.netSales !== undefined && (
        <dd>
          {t('operations-dashboard:salesNetAmount', { amount: money.format(summary.netSales) })}
        </dd>
      )}
      {finance && summary.grossSales !== undefined && (
        <p className="operations-dashboard-caption">
          {t('operations-dashboard:salesGrossAmount', { amount: money.format(summary.grossSales) })}
        </p>
      )}
    </div>
  );
}

function SellThrough({ item }: { item: SalesPerformanceStatus }) {
  const { t } = useTranslation();
  if (item.sellThrough === undefined) return null;
  return (
    <>
      <p>
        {t('operations-dashboard:sellThrough', {
          percent: formatPercent(item.sellThrough),
          sold: integer.format(item.netTickets),
          capacity: integer.format(item.capacity ?? 0),
        })}
      </p>
      <span
        className="sales-bar"
        role="progressbar"
        aria-label={t('operations-dashboard:sellThroughLabel', { title: item.title })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(item.sellThrough))}
      >
        <span style={{ inlineSize: `${Math.min(100, item.sellThrough)}%` }} />
      </span>
    </>
  );
}

function OnSaleNow() {
  const { t } = useTranslation();
  const load = useCallback((signal: AbortSignal) => getSalesOnSale(signal), []);
  const [result, retry] = useSection(load);
  return (
    <Section title={t('operations-dashboard:salesOnSaleNow')} result={result} retry={retry}>
      {(items) =>
        items.length === 0 ? (
          <p className="operations-dashboard-caption">{t('operations-dashboard:noOnSale')}</p>
        ) : (
          <ul className="operations-dashboard-records">
            {items.map((item) => (
              <li key={item.performanceId}>
                <Link to={salesLink({ eventId: item.eventId, performanceId: item.performanceId })}>
                  {item.title}
                </Link>
                <SellThrough item={item} />
              </li>
            ))}
          </ul>
        )
      }
    </Section>
  );
}

type Upcoming = { item: SalesPerformanceStatus; checkin: CheckinSummary | null };

function NextSevenDays() {
  const { t } = useTranslation();
  const load = useCallback(async (signal: AbortSignal): Promise<Upcoming[]> => {
    const items = await getSalesUpcoming(7, signal);
    return Promise.all(
      items.map(async (item) => ({
        item,
        checkin: await getManagedCheckinSummary(item.performanceId, signal, 'organizer').catch(
          () => null,
        ),
      })),
    );
  }, []);
  const [result, retry] = useSection(load);
  return (
    <Section title={t('operations-dashboard:nextSevenDays')} result={result} retry={retry}>
      {(rows) =>
        rows.length === 0 ? (
          <p className="operations-dashboard-caption">{t('operations-dashboard:noUpcoming')}</p>
        ) : (
          <ul className="operations-dashboard-records">
            {rows.map(({ item, checkin }) => (
              <li key={item.performanceId}>
                <Link to={salesLink({ eventId: item.eventId, performanceId: item.performanceId })}>
                  {item.title}
                </Link>
                <p>
                  <time dateTime={item.startsAt}>
                    {dashboardTime.format(new Date(item.startsAt))}
                  </time>
                </p>
                <p>
                  {checkin
                    ? t('operations-dashboard:checkedIn', {
                        checked: integer.format(checkin.checkedIn),
                        total: integer.format(checkin.validTickets + checkin.usedTickets),
                      })
                    : t('operations-dashboard:checkinUnavailable')}
                </p>
              </li>
            ))}
          </ul>
        )
      }
    </Section>
  );
}
