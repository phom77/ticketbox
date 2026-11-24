import { useCallback, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getOperationsReviews } from '../../api/operations';
import { getSupportQueue, type SupportQueueKind } from '../../api/supportQueue';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useAuth } from '../../features/auth/AuthContext';
import { DashboardMetric } from '../../features/operations-dashboard/DashboardMetric';
import { PerformanceMetrics } from '../../features/operations-dashboard/PerformanceMetrics';
import {
  dashboardConcertPath,
  dashboardTime,
} from '../../features/operations-dashboard/dashboardContext';
import { OrderSupportQueue } from './OrderSupportQueue';
import { supportQueueLabels } from './orderSupportKind';

const supportKinds = Object.keys(supportQueueLabels) as SupportQueueKind[];
const loadPendingReviews = (signal: AbortSignal) =>
  getOperationsReviews({ status: 'SUBMITTED', size: 3 }, signal);

function SupportMetric({ kind }: { kind: SupportQueueKind }) {
  const load = useCallback((signal: AbortSignal) => getSupportQueue(kind, 0, signal), [kind]);
  return (
    <DashboardMetric
      title={supportQueueLabels[kind]}
      to={`/admin/orders?support=${kind}`}
      load={load}
    />
  );
}

export function AdminOverviewPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [asOf] = useState(() => new Date().toISOString());
  const [supportRevisions, setSupportRevisions] = useState<
    Partial<Record<SupportQueueKind, number>>
  >({});

  return (
    <>
      <AdminPageHeader
        title={t('admin:adminOverviewPage_chao', {
          arg1: user?.fullName ?? t('admin:adminOverviewPage_ban'),
        })}
        description={t('operations-dashboard:asOf', { time: dashboardTime.format(new Date(asOf)) })}
        actions={
          <Link className="admin-primary-action" to="/admin/concerts?create=1">
            {t('shared:partnerCreateAssisted')}
            <ArrowUpRight aria-hidden="true" size={17} />
          </Link>
        }
      />

      <section className="operations-dashboard-group" aria-labelledby="admin-dashboard-concerts">
        <h2 id="admin-dashboard-concerts">{t('operations-dashboard:concertActivity')}</h2>
        <div className="operations-dashboard-grid">
          <DashboardMetric
            title={t('shared:release_SUBMITTED')}
            to="/admin/event-review?state=SUBMITTED"
            load={loadPendingReviews}
            empty={t('operations-dashboard:noReviews')}
            renderItem={(item) => (
              <li key={`${item.model}:${item.id}`}>
                <Link
                  to={dashboardConcertPath(
                    'admin',
                    item.eventId,
                    item.legacyConcertId,
                    item.performanceId,
                  )}
                >
                  {item.title}
                </Link>
                <p>
                  {t(`shared:release_${item.status}`)}
                  {item.publishAt && (
                    <>
                      {' '}
                      · {t('operations-dashboard:scheduledPublication')}{' '}
                      <time dateTime={item.publishAt}>
                        {dashboardTime.format(new Date(item.publishAt))}
                      </time>
                    </>
                  )}
                </p>
              </li>
            )}
          />
          <PerformanceMetrics scope="admin" asOf={asOf} />
        </div>
      </section>

      <section className="operations-dashboard-group" aria-labelledby="admin-dashboard-support">
        <h2 id="admin-dashboard-support">{t('operations-dashboard:support')}</h2>
        <p className="operations-dashboard-caption">{t('operations-dashboard:supportScope')}</p>
        <div className="operations-dashboard-grid operations-dashboard-support-counts">
          {supportKinds.map((kind) => (
            <SupportMetric key={`${kind}:${supportRevisions[kind] ?? 0}`} kind={kind} />
          ))}
        </div>
        <OrderSupportQueue
          onRetryAccepted={(kind) =>
            setSupportRevisions((current) => ({
              ...current,
              [kind]: (current[kind] ?? 0) + 1,
            }))
          }
        />
      </section>
    </>
  );
}
