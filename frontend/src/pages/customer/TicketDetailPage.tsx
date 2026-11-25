import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, CloudOff, Maximize2, RefreshCw, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { getTicket, type Ticket } from '../../api/tickets';
import { BuyerState } from '../../components/feedback/BuyerState';
import { DetailSkeleton } from '../../components/feedback/Skeleton';
import { dateFormatter } from '../../data/formatters';
import { useAuth } from '../../features/auth/AuthContext';
import { concertTitle } from '../../features/concert/concertText';
import {
  hasPerformanceDetails,
  loadConcertView,
  ticketView,
  type EventView,
} from '../../features/event/eventView';
import { seatDescription } from '../../features/performance/checkoutPresentation';
import { buildIcs, downloadIcs } from '../../features/ticket/calendar';
import { TicketTransferPanel } from './TicketTransferPanel';
import { ticketStatusKeys } from '../../features/ticket/walletTabs';
import {
  loadOfflineTicket,
  removeOfflineTicket,
  saveOfflineTicket,
} from '../../features/ticket/offlineTicket';
import './TicketDetailPage.css';

const eventDateTime = dateFormatter({ dateStyle: 'full', timeStyle: 'short' });
const savedDate = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

type Loaded = { ticket: Ticket; offlineSavedAt?: string };

export function TicketDetailPage() {
  const { user } = useAuth();
  const { ticketId = '' } = useParams();
  return user ? (
    <TicketDetail key={user.id + ':' + ticketId} userId={user.id} ticketId={ticketId} />
  ) : null;
}

