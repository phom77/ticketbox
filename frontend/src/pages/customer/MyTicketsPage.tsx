import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, MapPin, RefreshCw, Ticket as TicketIcon } from 'lucide-react';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { getMyTickets, type Ticket, type TicketStatus } from '../../api/tickets';
import { BuyerState } from '../../components/feedback/BuyerState';
import { CardGridSkeleton } from '../../components/feedback/Skeleton';
import { RemoteImage } from '../../components/RemoteImage';
import { dateFormatter } from '../../data/formatters';
import { useAuth } from '../../features/auth/AuthContext';
import { concertTitle } from '../../features/concert/concertText';
import { seatDescription } from '../../features/performance/checkoutPresentation';
import {
  hasPerformanceDetails,
  loadConcertView,
  ticketView,
  type EventView,
} from '../../features/event/eventView';
import { isUpcomingEvent, ticketStatusKeys } from '../../features/ticket/walletTabs';
import { ReceivedTransferOffers } from './ReceivedTransferOffers';
import './MyTicketsPage.css';

type TicketFilter = 'all' | TicketStatus;
type WalletTab = 'upcoming' | 'past';
type ConcertTicketGroup = { id: string; tickets: Ticket[]; event: EventView };

const filters = [
  ['all', 'customer:myTicketsPage_tatCa'],
  ['VALID', 'customer:myTicketsPage_conHieuLuc'],
  ['USED', ticketStatusKeys.USED],
  ['CANCELLED', ticketStatusKeys.CANCELLED],
  ['TRANSFERRED', ticketStatusKeys.TRANSFERRED],
] as const;

const eventDateTime = dateFormatter({ dateStyle: 'full', timeStyle: 'short' });
const monthFormat = dateFormatter({ month: 'short' });
const dayFormat = dateFormatter({ day: 'numeric' });

export function MyTicketsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preferredConcertId = searchParams.get('concertId');
  return (
    <TicketWallet
      key={JSON.stringify([user?.id, preferredConcertId])}
      preferredConcertId={preferredConcertId}
    />
  );
}

