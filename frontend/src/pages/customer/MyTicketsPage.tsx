import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  MapPin,
  RefreshCw,
  Ticket as TicketIcon,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { getConcert, type ConcertDetail } from '../../api/concerts';
import { getMyTickets, type Ticket, type TicketStatus } from '../../api/tickets';
import { ModalPortal } from '../../components/feedback/ModalPortal';
import { RemoteImage } from '../../components/RemoteImage';
import { dateFormatter } from '../../data/formatters';
import { useAuth } from '../../features/auth/AuthContext';
import { concertTitle } from '../../features/concert/concertText';
import { seatDescription } from '../../features/performance/checkoutPresentation';
import './MyTicketsPage.css';

type TicketFilter = 'all' | TicketStatus;
type ConcertTicketGroup = { id: string; tickets: Ticket[]; concert?: ConcertDetail };

const statusKeys = {
  VALID: 'customer:myTicketsPage_hopLe',
  USED: 'customer:myTicketsPage_daDung',
  CANCELLED: 'customer:myTicketsPage_daHuy',
  TRANSFERRED: 'customer:myTicketsPage_daChuyen',
} satisfies Record<TicketStatus, string>;

const filters = [
  ['all', 'customer:myTicketsPage_tatCa'],
  ['VALID', 'customer:myTicketsPage_conHieuLuc'],
  ['USED', statusKeys.USED],
  ['CANCELLED', statusKeys.CANCELLED],
  ['TRANSFERRED', statusKeys.TRANSFERRED],
] as const;