function TicketDetail({ userId, ticketId }: { userId: string; ticketId: string }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<'notFound' | 'error' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [concert, setConcert] = useState<EventView | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const fullScreenButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    getTicket(ticketId, signal)
      .then((ticket) => {
        if (signal.aborted) return;
        if (ticket.status === 'VALID') saveOfflineTicket(userId, ticket);
        else removeOfflineTicket(userId, ticket.id);
        setLoaded({ ticket });
        setFailure(null);
      })
      .catch((error) => {
        if (signal.aborted || isRequestCanceled(error)) return;
        const status = error instanceof ApiClientError ? error.status : 0;
        if (status === 404 || status === 403) {
          removeOfflineTicket(userId, ticketId);
          setFailure('notFound');
          return;
        }
        const copy = loadOfflineTicket(userId, ticketId);
        if (copy) setLoaded({ ticket: copy.ticket, offlineSavedAt: copy.savedAt });
        else setFailure('error');
      });
    return () => controller.abort();
  }, [ticketId, userId, attempt]);

  const ticket = loaded?.ticket;
  useEffect(() => {
    if (!ticket || hasPerformanceDetails(ticket)) return;
    const controller = new AbortController();
    loadConcertView(ticket.concertId, controller.signal)
      .then((view) => !controller.signal.aborted && setConcert(view))
      .catch(() => undefined);
    return () => controller.abort();
  }, [ticket]);

  const retry = useCallback(() => {
    setFailure(null);
    setLoaded(null);
    setAttempt((value) => value + 1);
  }, []);

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
              ? 'customer:ticketDetail_loadErrorTitle'
              : 'customer:ticketDetail_notFoundTitle',
          )}
          actions={
            failure === 'error' ? (
              <button className="button button-secondary" type="button" onClick={retry}>
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
              ? 'customer:ticketDetail_loadErrorBody'
              : 'customer:ticketDetail_notFoundBody',
          )}
        </BuyerState>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="buyer-page page-width ticket-detail">
        {back}
        <DetailSkeleton rows={4} label={t('customer:myTicketsPage_dangTaiVe')} />
      </div>
    );
  }

  const event = ticketView(ticket, concert);
  const name = concertTitle(event);
  const startsAt = Date.parse(event.date);
  const hasDate = Number.isFinite(startsAt);
  const seat = seatDescription(ticket);
  const valid = ticket.status === 'VALID';

  function addToCalendar() {
    const ics = buildIcs({
      uid: ticket!.id,
      title: name,
      start: event.date,
      venue: event.venue,
      description: [ticket!.ticketTypeName, seat].filter(Boolean).join(' · '),
    });
    if (ics) downloadIcs(`${name.replace(/[^\p{L}\p{N}]+/gu, '-')}.ics`, ics);
  }

  return (
    <div className="buyer-page page-width ticket-detail">
      {back}
      <header className="ticket-detail-header">
        <h1 ref={heading} tabIndex={-1}>
          {name}
        </h1>
        <span
          className={`wallet-ticket-status wallet-status-${ticket.status.toLowerCase()}`}
          role="status"
        >
          {t(ticketStatusKeys[ticket.status])}
        </span>
      </header>

      {loaded.offlineSavedAt ? (
        <div className="ticket-detail-offline" role="status">
          <CloudOff size={18} aria-hidden="true" />
          <span>
            <strong>{t('customer:ticketDetail_offlineCopy')}</strong>{' '}
            {t('customer:ticketDetail_offlineBody', {
              date: savedDate.format(new Date(loaded.offlineSavedAt)),
            })}
          </span>
          <button className="button button-secondary" type="button" onClick={retry}>
            {t('customer:myTicketsPage_thuLai')}
          </button>
        </div>
      ) : null}

      <div className="ticket-detail-layout">
        <section className="ticket-detail-pass" aria-label={t('customer:ticketDetail_pass')}>
          {valid ? (
            <>
              <QRCodeSVG
                className="ticket-detail-qr"
                value={ticket.qrCode}
                size={280}
                level="M"
                marginSize={4}
                bgColor="#fff"
                fgColor="#101828"
                role="img"
                title={t('customer:myTicketsPage_ticketQrCodeFor', { arg1: name })}
              />
              <button
                ref={fullScreenButton}
                className="button button-primary"
                type="button"
                onClick={() => setFullScreen(true)}
              >
                <Maximize2 size={18} aria-hidden="true" />
                {t('customer:ticketDetail_fullScreen')}
              </button>
              {!loaded.offlineSavedAt ? (
                <p className="ticket-detail-saved">
                  <CloudOff size={16} aria-hidden="true" />
                  {t('customer:ticketDetail_savedOffline')}
                </p>
              ) : null}
            </>
          ) : (
            <p className="wallet-qr-unavailable">{t('customer:myTicketsPage_qrUnavailable')}</p>
          )}
        </section>

        <div className="ticket-detail-info">
          <dl className="wallet-ticket-facts">
            {hasDate ? (
              <div>
                <dt>{t('customer:myTicketsPage_eventDate')}</dt>
                <dd>
                  <time dateTime={event.date}>{eventDateTime.format(startsAt)}</time>
                </dd>
              </div>
            ) : null}
            {event.venue ? (
              <div>
                <dt>{t('customer:myTicketsPage_venue')}</dt>
                <dd>{event.venue}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t('customer:ticketDetail_ticketType')}</dt>
              <dd>{ticket.ticketTypeName}</dd>
            </div>
            {ticket.sectionLabel ? (
              <div>
                <dt>{t('customer:ticketDetail_section')}</dt>
                <dd>{ticket.sectionLabel}</dd>
              </div>
            ) : null}
            {ticket.rowLabel ? (
              <div>
                <dt>{t('customer:ticketDetail_row')}</dt>
                <dd>{ticket.rowLabel}</dd>
              </div>
            ) : null}
            {ticket.seatLabel ? (
              <div>
                <dt>{t('customer:ticketDetail_seat')}</dt>
                <dd>{ticket.seatLabel}</dd>
              </div>
            ) : null}
            {ticket.referenceCode ? (
              <div>
                <dt>{t('customer:myTicketsPage_maVe')}</dt>
                <dd>{ticket.referenceCode}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t('customer:myTicketsPage_issued')}</dt>
              <dd>
                <time dateTime={ticket.issuedAt}>
                  {savedDate.format(new Date(ticket.issuedAt))}
                </time>
              </dd>
            </div>
          </dl>

          {valid ? (
            <section className="ticket-detail-entry">
              <h2>{t('customer:ticketDetail_entryTitle')}</h2>
              <ol>
                <li>{t('customer:ticketDetail_entryStep1')}</li>
                <li>{t('customer:ticketDetail_entryStep2')}</li>
                <li>{t('customer:ticketDetail_entryStep3')}</li>
              </ol>
            </section>
          ) : null}

          {!loaded.offlineSavedAt ? <TicketTransferPanel ticketId={ticket.id} /> : null}

          {hasDate ? (
            <button className="button button-secondary" type="button" onClick={addToCalendar}>
              <CalendarPlus size={18} aria-hidden="true" />
              {t('customer:ticketDetail_addToCalendar')}
            </button>
          ) : null}
        </div>
      </div>

      {fullScreen && valid ? (
        <FullScreenQr
          ticket={ticket}
          title={name}
          onClose={() => {
            setFullScreen(false);
            queueMicrotask(() => fullScreenButton.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}

type WakeLockSentinelLike = { release: () => Promise<void> };

function FullScreenQr({
  ticket,
  title,
  onClose,
}: {
  ticket: Ticket;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
    let lock: WakeLockSentinelLike | undefined;
    let released = false;
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      }
    ).wakeLock;
    wakeLock
      ?.request('screen')
      .then((sentinel) => {
        if (released) void sentinel.release();
        else lock = sentinel;
      })
      .catch(() => undefined);
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        event.preventDefault();
        close.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      released = true;
      document.removeEventListener('keydown', onKey);
      void lock?.release();
    };
  }, [onClose]);

  return (
    <div
      className="ticket-fullscreen"
      role="dialog"
      aria-modal="true"
      aria-label={t('customer:ticketDetail_fullScreenLabel', { name: title })}
    >
      <button
        ref={close}
        className="button button-secondary ticket-fullscreen-close"
        type="button"
        onClick={onClose}
      >
        <X size={20} aria-hidden="true" />
        {t('customer:ticketDetail_closeFullScreen')}
      </button>
      <QRCodeSVG
        className="ticket-fullscreen-qr"
        value={ticket.qrCode}
        size={640}
        level="M"
        marginSize={4}
        bgColor="#fff"
        fgColor="#000"
        role="img"
        title={t('customer:myTicketsPage_ticketQrCodeFor', { arg1: title })}
      />
      <p>{t('customer:ticketDetail_fullScreenHint')}</p>
    </div>
  );
}