function TicketWallet({ preferredConcertId }: { preferredConcertId: string | null }) {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [concerts, setConcerts] = useState(() => new Map<string, EventView>());
  const [filter, setFilter] = useState<TicketFilter>('all');
  const [chosenTab, setChosenTab] = useState<WalletTab | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      try {
        const data = await getMyTickets(signal);
        if (signal.aborted) return;
        setTickets(data);
        setError(false);
        setLoading(false);

        // Performance tickets carry their own date and venue; only legacy tickets need Catalog.
        const legacyIds = data
          .filter((ticket) => !hasPerformanceDetails(ticket))
          .map((ticket) => ticket.concertId);
        for (const id of new Set(legacyIds)) {
          void loadConcertView(id, signal)
            .then((concert) => {
              if (signal.aborted || !concert) return;
              setConcerts((previous) => new Map(previous).set(id, concert));
            })
            .catch(() => {
              // Catalog adds display details. Issued tickets remain usable without it.
            });
        }
      } catch (requestError) {
        if (signal.aborted || isRequestCanceled(requestError)) return;
        if (requestError instanceof ApiClientError && [401, 403].includes(requestError.status)) {
          setTickets(null);
        }
        setError(true);
        setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [reloadKey]);

  const groups = useMemo(
    () => groupTickets(tickets ?? [], concerts, preferredConcertId),
    [tickets, concerts, preferredConcertId],
  );
  const upcoming = groups.filter((group) => group.upcoming);
  const past = groups.filter((group) => !group.upcoming);
  const tab: WalletTab =
    chosenTab ?? (upcoming.length === 0 && past.length > 0 ? 'past' : 'upcoming');
  const inTab = tab === 'upcoming' ? upcoming : past;

  function reload() {
    if (loading) return;
    setLoading(true);
    setError(false);
    setReloadKey((key) => key + 1);
  }

  return (
    <div className="buyer-page page-width wallet-page">
      <header className="buyer-page-header">
        <h1>{t('customer:myTicketsPage_myTickets')}</h1>
        {tickets?.length ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={reload}
            aria-disabled={loading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            {t('customer:myTicketsPage_lamMoi')}
          </button>
        ) : null}
      </header>

      <ReceivedTransferOffers />

      {loading && !tickets ? (
        <CardGridSkeleton count={2} label={t('customer:myTicketsPage_dangTaiVe')} />
      ) : loading ? (
        <p className="wallet-progress" role="status">
          {t('customer:myTicketsPage_dangCapNhat')}
        </p>
      ) : null}

      {error ? (
        <BuyerState
          tone="error"
          className="wallet-state"
          title={t('customer:myTicketsPage_ticketsUnavailable')}
          actions={
            <button className="button button-secondary" type="button" onClick={reload}>
              {t('customer:myTicketsPage_thuLai')}
            </button>
          }
        >
          {t(
            tickets
              ? 'customer:myTicketsPage_refreshFailed'
              : 'customer:myTicketsPage_khongTheTaiVeCuaBan',
          )}
        </BuyerState>
      ) : null}

      {tickets?.length === 0 ? (
        <BuyerState
          tone="empty"
          className="wallet-state"
          title={t('customer:myTicketsPage_empty')}
          actions={
            <Link className="button button-primary" to="/">
              {t('customer:myTicketsPage_browseEvents')}
            </Link>
          }
        >
          {t('customer:myTicketsPage_tatCaETicketCuaBanSe')}
        </BuyerState>
      ) : null}

      {tickets?.length ? (
        <>
          <div className="wallet-tabs" role="group" aria-label={t('customer:wallet_tabs')}>
            {(['upcoming', 'past'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => setChosenTab(value)}
              >
                {t(value === 'upcoming' ? 'customer:wallet_upcoming' : 'customer:wallet_past')}
                <span className="wallet-tab-count">
                  {(value === 'upcoming' ? upcoming : past).length}
                </span>
              </button>
            ))}
          </div>

          <div
            className="buyer-filters wallet-status-filter"
            role="group"
            aria-label={t('customer:myTicketsPage_trangThaiVe')}
          >
            {filters.map(([value, key]) => (
              <button
                id={value === 'all' ? 'wallet-filter-all' : undefined}
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {t(key)}
              </button>
            ))}
          </div>

          {(() => {
            const cards = inTab
              .map((group) => ({
                group,
                visible: group.tickets.filter(
                  (ticket) => filter === 'all' || ticket.status === filter,
                ),
              }))
              .filter(({ visible }) => visible.length > 0);
            if (cards.length === 0) {
              return (
                <BuyerState
                  tone="empty"
                  className="wallet-state"
                  title={t(
                    filter !== 'all'
                      ? 'customer:myTicketsPage_chuaCoVePhuHop'
                      : tab === 'upcoming'
                        ? 'customer:wallet_noUpcoming'
                        : 'customer:wallet_noPast',
                  )}
                  actions={
                    filter !== 'all' ? (
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => {
                          setFilter('all');
                          document.getElementById('wallet-filter-all')?.focus();
                        }}
                      >
                        {t('customer:myTicketsPage_clearFilter')}
                      </button>
                    ) : tab === 'upcoming' ? (
                      <Link className="button button-primary" to="/">
                        {t('customer:myTicketsPage_browseEvents')}
                      </Link>
                    ) : undefined
                  }
                />
              );
            }
            return (
              <div className="wallet-groups">
                {cards.map(({ group, visible }) => (
                  <ConcertTicketCard group={group} tickets={visible} key={group.id} />
                ))}
              </div>
            );
          })()}
        </>
      ) : null}
    </div>
  );
}