const eventDateTime = dateFormatter({ dateStyle: 'full', timeStyle: 'short' });
const issuedDate = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

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
  const [concerts, setConcerts] = useState(() => new Map<string, ConcertDetail>());
  const [filter, setFilter] = useState<TicketFilter>('all');
  const [openConcertId, setOpenConcertId] = useState(preferredConcertId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const page = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const rememberedFocus = useRef<HTMLElement | null>(null);
  const openingControl = useRef<HTMLButtonElement | null>(null);
  const openingGroup = useRef<string | null>(null);

  useLayoutEffect(() => {
    // A reordered event can move its focused control in the DOM.
    if (rememberedFocus.current && document.activeElement === document.body) {
      const target = rememberedFocus.current.isConnected
        ? rememberedFocus.current
        : heading.current;
      target?.focus({ preventScroll: true });
    }
    rememberedFocus.current = null;
  });

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    function rememberFocus() {
      const active = document.activeElement;
      if (active instanceof HTMLElement && page.current?.contains(active)) {
        rememberedFocus.current = active;
      }
    }

    async function load() {
      try {
        const data = await getMyTickets(signal);
        if (signal.aborted) return;
        rememberFocus();
        setTickets(data);
        setSelectedId((id) => (id && data.some((ticket) => ticket.id === id) ? id : null));
        setError(false);
        setLoading(false);

        for (const id of new Set(data.map((ticket) => ticket.concertId))) {
          void getConcert(id, signal)
            .then((concert) => {
              if (signal.aborted) return;
              rememberFocus();
              setConcerts((previous) => new Map(previous).set(id, concert));
            })
            .catch(() => {
              // Catalog adds display details. Issued tickets remain usable without it.
            });
        }
      } catch (requestError) {
        if (signal.aborted || isRequestCanceled(requestError)) return;
        rememberFocus();
        if (requestError instanceof ApiClientError && [401, 403].includes(requestError.status)) {
          setTickets(null);
          setSelectedId(null);
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
  const selectedTicket = selectedId
    ? tickets?.find((ticket) => ticket.id === selectedId)
    : undefined;
  const selectedGroup = selectedTicket
    ? groups.find(({ id }) => id === selectedTicket.concertId)
    : undefined;

  function reload() {
    if (loading) return;
    setLoading(true);
    setError(false);
    setReloadKey((key) => key + 1);
  }

  const restoreTicketFocus = useCallback(() => {
    const trigger = openingControl.current;
    if (trigger?.isConnected) {
      trigger.focus();
      return;
    }
    const group =
      openingGroup.current && document.getElementById(groupControlId(openingGroup.current));
    (group || heading.current)?.focus();
  }, []);

  return (
    <div className="buyer-page page-width wallet-page" ref={page}>
      <header className="buyer-page-header">
        <h1 ref={heading} tabIndex={-1}>
          {t('customer:myTicketsPage_myTickets')}
        </h1>
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

      {loading ? (
        <p className="wallet-progress" role="status">
          {t(tickets ? 'customer:myTicketsPage_dangCapNhat' : 'customer:myTicketsPage_dangTaiVe')}
        </p>
      ) : null}

      {error ? (
        <div className="buyer-state wallet-state" role="alert">
          <h2>{t('customer:myTicketsPage_ticketsUnavailable')}</h2>
          <p>
            {t(
              tickets
                ? 'customer:myTicketsPage_refreshFailed'
                : 'customer:myTicketsPage_khongTheTaiVeCuaBan',
            )}
          </p>
          <button className="button button-secondary" type="button" onClick={reload}>
            {t('customer:myTicketsPage_thuLai')}
          </button>
        </div>
      ) : null}

      {tickets?.length === 0 ? (
        <section className="buyer-state wallet-state">
          <h2>{t('customer:myTicketsPage_empty')}</h2>
          <p>{t('customer:myTicketsPage_tatCaETicketCuaBanSe')}</p>
          <Link className="button button-primary" to="/">
            {t('customer:myTicketsPage_browseEvents')}
          </Link>
        </section>
      ) : null}

      {tickets?.length ? (
        <>
          <div
            className="buyer-filters"
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

          {filter === 'all' || tickets.some((ticket) => ticket.status === filter) ? (
            <div className="wallet-groups">
              {groups.map((group) => {
                const visible = group.tickets
                  .map((ticket, index) => ({ ticket, position: index + 1 }))
                  .filter(({ ticket }) => filter === 'all' || ticket.status === filter);
                if (!visible.length) return null;

                return (
                  <ConcertTicketCard
                    group={group}
                    tickets={visible}
                    key={group.id}
                    open={openConcertId === group.id}
                    onToggle={() => setOpenConcertId((id) => (id === group.id ? null : group.id))}
                    onOpenTicket={(ticketId, control) => {
                      openingControl.current = control;
                      openingGroup.current = group.id;
                      setSelectedId(ticketId);
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <section className="buyer-state wallet-state">
              <h2>{t('customer:myTicketsPage_chuaCoVePhuHop')}</h2>
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
            </section>
          )}
        </>
      ) : null}

      {selectedTicket && selectedGroup ? (
        <TicketDetail
          ticket={selectedTicket}
          position={selectedGroup.tickets.indexOf(selectedTicket) + 1}
          concert={concerts.get(selectedTicket.concertId)}
          onClose={() => setSelectedId(null)}
          restoreFocus={restoreTicketFocus}
        />
      ) : null}
    </div>
  );
}

function ConcertTicketCard({
  group,
  tickets,
  open,
  onToggle,
  onOpenTicket,
}: {
  group: ConcertTicketGroup;
  tickets: Array<{ ticket: Ticket; position: number }>;
  open: boolean;
  onToggle: () => void;
  onOpenTicket: (ticketId: string, control: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const detailsId = useId();
  const name = group.concert ? concertTitle(group.concert) : group.tickets[0].concertTitle;
  const timestamp = concertTimestamp(group.concert);
  const groupAction = t(
    open ? 'customer:myTicketsPage_hideTickets' : 'customer:myTicketsPage_viewTickets',
  );

  return (
    <article className="wallet-group" aria-labelledby={headingId}>
      <div className="wallet-group-summary">
        <div className="wallet-event-art">
          <TicketIcon size={28} aria-hidden="true" />
          {group.concert?.posterUrl ? (
            <EventPoster key={group.concert.posterUrl} src={group.concert.posterUrl} />
          ) : null}
        </div>
        <div className="wallet-event">
          <h2 id={headingId}>{name}</h2>
          <div className="wallet-event-meta">
            {timestamp !== null ? (
              <time dateTime={group.concert?.eventDate}>
                <CalendarDays size={16} aria-hidden="true" />
                {eventDateTime.format(timestamp)}
              </time>
            ) : null}
            {group.concert?.venueName ? (
              <span>
                <MapPin size={16} aria-hidden="true" />
                {group.concert.venueName}
              </span>
            ) : null}
            <span>{t('customer:myTicketsPage_ticketCount', { count: tickets.length })}</span>
          </div>
        </div>
        <button
          id={groupControlId(group.id)}
          className="button button-secondary wallet-group-control"
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={t('customer:myTicketsPage_namedAction', { action: groupAction, name })}
        >
          {groupAction}
          <ChevronDown size={17} aria-hidden="true" />
        </button>
      </div>

      <ul className="wallet-ticket-list" id={detailsId} hidden={!open}>
        {open
          ? tickets.map(({ ticket, position }) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                position={position}
                onOpen={onOpenTicket}
              />
            ))
          : null}
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

function TicketRow({
  ticket,
  position,
  onOpen,
}: {
  ticket: Ticket;
  position: number;
  onOpen: (ticketId: string, control: HTMLButtonElement) => void;
}) {
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
      <TicketStatusLabel status={ticket.status} />
      <button
        className={`button ${ticket.status === 'VALID' ? 'button-primary' : 'button-secondary'}`}
        type="button"
        aria-label={t('customer:myTicketsPage_namedAction', { action, name })}
        onClick={(event) => onOpen(ticket.id, event.currentTarget)}
      >
        {action}
      </button>
    </li>
  );
}

function TicketStatusLabel({ status }: { status: TicketStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`wallet-ticket-status wallet-status-${status.toLowerCase()}`}>
      {t(statusKeys[status])}
    </span>
  );
}

function TicketDetail({
  ticket,
  position,
  concert,
  onClose,
  restoreFocus,
}: {
  ticket: Ticket;
  position: number;
  concert?: ConcertDetail;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const { t } = useTranslation();
  const name = concert ? concertTitle(concert) : ticket.concertTitle;
  const timestamp = concertTimestamp(concert);
  const location = seatDescription(ticket);
  const headingId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    closeButton.current?.focus();

    return () => {
      modal?.close();
      queueMicrotask(() => {
        if (!modal?.open) restoreFocus();
      });
    };
  }, [restoreFocus]);

  return (
    <ModalPortal>
      <dialog
        className="buyer-ui wallet-dialog"
        ref={dialog}
        aria-labelledby={headingId}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        onKeyDown={(event) => {
          // Close is the only interactive control in the ticket viewer.
          if (event.key === 'Tab') {
            event.preventDefault();
            closeButton.current?.focus();
          }
        }}
      >
        <div className="wallet-dialog-header">
          <div>
            <h2 id={headingId}>{name}</h2>
            <div className="wallet-dialog-ticket">
              <strong>{ticket.ticketTypeName}</strong>
              {!ticket.referenceCode && !location && (
                <span>{t('customer:myTicketsPage_ticketNumber', { position })}</span>
              )}
              <span role="status">
                <TicketStatusLabel status={ticket.status} />
              </span>
            </div>
          </div>
          <button
            className="button button-secondary wallet-dialog-close"
            ref={closeButton}
            type="button"
            aria-label={t('customer:myTicketsPage_dongChiTietVe')}
            onClick={onClose}
          >
            <X size={21} aria-hidden="true" />
          </button>
        </div>

        {ticket.status === 'VALID' ? (
          <div className="wallet-qr-view">
            <QRCodeSVG
              className="wallet-qr"
              value={ticket.qrCode}
              size={240}
              level="M"
              marginSize={4}
              bgColor="#fff"
              fgColor="#101828"
              role="img"
              title={t('customer:myTicketsPage_ticketQrCodeFor', { arg1: name })}
            />
            <p>
              <strong>{t('customer:myTicketsPage_xuatTrinhTaiCong')}</strong>
            </p>
            <p>{t('customer:myTicketsPage_giuQrRiengTuNeuChiaSe')}</p>
          </div>
        ) : (
          <p className="wallet-qr-unavailable">{t('customer:myTicketsPage_qrUnavailable')}</p>
        )}

        <dl className="wallet-ticket-facts">
          {timestamp !== null ? (
            <div>
              <dt>{t('customer:myTicketsPage_eventDate')}</dt>
              <dd>
                <time dateTime={concert?.eventDate}>{eventDateTime.format(timestamp)}</time>
              </dd>
            </div>
          ) : null}
          {concert?.venueName ? (
            <div>
              <dt>{t('customer:myTicketsPage_venue')}</dt>
              <dd>{concert.venueName}</dd>
            </div>
          ) : null}
          {ticket.referenceCode && (
            <div>
              <dt>{t('customer:myTicketsPage_maVe')}</dt>
              <dd>{ticket.referenceCode}</dd>
            </div>
          )}
          {location && (
            <div>
              <dt>{t('customer:myTicketsPage_ticketLocation')}</dt>
              <dd>{location}</dd>
            </div>
          )}
          <div>
            <dt>{t('customer:myTicketsPage_issued')}</dt>
            <dd>
              <time dateTime={ticket.issuedAt}>{issuedDate.format(new Date(ticket.issuedAt))}</time>
            </dd>
          </div>
        </dl>
      </dialog>
    </ModalPortal>
  );
}

function groupControlId(concertId: string) {
  return `wallet-event-${encodeURIComponent(concertId)}`;
}

function concertTimestamp(concert?: ConcertDetail) {
  const timestamp = Date.parse(concert?.eventDate ?? '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function groupTickets(
  tickets: Ticket[],
  concerts: Map<string, ConcertDetail>,
  preferredConcertId: string | null,
) {
  const groups = new Map<string, ConcertTicketGroup>();
  for (const ticket of tickets) {
    const current = groups.get(ticket.concertId);
    if (current) current.tickets.push(ticket);
    else
      groups.set(ticket.concertId, {
        id: ticket.concertId,
        concert: concerts.get(ticket.concertId),
        tickets: [ticket],
      });
  }

  const now = Date.now();
  function upcoming(group: ConcertTicketGroup) {
    const timestamp = concertTimestamp(group.concert);
    return timestamp !== null &&
      timestamp >= now &&
      group.tickets.some((ticket) => ticket.status === 'VALID')
      ? timestamp
      : Infinity;
  }

  return [...groups.values()].sort((left, right) => {
    if (left.id === preferredConcertId) return -1;
    if (right.id === preferredConcertId) return 1;
    const leftUpcoming = upcoming(left);
    const rightUpcoming = upcoming(right);
    if (leftUpcoming !== rightUpcoming) return leftUpcoming - rightUpcoming;
    const leftDate = concertTimestamp(left.concert);
    const rightDate = concertTimestamp(right.concert);
    if (leftDate === rightDate) return 0;
    return (rightDate ?? -Infinity) - (leftDate ?? -Infinity);
  });
}
