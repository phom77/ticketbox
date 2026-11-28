import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getStaffCheckinHistory,
  type StaffCheckinHistory,
  type StaffPerformance,
} from '../../api/admin';
import { isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { StaffAccessGate } from './StaffAccessGate';
import { staffDateTime } from './staffPageUtils';
import './staff.css';

const pageSize = 20;

export function StaffHistoryPage() {
  const { t } = useTranslation();
  return (
    <>
      <AdminPageHeader
        title={t('staff:historyTitle')}
        description={t('staff:historyDescription')}
      />
      <StaffAccessGate select>
        {({ performance, reportDenied }) =>
          performance ? (
            <History key={performance.id} performance={performance} reportDenied={reportDenied} />
          ) : null
        }
      </StaffAccessGate>
    </>
  );
}

function History({
  performance,
  reportDenied,
}: {
  performance: StaffPerformance;
  reportDenied: (failure: unknown) => boolean;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState<StaffCheckinHistory[] | null>(null);
  const [last, setLast] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    setRows(null);
    getStaffCheckinHistory(performance.id, page, pageSize, controller.signal)
      .then((result) => {
        setRows(result.content);
        setLast(result.last);
      })
      .catch((failure) => {
        if (isRequestCanceled(failure) || controller.signal.aborted) return;
        if (!reportDenied(failure)) setFailed(true);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performance.id, page, attempt]);

  return (
    <section className="staff-panel">
      {failed ? (
        <div role="alert">
          <p>{t('staff:historyFailed')}</p>
          <button
            className="admin-secondary-action"
            type="button"
            onClick={() => setAttempt((v) => v + 1)}
          >
            {t('staff:retry')}
          </button>
        </div>
      ) : null}
      {!rows && !failed ? <p role="status">{t('staff:performancesLoading')}</p> : null}
      {rows && !rows.length ? <p>{t('staff:historyEmpty')}</p> : null}
      {rows?.length ? (
        <div className="staff-table-wrap">
          <table>
            <caption className="sr-only">{t('staff:historyCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('staff:colTime')}</th>
                <th scope="col">{t('staff:colGate')}</th>
                <th scope="col">{t('staff:colTicket')}</th>
                <th scope="col">{t('staff:colType')}</th>
                <th scope="col">{t('staff:colMode')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{staffDateTime(row.checkedAt)}</td>
                  <td>{row.gate ?? t('staff:noGate')}</td>
                  <td>{row.referenceCode ?? row.ticketId.slice(0, 8)}</td>
                  <td>{row.ticketTypeName ?? '-'}</td>
                  <td>{row.offline ? t('staff:offline') : t('staff:online')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="staff-pager">
        <button
          type="button"
          className="admin-secondary-action"
          disabled={page === 0}
          onClick={() => setPage((value) => value - 1)}
        >
          {t('staff:previous')}
        </button>
        <span>{t('staff:page', { page: page + 1 })}</span>
        <button
          type="button"
          className="admin-secondary-action"
          disabled={last}
          onClick={() => setPage((value) => value + 1)}
        >
          {t('staff:next')}
        </button>
      </div>
    </section>
  );
}
