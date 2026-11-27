import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { getStaffPerformances, type StaffPerformance } from '../../api/admin';
import { isRequestCanceled } from '../../api/client';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import { isAccessDenied, sortPerformances, splitEarlier, staffDateTime } from './staffPageUtils';

type Listing = {
  key: string;
  status: 'ready' | 'error' | 'denied';
  performances: StaffPerformance[];
};

function useAssignedPerformances(organizationId: string | undefined, revision: number) {
  const [listing, setListing] = useState<Listing | null>(null);
  const key = `${organizationId}:${revision}`;
  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const all: StaffPerformance[] = [];
        for (let page = 0; page < 10; page++) {
          const result = await getStaffPerformances(page, 100, controller.signal);
          all.push(...result.content);
          if (result.last ?? true) break;
        }
        if (!controller.signal.aborted) setListing({ key, status: 'ready', performances: all });
      } catch (failure) {
        if (isRequestCanceled(failure) || controller.signal.aborted) return;
        setListing({
          key,
          status: isAccessDenied(failure) ? 'denied' : 'error',
          performances: [],
        });
      }
    })();
    return () => controller.abort();
  }, [organizationId, key]);
  return listing?.key === key ? listing : null;
}

export type StaffAccessContext = {
  performances: StaffPerformance[];
  performance: StaffPerformance | null;
  /** Call with any failed scoped request. Returns true when access was lost and the page must stop. */
  reportDenied: (failure: unknown) => boolean;
};

function State({
  title,
  body,
  role = 'status',
  children,
}: {
  title: string;
  body?: string;
  role?: 'status' | 'alert';
  children?: ReactNode;
}) {
  return (
    <div className="admin-empty-state" role={role}>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {children}
    </div>
  );
}

/**
 * Explains every state in which staff cannot admit tickets (no organization, no assignment, revoked,
 * unavailable) and only renders its content for a performance the account is assigned to.
 */
export function StaffAccessGate({
  select,
  children,
}: {
  select?: boolean;
  children: (context: StaffAccessContext) => ReactNode;
}) {
  const { t } = useTranslation();
  const organization = useOrganization();
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const [revoked, setRevoked] = useState(false);
  const listing = useAssignedPerformances(organization?.selected?.id, revision);
  const requested = params.get('performance');
  const performances = useMemo(() => listing?.performances ?? [], [listing]);
  const ready = listing?.status === 'ready';
  const known = requested ? performances.find((entry) => entry.id === requested) : undefined;

  useEffect(() => {
    if (!select || !ready || requested || !performances.length) return;
    const { current } = splitEarlier(performances);
    const first = current[0] ?? sortPerformances(performances).slice(-1)[0];
    if (first) setParams({ performance: first.id }, { replace: true });
  }, [select, ready, requested, performances, setParams]);

  if (organization?.loading) return <p role="status">{t('staff:organizationLoading')}</p>;
  if (organization?.error)
    return (
      <State title={t('staff:organizationsFailed')} role="alert">
        <button
          className="admin-secondary-action"
          type="button"
          onClick={() => void organization.reload()}
        >
          {t('staff:retry')}
        </button>
      </State>
    );
  if (!organization?.selected || listing?.status === 'denied')
    return <State title={t('staff:noOrgTitle')} body={t('staff:noOrgBody')} />;
  if (revoked)
    return (
      <State title={t('staff:revokedTitle')} body={t('staff:revokedBody')} role="alert">
        <Link
          className="admin-secondary-action"
          to="/staff"
          onClick={() => {
            setRevoked(false);
            setRevision((value) => value + 1);
          }}
        >
          {t('staff:backToPerformances')}
        </Link>
      </State>
    );
  if (!listing) return <p role="status">{t('staff:performancesLoading')}</p>;
  if (listing.status === 'error')
    return (
      <State title={t('staff:unavailableTitle')} body={t('staff:unavailableBody')} role="alert">
        <button
          className="admin-secondary-action"
          type="button"
          onClick={() => setRevision((value) => value + 1)}
        >
          {t('staff:retry')}
        </button>
      </State>
    );
  if (!performances.length)
    return <State title={t('staff:noAssignmentTitle')} body={t('staff:noAssignmentBody')} />;

  const context = (performance: StaffPerformance | null): StaffAccessContext => ({
    performances,
    performance,
    reportDenied(failure) {
      if (!isAccessDenied(failure)) return false;
      setRevoked(true);
      setParams({}, { replace: true });
      return true;
    },
  });

  if (!select) return <>{children(context(null))}</>;
  if (requested && !known)
    return (
      <State title={t('staff:notAssignedTitle')} body={t('staff:notAssignedBody')} role="alert">
        <Link className="admin-secondary-action" to="/staff">
          {t('staff:backToPerformances')}
        </Link>
      </State>
    );
  if (!known) return <p role="status">{t('staff:performancesLoading')}</p>;
  return (
    <>
      <div className="staff-panel">
        <WorkspaceSelect
          label={t('staff:performance')}
          value={known.id}
          onChange={(id) => setParams({ performance: id })}
          options={sortPerformances(performances).map((entry) => ({
            value: entry.id,
            label: `${entry.title} - ${staffDateTime(entry.eventDate)}`,
          }))}
        />
        <div className="staff-selected-concert">
          <strong>{known.title}</strong>
          <span>{known.venueName}</span>
          <span>{staffDateTime(known.eventDate)}</span>
        </div>
      </div>
      {children(context(known))}
    </>
  );
}
