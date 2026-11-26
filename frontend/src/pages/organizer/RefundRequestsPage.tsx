import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import {
  approveRefundRequest,
  getOrganizerRefundRequests,
  rejectRefundRequest,
  type ManagedRefundRequest,
  type ManagedRefundRequestPage,
  type RefundRequestStatus,
} from '../../api/refundRequests';
import { currency, dateFormatter } from '../../data/formatters';
import { REASON_MAX_LENGTH } from '../../features/refund/refundRequest';
import './WorkspaceRecords.css';

const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

type Tab = 'waiting' | 'approved' | 'all';
const tabs: Array<{ id: Tab; statuses: RefundRequestStatus[]; label: string }> = [
  { id: 'waiting', statuses: ['REQUESTED'], label: 'organizer:refundQueue_tabWaiting' },
  { id: 'approved', statuses: ['APPROVED'], label: 'organizer:refundQueue_tabApproved' },
  { id: 'all', statuses: [], label: 'organizer:refundQueue_tabAll' },
];

const statusKeys: Record<RefundRequestStatus, string> = {
  REQUESTED: 'organizer:refundQueue_status_REQUESTED',
  APPROVED: 'organizer:refundQueue_status_APPROVED',
  REJECTED: 'organizer:refundQueue_status_REJECTED',
  WITHDRAWN: 'organizer:refundQueue_status_WITHDRAWN',
  REFUNDED: 'organizer:refundQueue_status_REFUNDED',
  FAILED: 'organizer:refundQueue_status_FAILED',
};

function messageOf(error: unknown, fallback: string) {
  return error instanceof ApiClientError && error.message ? error.message : fallback;
}

