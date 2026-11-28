import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getManagedCheckinSummary,
  getPerformanceAdmissions,
  type CheckinSummary,
  type PerformanceAdmission,
} from '../../api/management/checkin';
import { getAdmissionStaff, type AdmissionStaff } from '../../api/organizations';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { formatLanguage } from '../../i18n';
import { useOrganization } from '../../features/organizations/OrganizationProvider';

import './checkinPanel.css';

export const checkinRefreshMs = 15_000;

/** Live admission figures for a released performance. Needs the Events permission. */
export function PerformanceCheckinPanel({ id, timezone }: { id: string; timezone: string }) {
  const organization = useOrganization()?.selected;
  if (!organization?.grants.includes('EVENTS')) return null;
  return (
    <CheckinFigures
      key={`${organization.id}:${id}`}
      id={id}
      organizationId={organization.id}
      timezone={timezone}
    />
  );
}

type Figures = { summary: CheckinSummary; admissions: PerformanceAdmission[]; at: Date };

function CheckinFigures({
  id,
  organizationId,
  timezone,
}: {
  id: string;
  organizationId: string;
  timezone: string;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const [figures, setFigures] = useState<Figures | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [staff, setStaff] = useState<Map<string, AdmissionStaff>>(new Map());
  const pending = useRef<AbortController | null>(null);
  const stopped = useRef(false);

  const refresh = useCallback(async () => {
    if (stopped.current || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    try {
      const [summary, admissions] = await Promise.all([
        getManagedCheckinSummary(id, controller.signal, 'organizer'),
        getPerformanceAdmissions(id, 10, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setFigures({ summary, admissions: admissions.content, at: new Date() });
      setFailed(false);
    } catch (failure) {
      if (isRequestCanceled(failure) || controller.signal.aborted) return;
      if (failure instanceof ApiClientError && (failure.status === 403 || failure.status === 404)) {
        stopped.current = true;
        setDenied(true);
      } else {
        setFailed(true);
      }
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, [id]);

  useEffect(() => {
    void refresh();
    let timer: number | undefined;
    function start() {
      window.clearInterval(timer);
      timer = window.setInterval(() => void refresh(), checkinRefreshMs);
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void refresh();
        start();
      } else {
        window.clearInterval(timer);
      }
    }
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
      pending.current?.abort();
      pending.current = null;
    };
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    getAdmissionStaff(organizationId, controller.signal)
      .then((rows) => setStaff(new Map(rows.map((row) => [row.accountId, row]))))
      .catch(() => undefined);
    return () => controller.abort();
  }, [organizationId]);

  const number = new Intl.NumberFormat(formatLanguage());
  const time = (value: string | Date) =>
    new Intl.DateTimeFormat(formatLanguage(), { timeStyle: 'medium', timeZone: timezone }).format(
      new Date(value),
    );

  return (
    <section className="performance-panel" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('performance-checkin:title')}</h2>
      {denied ? <p role="alert">{t('performance-checkin:accessLost')}</p> : null}
      {!figures && !failed && !denied ? (
        <p role="status">{t('performance-checkin:loading')}</p>
      ) : null}
      {failed && !denied ? (
        <div role="alert">
          <p>{t('performance-checkin:failed')}</p>
          <button type="button" className="button button-secondary" onClick={() => void refresh()}>
            {t('performance-checkin:retry')}
          </button>
        </div>
      ) : null}
      {figures ? (
        <FigureDetails
          figures={figures}
          stale={failed || denied}
          staffName={(staffId) =>
            staff.get(staffId)?.fullName ?? t('performance-checkin:staffUnknown')
          }
          format={{ number: (value) => number.format(value), time }}
          timezone={timezone}
          onRefresh={() => void refresh()}
          disabled={denied}
        />
      ) : null}
    </section>
  );
}

function FigureDetails({
  figures,
  stale,
  staffName,
  format,
  timezone,
  onRefresh,
  disabled,
}: {
  figures: Figures;
  stale: boolean;
  staffName: (staffId: string) => string;
  format: { number: (value: number) => string; time: (value: string | Date) => string };
  timezone: string;
  onRefresh: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { summary, admissions, at } = figures;
  const total = summary.validTickets + summary.usedTickets;
  const percent = total ? Math.min(100, Math.round((summary.checkedIn / total) * 100)) : 0;
  return (
    <div data-stale={stale || undefined}>
      <p>
        <strong>
          {t('performance-checkin:admittedOf', {
            checked: format.number(summary.checkedIn),
            total: format.number(total),
          })}
        </strong>
      </p>
      <div
        role="progressbar"
        aria-label={t('performance-checkin:progress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="checkin-progress"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <dl className="publication-status">
        <div>
          <dt>{t('performance-checkin:online')}</dt>
          <dd>{format.number(summary.onlineCheckins)}</dd>
        </div>
        <div>
          <dt>{t('performance-checkin:offline')}</dt>
          <dd>{format.number(summary.offlineCheckins)}</dd>
        </div>
        <div>
          <dt>{t('performance-checkin:guests')}</dt>
          <dd>
            {t('performance-checkin:guestsOf', {
              checked: format.number(summary.guestsCheckedIn),
              total: format.number(summary.guestsTotal),
            })}
          </dd>
        </div>
      </dl>
      <small>{t('performance-checkin:guestsNote')}</small>
      <h3>{t('performance-checkin:perGate')}</h3>
      {summary.gates.length ? (
        <ul className="performance-list">
          {summary.gates.map((entry) => (
            <li key={entry.gate ?? '__none'}>
              {entry.gate ?? t('performance-checkin:noGate')}: {format.number(entry.checkedIn)}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('performance-checkin:noGates')}</p>
      )}
      <h3>{t('performance-checkin:recent')}</h3>
      {admissions.length ? (
        <div className="checkin-recent">
          <table>
            <caption className="sr-only">{t('performance-checkin:recentCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('performance-checkin:colTime')}</th>
                <th scope="col">{t('performance-checkin:colGate')}</th>
                <th scope="col">{t('performance-checkin:colTicket')}</th>
                <th scope="col">{t('performance-checkin:colType')}</th>
                <th scope="col">{t('performance-checkin:colStaff')}</th>
              </tr>
            </thead>
            <tbody>
              {admissions.map((row) => (
                <tr key={row.id}>
                  <td>{format.time(row.checkedAt)}</td>
                  <td>{row.gate ?? t('performance-checkin:noGate')}</td>
                  <td>{row.referenceCode ?? row.ticketId.slice(0, 8)}</td>
                  <td>{row.ticketTypeName ?? '-'}</td>
                  <td>{staffName(row.staffId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>{t('performance-checkin:noRecent')}</p>
      )}
      {/* Not a live region: a routine refresh every 15 seconds must not be announced. A failed
          refresh or lost access is announced by the alert above. */}
      <p>
        {stale
          ? t('performance-checkin:stale', { time: format.time(at) })
          : t('performance-checkin:updated', { time: format.time(at) })}
      </p>
      <small>{t('performance-checkin:timesIn', { timezone })}</small>
      <button
        type="button"
        className="button button-secondary"
        disabled={disabled}
        onClick={onRefresh}
      >
        {t('performance-checkin:refresh')}
      </button>
    </div>
  );
}
