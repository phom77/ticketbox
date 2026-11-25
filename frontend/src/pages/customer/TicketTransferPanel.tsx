import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, Send, Undo2 } from 'lucide-react';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import {
  decideTransfer,
  getTransferState,
  lookupTransferRecipient,
  offerTransfer,
  type TransferState,
} from '../../api/tickets';
import { dateFormatter } from '../../data/formatters';
import {
  isTransferEmail,
  normalizeEmail,
  transferBlockerKey,
} from '../../features/ticket/transfer';
import './TicketTransfer.css';

const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

type Step =
  | { name: 'closed' }
  | { name: 'email'; error?: string }
  | { name: 'confirm'; email: string; displayName: string };

function messageOf(error: unknown, fallback: string) {
  return error instanceof ApiClientError && error.message ? error.message : fallback;
}

/** Transfer actions and state for one ticket: offer, pending offer, received and given away. */
export function TicketTransferPanel({ ticketId }: { ticketId: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<TransferState | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<Step>({ name: 'closed' });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const emailId = useId();
  const helpId = useId();

  useEffect(() => {
    const controller = new AbortController();
    getTransferState(ticketId, controller.signal)
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
  }, [ticketId, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  async function checkRecipient(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!isTransferEmail(email)) {
      setStep({ name: 'email', error: t('customer:transfer_emailInvalid') });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const recipient = await lookupTransferRecipient(ticketId, normalizeEmail(email));
      setStep({
        name: 'confirm',
        email: normalizeEmail(email),
        displayName: recipient.displayName,
      });
    } catch (error) {
      setStep({ name: 'email', error: messageOf(error, t('customer:transfer_lookupFailed')) });
    } finally {
      setBusy(false);
    }
  }

  async function send(confirmed: Extract<Step, { name: 'confirm' }>) {
    if (busy) return;
    setBusy(true);
    try {
      await offerTransfer(ticketId, confirmed.email);
      setNotice({
        tone: 'success',
        text: t('customer:transfer_sent', { name: confirmed.displayName }),
      });
      setStep({ name: 'closed' });
      setEmail('');
      reload();
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error, t('customer:transfer_sendFailed')) });
      setStep({ name: 'email' });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(transferId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await decideTransfer(transferId, 'cancel');
      setNotice({ tone: 'success', text: t('customer:transfer_cancelled') });
      reload();
    } catch (error) {
      setNotice({ tone: 'error', text: messageOf(error, t('customer:transfer_cancelFailed')) });
      reload();
    } finally {
      setBusy(false);
    }
  }

  if (failed && !state) {
    return (
      <section className="ticket-transfer" aria-labelledby="ticket-transfer-title">
        <h2 id="ticket-transfer-title">{t('customer:transfer_title')}</h2>
        <p>{t('customer:transfer_unavailable')}</p>
        <button className="button button-secondary" type="button" onClick={reload}>
          {t('customer:myTicketsPage_thuLai')}
        </button>
      </section>
    );
  }
  if (!state) return null;

  const blockerKey = transferBlockerKey(state.blockedReason);
  const cutoff = state.cutoffAt ? dateTime.format(new Date(state.cutoffAt)) : '';
  const nothingToShow =
    !state.pending &&
    !state.canTransfer &&
    !blockerKey &&
    !state.receivedFromName &&
    !state.transferredToName &&
    !notice;
  if (nothingToShow) return null;

  return (
    <section className="ticket-transfer" aria-labelledby="ticket-transfer-title">
      <h2 id="ticket-transfer-title">{t('customer:transfer_title')}</h2>

      {notice ? (
        <p
          className="ticket-transfer-notice"
          data-tone={notice.tone}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      ) : null}

      {state.receivedFromName ? (
        <p className="ticket-transfer-fact">
          <strong>{t('customer:transfer_receivedFrom', { name: state.receivedFromName })}</strong>
          <span>{t('customer:transfer_receivedNote')}</span>
        </p>
      ) : null}

      {state.transferredToName ? (
        <p className="ticket-transfer-fact">
          <strong>{t('customer:transfer_transferredTo', { name: state.transferredToName })}</strong>
        </p>
      ) : null}

      {state.pending ? (
        <div className="ticket-transfer-pending" role="status">
          <strong>{t('customer:transfer_pendingTitle')}</strong>
          <span>
            {t('customer:transfer_pendingBody', {
              name: state.pending.otherPartyName,
              date: dateTime.format(new Date(state.pending.expiresAt)),
            })}
          </span>
          <button
            className="button button-secondary"
            type="button"
            aria-disabled={busy}
            onClick={() => void cancel(state.pending!.id)}
          >
            <Undo2 size={17} aria-hidden="true" />
            {busy ? t('customer:transfer_cancelling') : t('customer:transfer_cancelAction')}
          </button>
        </div>
      ) : null}

      {!state.pending && blockerKey ? <p>{t(blockerKey, { date: cutoff })}</p> : null}

      {state.canTransfer && step.name === 'closed' ? (
        <>
          <p>{t('customer:transfer_intro')}</p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setStep({ name: 'email' })}
          >
            <ArrowRightLeft size={18} aria-hidden="true" />
            {t('customer:transfer_action')}
          </button>
        </>
      ) : null}

      {state.canTransfer && step.name === 'email' ? (
        <form
          className="ticket-transfer-form"
          onSubmit={(event) => void checkRecipient(event)}
          noValidate
        >
          <ul className="ticket-transfer-rules">
            <li>{t('customer:transfer_ruleCutoff', { date: cutoff })}</li>
            <li>{t('customer:transfer_ruleNewQr')}</li>
            <li>{t('customer:transfer_ruleCancel')}</li>
            <li>{t('customer:transfer_ruleOnce')}</li>
          </ul>
          <label htmlFor={emailId}>{t('customer:transfer_emailLabel')}</label>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            maxLength={254}
            aria-describedby={helpId}
            aria-invalid={step.error ? true : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
          <p
            id={helpId}
            className={step.error ? 'ticket-transfer-error' : undefined}
            role={step.error ? 'alert' : undefined}
          >
            {step.error ?? t('customer:transfer_emailHelp')}
          </p>
          <div className="ticket-transfer-actions">
            <button className="button button-primary" type="submit" aria-disabled={busy}>
              {busy ? t('customer:transfer_checking') : t('customer:transfer_continue')}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setStep({ name: 'closed' })}
            >
              {t('customer:transfer_close')}
            </button>
          </div>
        </form>
      ) : null}

      {state.canTransfer && step.name === 'confirm' ? (
        <div
          className="ticket-transfer-form"
          role="group"
          aria-labelledby="ticket-transfer-confirm"
        >
          <h3 id="ticket-transfer-confirm">
            {t('customer:transfer_confirmTitle', { name: step.displayName })}
          </h3>
          <p>{t('customer:transfer_confirmBody', { email: step.email })}</p>
          <div className="ticket-transfer-actions">
            <button
              className="button button-primary"
              type="button"
              aria-disabled={busy}
              onClick={() => void send(step)}
            >
              <Send size={17} aria-hidden="true" />
              {busy ? t('customer:transfer_sending') : t('customer:transfer_send')}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setStep({ name: 'email' })}
            >
              {t('customer:transfer_back')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