/** Refund requests for the selected organization's events: approve, or decline with a note. */
export function RefundRequestsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('waiting');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<ManagedRefundRequestPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const noteId = useId();

  useEffect(() => {
    const controller = new AbortController();
    const statuses = tabs.find((item) => item.id === tab)?.statuses ?? [];
    getOrganizerRefundRequests(statuses, page, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setResult(loaded);
        setFailed(false);
      })
      .catch((error) => {
        if (controller.signal.aborted || isRequestCanceled(error)) return;
        if (error instanceof ApiClientError && error.status === 403) setDenied(true);
        else setFailed(true);
      });
    return () => controller.abort();
  }, [tab, page, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  function choose(next: Tab) {
    setTab(next);
    setPage(0);
    setResult(null);
    setRejecting(null);
    setNotice(null);
  }

  async function approve(item: ManagedRefundRequest) {
    if (busy) return;
    setBusy(item.id);
    setNotice(null);
    try {
      await approveRefundRequest(item.id);
      setNotice({ tone: 'success', text: t('organizer:refundQueue_approved') });
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error, t('organizer:refundQueue_actionFailed')) });
    } finally {
      setBusy(null);
      reload();
    }
  }

  async function reject(event: FormEvent, item: ManagedRefundRequest) {
    event.preventDefault();
    if (busy || !note.trim()) return;
    setBusy(item.id);
    setNotice(null);
    try {
      await rejectRefundRequest(item.id, note.trim());
      setNotice({ tone: 'success', text: t('organizer:refundQueue_rejected') });
      setRejecting(null);
      setNote('');
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error, t('organizer:refundQueue_actionFailed')) });
    } finally {
      setBusy(null);
      reload();
    }
  }

  if (denied) {
    return (
      <div className="workspace-records-panel">
        <p role="alert">{t('organizer:refundQueue_denied')}</p>
      </div>
    );
  }

  return (
    <div className="workspace-records">
      <header className="workspace-records-header">
        <div>
          <h1>{t('organizer:refundQueue_title')}</h1>
          <p className="workspace-records-field-note">{t('organizer:refundQueue_intro')}</p>
        </div>
      </header>

      <div
        className="workspace-records-toolbar"
        role="group"
        aria-label={t('organizer:refundQueue_filter')}
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'admin-primary-action' : 'admin-secondary-action'}
            aria-pressed={tab === item.id}
            onClick={() => choose(item.id)}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {notice ? (
        <p
          className={notice.tone === 'error' ? 'admin-notice error' : 'admin-notice'}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      ) : null}

      {failed ? (
        <div className="workspace-records-panel">
          <p role="alert">{t('organizer:refundQueue_loadFailed')}</p>
          <button className="admin-secondary-action" type="button" onClick={reload}>
            {t('organizer:refundQueue_retry')}
          </button>
        </div>
      ) : !result ? (
        <p role="status">{t('organizer:refundQueue_loading')}</p>
      ) : result.content.length === 0 ? (
        <section className="workspace-records-panel">
          <p>
            {t(
              tab === 'waiting'
                ? 'organizer:refundQueue_emptyWaiting'
                : 'organizer:refundQueue_empty',
            )}
          </p>
        </section>
      ) : (
        <section className="workspace-records-panel" aria-label={t('organizer:refundQueue_title')}>
          <div
            className="admin-table-wrap"
            tabIndex={0}
            role="region"
            aria-label={t('organizer:refundQueue_title')}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('organizer:refundQueue_colOrder')}</th>
                  <th>{t('organizer:refundQueue_colReason')}</th>
                  <th>{t('organizer:refundQueue_colRequested')}</th>
                  <th>{t('organizer:refundQueue_colStatus')}</th>
                  <th>{t('organizer:refundQueue_colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {result.content.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.concertTitle}</strong>
                      <br />
                      {item.orderReference ?? item.orderId}
                      <br />
                      {currency.format(item.amount)}
                    </td>
                    <td>
                      {item.reason}
                      {item.decisionNote ? (
                        <>
                          <br />
                          <small>
                            {t('organizer:refundQueue_note')}: {item.decisionNote}
                          </small>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <time dateTime={item.createdAt}>
                        {dateTime.format(new Date(item.createdAt))}
                      </time>
                    </td>
                    <td>
                      {t(statusKeys[item.status])}
                      {item.awaitingCase ? (
                        <>
                          <br />
                          <small>{t('organizer:refundQueue_awaitingCase')}</small>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {item.status === 'REQUESTED' || item.awaitingCase ? (
                        rejecting === item.id ? (
                          <form
                            onSubmit={(event) => void reject(event, item)}
                            className="workspace-records-form"
                          >
                            <label className="workspace-records-field" htmlFor={noteId}>
                              {t('organizer:refundQueue_noteLabel')}
                              <textarea
                                id={noteId}
                                value={note}
                                maxLength={REASON_MAX_LENGTH}
                                required
                                onChange={(event) => setNote(event.target.value)}
                              />
                            </label>
                            <button
                              className="admin-primary-action"
                              type="submit"
                              disabled={busy !== null || !note.trim()}
                            >
                              {t('organizer:refundQueue_sendDecline')}
                            </button>
                            <button
                              className="admin-secondary-action"
                              type="button"
                              disabled={busy !== null}
                              onClick={() => setRejecting(null)}
                            >
                              {t('organizer:refundQueue_cancel')}
                            </button>
                          </form>
                        ) : (
                          <div className="workspace-records-toolbar">
                            <button
                              className="admin-primary-action"
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void approve(item)}
                            >
                              <Check size={16} aria-hidden="true" />
                              {item.awaitingCase
                                ? t('organizer:refundQueue_retryHandoff')
                                : t('organizer:refundQueue_approve')}
                            </button>
                            {item.status === 'REQUESTED' ? (
                              <button
                                className="admin-secondary-action"
                                type="button"
                                disabled={busy !== null}
                                onClick={() => {
                                  setRejecting(item.id);
                                  setNote('');
                                  setNotice(null);
                                }}
                              >
                                <X size={16} aria-hidden="true" />
                                {t('organizer:refundQueue_decline')}
                              </button>
                            ) : null}
                          </div>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.totalPages > 1 ? (
            <nav
              className="workspace-records-toolbar"
              aria-label={t('organizer:refundQueue_pages')}
            >
              <button
                className="admin-secondary-action"
                type="button"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                {t('organizer:refundQueue_previous')}
              </button>
              <span>
                {t('organizer:refundQueue_page', { page: page + 1, total: result.totalPages })}
              </span>
              <button
                className="admin-secondary-action"
                type="button"
                disabled={page + 1 >= result.totalPages}
                onClick={() => setPage(page + 1)}
              >
                {t('organizer:refundQueue_next')}
              </button>
            </nav>
          ) : null}
        </section>
      )}
    </div>
  );
}
