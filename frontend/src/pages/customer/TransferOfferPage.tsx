import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, RefreshCw, X } from 'lucide-react';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import {
  decideTransfer,
  getTransfer,
  type TicketTransfer,
  type TransferAction,
} from '../../api/tickets';
import { BuyerState } from '../../components/feedback/BuyerState';
import { DetailSkeleton } from '../../components/feedback/Skeleton';
import { dateFormatter } from '../../data/formatters';
import { useAuth } from '../../features/auth/AuthContext';
import { seatDescription } from '../../features/performance/checkoutPresentation';
import './TicketDetailPage.css';
import './TicketTransfer.css';

const eventDateTime = dateFormatter({ dateStyle: 'full', timeStyle: 'short' });
const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

export function TransferOfferPage() {
  const { user } = useAuth();
  const { transferId = '' } = useParams();
  return user ? <TransferOffer key={user.id + ':' + transferId} transferId={transferId} /> : null;
}

function TransferOffer({ transferId }: { transferId: string }) {
  const { t } = useTranslation();
  const [transfer, setTransfer] = useState<TicketTransfer | null>(null);
  const [failure, setFailure] = useState<'notFound' | 'error' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<TransferAction | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getTransfer(transferId, controller.signal)
      .then((loaded) => !controller.signal.aborted && setTransfer(loaded))
      .catch((error) => {
        if (controller.signal.aborted || isRequestCanceled(error)) return;
        const status = error instanceof ApiClientError ? error.status : 0;
        setFailure(status === 404 || status === 403 ? 'notFound' : 'error');
      });
    return () => controller.abort();
  }, [transferId, attempt]);

  const decide = useCallback(
    async (action: TransferAction) => {
      if (busy) return;
      setBusy(action);
      setProblem(null);
      try {
        setTransfer(await decideTransfer(transferId, action));
      } catch (error) {
        setProblem(
          error instanceof ApiClientError && error.message
            ? error.message
            : t('customer:transferOffer_actionFailed'),
        );
        setAttempt((value) => value + 1);
      } finally {
        setBusy(null);
      }
    },
    [busy, t, transferId],
  );

  const back = (
    <Link className="ticket-detail-back" to="/my-tickets">
      <ArrowLeft size={18} aria-hidden="true" />
      {t('customer:ticketDetail_back')}
    </Link>
  );

  if (failure) {
    return (
      <div className="buyer-page page-width ticket-detail">
        {back}
        <BuyerState
          tone={failure === 'error' ? 'error' : 'empty'}
          title={t(
            failure === 'error'
              ? 'customer:transferOffer_loadErrorTitle'
              : 'customer:transferOffer_notFoundTitle',
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
                <RefreshCw size={17} aria-hidden="true" />
                {t('customer:myTicketsPage_thuLai')}
              </button>
            ) : (
              <Link className="button button-primary" to="/my-tickets">
                {t('customer:ticketDetail_back')}
              </Link>
            )
          }
        >
          {t(
            failure === 'error'
              ? 'customer:transferOffer_loadErrorBody'
              : 'customer:transferOffer_notFoundBody',
          )}
        </BuyerState>
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="buyer-page page-width ticket-detail">
        {back}
        <DetailSkeleton rows={4} label={t('customer:transferOffer_loading')} />
      </div>
    );
  }

  const startsAt = transfer.eventDate ? Date.parse(transfer.eventDate) : NaN;
  const seat = seatDescription(transfer);
  const received = transfer.role === 'RECEIVED';
  const pending = transfer.status === 'PENDING';

  return (
    <div className="buyer-page page-width ticket-detail">
      {back}
      <header className="ticket-detail-header">
        <h1>{t('customer:transferOffer_title')}</h1>
      </header>

      <section className="ticket-transfer" aria-labelledby="transfer-offer-event">
        <h2 id="transfer-offer-event">{transfer.concertTitle}</h2>
        <dl className="wallet-ticket-facts transfer-offer-facts">
          {Number.isFinite(startsAt) ? (
            <div>
              <dt>{t('customer:myTicketsPage_eventDate')}</dt>
              <dd>
                <time dateTime={transfer.eventDate ?? undefined}>
                  {eventDateTime.format(startsAt)}
                </time>
              </dd>
            </div>
          ) : null}
          {transfer.venueName ? (
            <div>
              <dt>{t('customer:myTicketsPage_venue')}</dt>
              <dd>{transfer.venueName}</dd>
            </div>
          ) : null}
          {transfer.ticketTypeName ? (
            <div>
              <dt>{t('customer:ticketDetail_ticketType')}</dt>
              <dd>{transfer.ticketTypeName}</dd>
            </div>
          ) : null}
          {seat ? (
            <div>
              <dt>{t('customer:ticketDetail_seat')}</dt>
              <dd>{seat}</dd>
            </div>
          ) : null}
          <div>
            <dt>
              {t(received ? 'customer:transferOffer_fromLabel' : 'customer:transferOffer_toLabel')}
            </dt>
            <dd>{transfer.otherPartyName}</dd>
          </div>
        </dl>

        {problem ? (
          <p className="ticket-transfer-notice" data-tone="error" role="alert">
            {problem}
          </p>
        ) : null}

        {pending && received ? (
          <>
            <p>
              {t('customer:transferOffer_expires', {
                date: dateTime.format(new Date(transfer.expiresAt)),
              })}
            </p>
            <div className="transfer-offer-actions">
              <button
                className="button button-primary"
                type="button"
                aria-disabled={busy !== null}
                onClick={() => void decide('accept')}
              >
                <Check size={18} aria-hidden="true" />
                {busy === 'accept'
                  ? t('customer:transferOffer_accepting')
                  : t('customer:transferOffer_accept')}
              </button>
              <button
                className="button button-secondary"
                type="button"
                aria-disabled={busy !== null}
                onClick={() => void decide('decline')}
              >
                <X size={18} aria-hidden="true" />
                {busy === 'decline'
                  ? t('customer:transferOffer_declining')
                  : t('customer:transferOffer_decline')}
              </button>
            </div>
          </>
        ) : null}

        {pending && !received ? (
          <>
            <p>{t('customer:transferOffer_sentPending', { name: transfer.otherPartyName })}</p>
            <div className="transfer-offer-actions">
              <button
                className="button button-secondary"
                type="button"
                aria-disabled={busy !== null}
                onClick={() => void decide('cancel')}
              >
                {busy === 'cancel'
                  ? t('customer:transfer_cancelling')
                  : t('customer:transfer_cancelAction')}
              </button>
            </div>
          </>
        ) : null}

        {!pending ? (
          <p role="status">
            <strong>
              {t(`customer:transferOffer_final_${transfer.status}_${transfer.role}`, {
                name: transfer.otherPartyName,
              })}
            </strong>
          </p>
        ) : null}

        {transfer.status === 'ACCEPTED' && received && transfer.newTicketId ? (
          <div className="transfer-offer-actions">
            <Link
              className="button button-primary"
              to={`/my-tickets/${encodeURIComponent(transfer.newTicketId)}`}
            >
              {t('customer:transferOffer_viewTicket')}
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
