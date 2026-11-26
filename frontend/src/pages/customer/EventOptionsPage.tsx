import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { getEventOptions, type EventOptions } from '../../api/refundRequests';
import { BuyerState } from '../../components/feedback/BuyerState';
import { DetailSkeleton } from '../../components/feedback/Skeleton';
import { currency, dateFormatter } from '../../data/formatters';
import { useAuth } from '../../features/auth/AuthContext';
import { hasKeptTicket, keepTicket, refundStageKey } from '../../features/refund/refundRequest';
import { RefundRequestPanel } from './RefundRequestPanel';
import './RefundRequest.css';

const dateTime = dateFormatter({ dateStyle: 'full', timeStyle: 'short' });

export function EventOptionsPage() {
  const { user } = useAuth();
  const { eventId = '' } = useParams();
  return user ? (
    <EventOptionsView key={user.id + ':' + eventId} eventId={eventId} userId={user.id} />
  ) : null;
}

function EventOptionsView({ eventId, userId }: { eventId: string; userId: string }) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<EventOptions | null>(null);
  const [failure, setFailure] = useState<'notFound' | 'error' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [kept, setKept] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getEventOptions(eventId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setOptions(loaded);
        setKept(
          hasKeptTicket(window.localStorage, userId, eventId, loaded.disruption.newEventDate),
        );
      })
      .catch((error) => {
        if (controller.signal.aborted || isRequestCanceled(error)) return;
        const status = error instanceof ApiClientError ? error.status : 0;
        setFailure(status === 404 || status === 403 ? 'notFound' : 'error');
      });
    return () => controller.abort();
  }, [eventId, userId, attempt]);

  const back = (
    <Link className="ticket-detail-back" to="/my-tickets">
      <ArrowLeft size={18} aria-hidden="true" />
      {t('customer:refundOptions_back')}
    </Link>
  );

  if (failure) {
    return (
      <div className="buyer-page page-width">
        {back}
        <BuyerState
          tone={failure === 'error' ? 'error' : 'empty'}
          title={t(
            failure === 'error'
              ? 'customer:refundOptions_errorTitle'
              : 'customer:refundOptions_noneTitle',
          )}
          actions={
            failure === 'error' ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setFailure(null);
                  setAttempt((value) => value + 1);
                }}
              >
                {t('customer:profilePage_thuLai')}
              </button>
            ) : (
              <Link className="button button-primary" to="/my-tickets">
                {t('customer:refundOptions_back')}
              </Link>
            )
          }
        >
          {t(
            failure === 'error'
              ? 'customer:refundOptions_errorBody'
              : 'customer:refundOptions_noneBody',
          )}
        </BuyerState>
      </div>
    );
  }
  if (!options) {
    return (
      <div className="buyer-page page-width">
        {back}
        <DetailSkeleton rows={3} label={t('customer:refundOptions_loading')} />
      </div>
    );
  }

  const { disruption } = options;
  const cancelled = disruption.kind === 'CANCEL';
  const newDate = disruption.newEventDate ? dateTime.format(new Date(disruption.newEventDate)) : '';

  return (
    <div className="buyer-page page-width refund-options">
      {back}
      <header className="buyer-page-header">
        <div>
          <h1>{t('customer:refundOptions_title', { event: disruption.concertTitle })}</h1>
          <p className="refund-muted">
            {cancelled
              ? t('customer:refundOptions_cancelledIntro')
              : t('customer:refundOptions_postponedIntro', { date: newDate })}
          </p>
        </div>
      </header>

      {!cancelled ? (
        <section className="refund-panel" aria-labelledby="keep-ticket-title">
          <h2 id="keep-ticket-title">{t('customer:refundOptions_keepTitle')}</h2>
          <p className="refund-muted">{t('customer:refundOptions_keepBody', { date: newDate })}</p>
          {kept ? (
            <p className="refund-notice" role="status">
              {t('customer:refundOptions_kept')}
            </p>
          ) : (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                keepTicket(window.localStorage, userId, eventId, disruption.newEventDate);
                setKept(true);
              }}
            >
              {t('customer:refundOptions_keep')}
            </button>
          )}
        </section>
      ) : null}

      <ul className="refund-options-orders" aria-label={t('customer:refundOptions_orders')}>
        {options.orders.map((order) => (
          <li key={order.orderId} className="refund-options-order">
            <div className="refund-options-order-head">
              <strong>
                {t('customer:profilePage_order')} {order.referenceCode ?? order.orderId}
              </strong>
              <span>{currency.format(order.amount)}</span>
            </div>
            {cancelled ? (
              <p role="status">
                <strong>{t(refundStageKey(order.refundStage))}</strong>{' '}
                <span className="refund-muted">
                  {t(`customer:refundOptions_stageHelp_${order.refundStage}`)}
                </span>
              </p>
            ) : (
              <RefundRequestPanel orderId={order.orderId} concertId={eventId} heading="h2" />
            )}
            <Link
              className="refund-muted"
              to={`/account/orders/${encodeURIComponent(order.orderId)}`}
            >
              {t('customer:refundOptions_viewOrder')}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
