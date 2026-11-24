import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getOperationsReport } from '../../api/operations';
import { DashboardMetric } from './DashboardMetric';
import { dashboardConcertPath, dashboardTime } from './dashboardContext';

export function PerformanceMetrics({
  scope,
  asOf,
}: {
  scope: 'admin' | 'organizer';
  asOf: string;
}) {
  const { t } = useTranslation();
  const until = new Date(Date.parse(asOf) + 7 * 24 * 60 * 60 * 1000).toISOString();
  const loadOnSale = useCallback(
    (signal: AbortSignal) =>
      getOperationsReport(
        scope,
        {
          status: 'ON_SALE_NOW',
          asOf,
          size: 1,
        },
        signal,
      ),
    [scope, asOf],
  );
  const loadUpcoming = useCallback(
    (signal: AbortSignal) =>
      getOperationsReport(
        scope,
        {
          status: 'UPCOMING',
          asOf,
          from: asOf,
          to: until,
          size: 3,
        },
        signal,
      ),
    [scope, asOf, until],
  );

  return (
    <>
      <DashboardMetric
        title={t('operations-dashboard:onSale')}
        to={`/${scope}/reports?${new URLSearchParams({ view: 'operations', status: 'ON_SALE_NOW', asOf })}`}
        load={loadOnSale}
        empty={t('operations-dashboard:noSales')}
      />
      <DashboardMetric
        title={t('operations-dashboard:nextSevenDays')}
        to={`/${scope}/reports?${new URLSearchParams({ view: 'operations', status: 'UPCOMING', asOf, from: asOf, to: until })}`}
        load={loadUpcoming}
        description={t('operations-dashboard:dateRange', {
          from: dashboardTime.format(new Date(asOf)),
          to: dashboardTime.format(new Date(until)),
        })}
        empty={t('operations-dashboard:noUpcoming')}
        renderItem={(item) => (
          <li key={item.id}>
            <Link to={dashboardConcertPath(scope, item.eventId, item.legacyConcertId, item.id)}>
              {item.title}
            </Link>
            <p>
              {item.startsAt && (
                <>
                  <time dateTime={item.startsAt}>
                    {dashboardTime.format(new Date(item.startsAt))}
                  </time>
                  {' · '}
                </>
              )}
              {t(`operations-reports:status_${item.status}`, { defaultValue: item.status })}
            </p>
          </li>
        )}
      />
    </>
  );
}
