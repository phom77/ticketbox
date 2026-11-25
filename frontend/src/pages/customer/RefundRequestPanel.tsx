import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Undo2 } from 'lucide-react';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import {
  getRefundRequestState,
  requestRefund,
  withdrawRefundRequest,
  type RefundRequestState,
} from '../../api/refundRequests';
import { dateFormatter } from '../../data/formatters';
import {
  REASON_MAX_LENGTH,
  blockerNeedsOptionsLink,
  decidedStepKey,
  isOpenRequest,
  refundBlockerKey,
  refundStatusKey,
  refundSteps,
  validRefundReason,
} from '../../features/refund/refundRequest';
import './RefundRequest.css';

const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

function messageOf(error: unknown, fallback: string) {
  return error instanceof ApiClientError && error.message ? error.message : fallback;
}

/**
 * Refund status and actions for one order: ask for a refund with a reason, follow the request
 * from Requested to Refunded, or withdraw it before the organizer decides.
 */
export function RefundRequestPanel({
  orderId,
  concertId,
  heading = 'h2',
}: {
  orderId: string;
  concertId?: string | null;
  heading?: 'h2' | 'h3';
}) {
  const { t } = useTranslation();
  const Heading = heading;
  const [state, setState] = useState<RefundRequestState | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const reasonId = useId();
  const helpId = useId();
  const titleId = useId();

  useEffect(() => {
    const controller = new AbortController();
    getRefundRequestState(orderId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setState(loaded);
        setFailed(false);
      })
      .catch((error) => {
        if (controller.signal.aborted || isRequestCanceled(error)) return;
        setFailed(true);
      });
    return () => controller.abort();
  }, [orderId, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !validRefundReason(reason)) return;
    setBusy(true);
    setNotice(null);
    try {
      await requestRefund(orderId, reason.trim());
      setNotice({ tone: 'success', text: t('customer:refund_sent') });
      setOpen(false);
      setReason('');
      reload();
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error, t('customer:refund_sendFailed')) });
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(requestId: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await withdrawRefundRequest(orderId, requestId);
      setNotice({ tone: 'success', text: t('customer:refund_withdrawn') });
      reload();
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error, t('customer:refund_withdrawFailed')) });
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (failed && !state) {
    return (
      <section className="refund-panel order-detail-noprint" aria-labelledby={titleId}>
        <Heading id={titleId}>{t('customer:refund_title')}</Heading>
        <p>{t('customer:refund_unavailable')}</p>
        <button className="button button-secondary" type="button" onClick={reload}>
          {t('customer:profilePage_thuLai')}
        </button>
      </section>
    );
  }
  if (!state) return null;

  const request = state.request ?? null;
  const blockerKey = refundBlockerKey(state.blockedReason);
  const showBlocker = !request || !isOpenRequest(request);
  if (!request && !state.canRequest && !blockerKey && !notice) return null;
  // Orders that were never refundable (not paid, nothing left to refund) stay quiet.
  if (
    !request &&
    !state.canRequest &&
    ['NOT_PAID', 'NO_TICKETS'].includes(state.blockedReason ?? '')
  ) {
    return null;
  }
  const deadline = state.deadline ? dateTime.format(new Date(state.deadline)) : '';
  const postponed = state.origin === 'POSTPONEMENT';

  return (
    <section className="refund-panel order-detail-noprint" aria-labelledby={titleId}>
      <div className="refund-head">
        <Heading id={titleId}>{t('customer:refund_title')}</Heading>
        {request ? (
          <span className="refund-chip" data-status={request.status}>
            {t(refundStatusKey(request.status, request.origin))}
          </span>
        ) : null}
      </div>

      {request ? (
        <>
          <ol className="refund-steps" aria-label={t('customer:refund_progress')}>
            {refundSteps(request).map((step) => (
              <li key={step.key} data-state={step.state}>
                <strong>
                  {step.key === 'decided'
                    ? t(decidedStepKey(request))
                    : t(
                        step.key === 'requested'
                          ? 'customer:refund_step_requested'
                          : 'customer:refund_step_refunded',
                      )}
                </strong>
                {step.key === 'requested' ? (
                  <small>
                    <time dateTime={request.createdAt}>
                      {dateTime.format(new Date(request.createdAt))}
                    </time>
                  </small>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="refund-reason">{request.reason}</p>
          {request.status === 'REJECTED' && request.decisionNote ? (
            <p>
              <strong>{t('customer:refund_organizerNote')}</strong> {request.decisionNote}
            </p>
          ) : null}
          {request.status === 'REQUESTED' ? (
            <p className="refund-muted">{t('customer:refund_waitingOrganizer')}</p>
          ) : null}
          {request.status === 'APPROVED' ? (
            <p className="refund-muted">
              {t(
                request.origin === 'POSTPONEMENT'
                  ? 'customer:refund_waitingPlatformPostponed'
                  : 'customer:refund_waitingPlatform',
              )}
            </p>
          ) : null}
          {request.status === 'FAILED' ? (
            <p className="refund-muted">{t('customer:refund_failedHelp')}</p>
          ) : null}
          {request.canWithdraw ? (
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => void withdraw(request.id)}
            >
              <Undo2 size={18} aria-hidden="true" />
              {busy ? t('customer:refund_withdrawing') : t('customer:refund_withdraw')}
            </button>
          ) : null}
        </>
      ) : null}

      {showBlocker && !state.canRequest && blockerKey ? (
        <p className="refund-muted">
          {t(blockerKey)}{' '}
          {blockerNeedsOptionsLink(state.blockedReason) && concertId ? (
            <Link to={`/my-tickets/events/${encodeURIComponent(concertId)}/options`}>
              {t('customer:refund_seeOptions')}
            </Link>
          ) : null}
        </p>
      ) : null}

      {state.canRequest && !open ? (
        <>
          {!request ? (
            <p className="refund-muted">
              {postponed
                ? t('customer:refund_introPostponed', { date: deadline })
                : t('customer:refund_intro', { date: deadline })}
            </p>
          ) : null}
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              setNotice(null);
              setOpen(true);
            }}
          >
            {t('customer:refund_request')}
          </button>
        </>
      ) : null}

      {state.canRequest && open ? (
        <form className="refund-form" onSubmit={(event) => void submit(event)} noValidate>
          <label htmlFor={reasonId}>{t('customer:refund_reasonLabel')}</label>
          <textarea
            id={reasonId}
            value={reason}
            maxLength={REASON_MAX_LENGTH}
            required
            aria-describedby={helpId}
            onChange={(event) => setReason(event.target.value)}
          />
          <ul className="refund-rules" id={helpId}>
            <li>{t('customer:refund_ruleFullOrder')}</li>
            <li>
              {postponed
                ? t('customer:refund_rulePostponed', { date: deadline })
                : t('customer:refund_ruleWindow', { date: deadline })}
            </li>
            <li>
              {postponed ? t('customer:refund_rulePlatform') : t('customer:refund_ruleOrganizer')}
            </li>
            <li>{t('customer:refund_ruleTickets')}</li>
          </ul>
          <div className="refund-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={busy || !validRefundReason(reason)}
            >
              {busy ? t('customer:refund_sending') : t('customer:refund_send')}
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t('customer:refund_cancelForm')}
            </button>
          </div>
        </form>
      ) : null}

      {notice ? (
        <p
          className={notice.tone === 'error' ? 'refund-error' : 'refund-notice'}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
