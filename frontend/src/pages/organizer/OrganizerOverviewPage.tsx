import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getOperationsEvents } from '../../api/operations';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import { DashboardMetric } from '../../features/operations-dashboard/DashboardMetric';
import { PerformanceMetrics } from '../../features/operations-dashboard/PerformanceMetrics';
import { dashboardConcertPath, dashboardTime } from '../../features/operations-dashboard/dashboardContext';

const loadDrafts = (signal: AbortSignal) => getOperationsEvents('organizer', { status: 'PREPARING', size: 3 }, signal);
const loadChanges = (signal: AbortSignal) => getOperationsEvents('organizer', { status: 'CHANGES_REQUESTED', size: 3 }, signal);

function OrganizerConcertActivity({ name }: { name: string }) {
  const { t } = useTranslation();
  const [asOf] = useState(() => new Date().toISOString());

  return <>
    <AdminPageHeader
      title={name}
      description={t('operations-dashboard:asOf', { time: dashboardTime.format(new Date(asOf)) })}
      actions={
        <Link className="admin-primary-action" to="/organizer/events/new">
          {t('operations-dashboard:createConcert')}
          <ArrowUpRight aria-hidden="true" size={17} />
        </Link>
      }
    />
    <section className="operations-dashboard-group" aria-labelledby="organizer-dashboard-concerts">
      <h2 id="organizer-dashboard-concerts">{t('operations-dashboard:concertActivity')}</h2>
      <div className="operations-dashboard-grid">
        <DashboardMetric
          title={t('operations-dashboard:preparing')}
          to="/organizer/events?status=PREPARING"
          load={loadDrafts}
          empty={t('operations-dashboard:noDrafts')}
          renderItem={(item) => (
            <li key={item.id}>
              <Link to={dashboardConcertPath('organizer', item.id, item.legacyConcertId, item.actionPerformanceId)}>{item.title}</Link>
              <p>{t('operations-dashboard:resumeDraft')}</p>
            </li>
          )}
        />
        <DashboardMetric
          title={t('operations-dashboard:changesRequested')}
          to="/organizer/events?status=CHANGES_REQUESTED"
          load={loadChanges}
          empty={t('operations-dashboard:noChanges')}
          renderItem={(item) => (
            <li key={item.id}>
              <Link to={dashboardConcertPath('organizer', item.id, item.legacyConcertId, item.actionPerformanceId, 'review')}>{item.title}</Link>
              {item.changeReason && <p>{item.changeReason}</p>}
            </li>
          )}
        />
        <PerformanceMetrics scope="organizer" asOf={asOf} />
      </div>
    </section>
  </>;
}

export function OrganizerOverviewPage() {
  const { t } = useTranslation();
  const organization = useOrganization();
  const selected = organization?.selected;
  const canManageEvents = selected?.grants.includes('EVENTS');
  const canReadFinance = selected?.grants.includes('FINANCE');
  const canManageMembers = selected?.grants.includes('MEMBERS');

  return (
    <>
      {canManageEvents && selected ? <OrganizerConcertActivity key={selected.id} name={selected.name} /> : (
        <AdminPageHeader title={selected?.name ?? t('organizer:organizerOverviewPage_toChucCuaBan')}
          description={selected && t('operations-dashboard:eventsGrantRequired')} />
      )}
      {(canReadFinance || canManageMembers) && (
        <section className="operations-dashboard-group" aria-labelledby="organizer-dashboard-workspaces">
          <h2 id="organizer-dashboard-workspaces">{t('operations-dashboard:organizationTools')}</h2>
          <div className="operations-dashboard-links">
            {canReadFinance && <>
              <Link className="admin-secondary-action" to="/organizer/reports?view=reconciliation">{t('operations-dashboard:financialReports')}</Link>
              <Link className="admin-secondary-action" to="/organizer/orders">{t('shared:operationsLayout_donHangVe')}</Link>
            </>}
            {canManageMembers && <Link className="admin-secondary-action" to="/organizer/members">{t('organizer:organizerOverviewPage_thanhVien')}</Link>}
          </div>
        </section>
      )}
    </>
  );
}