function ConcertTicketCard({ group, tickets }: { group: ConcertTicketGroup; tickets: Ticket[] }) {
  const { t } = useTranslation();
  const name = concertTitle(group.event);
  const timestamp = eventTimestamp(group.event);
  const headingId = `wallet-event-${encodeURIComponent(group.id)}`;

  return (
    <article className="wallet-group" aria-labelledby={headingId}>
      <div className="wallet-group-summary">
        {timestamp !== null ? (
          <time className="wallet-date-block" dateTime={group.event.date} aria-hidden="true">
            <span>{monthFormat.format(timestamp)}</span>
            <strong>{dayFormat.format(timestamp)}</strong>
          </time>
        ) : null}
        <div className="wallet-event-art">
          <TicketIcon size={28} aria-hidden="true" />
          {group.event.image ? (
            <EventPoster key={group.event.image} src={group.event.image} />
          ) : null}
        </div>
        <div className="wallet-event">
          <h2 id={headingId}>{name}</h2>
          <div className="wallet-event-meta">
            {timestamp !== null ? (
              <span>
                <CalendarDays size={16} aria-hidden="true" />
                {eventDateTime.format(timestamp)}
              </span>
            ) : null}
            {group.event.venue ? (
              <span>
                <MapPin size={16} aria-hidden="true" />
                {group.event.venue}
              </span>
            ) : null}
            <span>{t('customer:myTicketsPage_ticketCount', { count: group.tickets.length })}</span>
          </div>
        </div>
      </div>

      <ul className="wallet-ticket-list">
        {tickets.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} position={group.tickets.indexOf(ticket) + 1} />
        ))}
      </ul>
    </article>
  );
}

function EventPoster({ src }: { src: string }) {
  const [ready, setReady] = useState(false);

  return (
    <RemoteImage
      className={ready ? 'wallet-poster-ready' : undefined}
      src={src}
      alt=""
      width={160}
      height={160}
      loading="lazy"
      onLoad={() => setReady(true)}
    />
  );
}

function TicketRow({ ticket, position }: { ticket: Ticket; position: number }) {
  const { t } = useTranslation();
  const action = t(
    ticket.status === 'VALID'
      ? 'customer:myTicketsPage_openQr'
      : 'customer:myTicketsPage_viewDetails',
  );
  const description =
    ticket.referenceCode ||
    seatDescription(ticket) ||
    t('customer:myTicketsPage_ticketNumber', { position });
  const name = ticket.referenceCode || [ticket.ticketTypeName, description].join(' · ');
  return (
    <li className="wallet-ticket-row">
      <div className="wallet-ticket-info">
        <strong>{ticket.ticketTypeName}</strong>
        <span>
          {ticket.referenceCode
            ? t('customer:myTicketsPage_maVe') + ' ' + description
            : description}
        </span>
      </div>
      <span className={`wallet-ticket-status wallet-status-${ticket.status.toLowerCase()}`}>
        {t(ticketStatusKeys[ticket.status])}
      </span>
      <Link
        className={`button ${ticket.status === 'VALID' ? 'button-primary' : 'button-secondary'}`}
        to={`/my-tickets/${encodeURIComponent(ticket.id)}`}
        aria-label={t('customer:myTicketsPage_namedAction', { action, name })}
      >
        {action}
      </Link>
    </li>
  );
}

function eventTimestamp(event: EventView) {
  const timestamp = Date.parse(event.date);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function groupTickets(
  tickets: Ticket[],
  concerts: Map<string, EventView>,
  preferredConcertId: string | null,
) {
  const groups = new Map<string, ConcertTicketGroup & { upcoming: boolean }>();
  for (const ticket of tickets) {
    const current = groups.get(ticket.concertId);
    if (current) current.tickets.push(ticket);
    else
      groups.set(ticket.concertId, {
        id: ticket.concertId,
        event: ticketView(ticket, concerts.get(ticket.concertId)),
        tickets: [ticket],
        upcoming: false,
      });
  }

  const now = Date.now();
  const list = [...groups.values()];
  for (const group of list) {
    group.upcoming = isUpcomingEvent(
      eventTimestamp(group.event),
      group.tickets.map((ticket) => ticket.status),
      now,
    );
  }

  return list.sort((left, right) => {
    if (left.id === preferredConcertId) return -1;
    if (right.id === preferredConcertId) return 1;
    const leftDate = eventTimestamp(left.event);
    const rightDate = eventTimestamp(right.event);
    if (leftDate === rightDate) return 0;
    // Upcoming events: soonest first. Past events: most recent first.
    if (left.upcoming) return (leftDate ?? Infinity) - (rightDate ?? Infinity);
    return (rightDate ?? -Infinity) - (leftDate ?? -Infinity);
  });
}
