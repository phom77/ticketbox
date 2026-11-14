import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { concertTitle } from '../../features/concert/concertText';
import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronDown, MapPin, RefreshCw, Ticket as TicketIcon } from 'lucide-react';
import { isRequestCanceled } from '../../api/client';
import { getConcert, type ConcertDetail } from '../../api/concerts';
import { getMyTickets, type Ticket, type TicketStatus } from '../../api/tickets';
import { RemoteImage } from '../../components/RemoteImage';
import { eventDate, dateFormatter } from '../../data/formatters';
import { ModalPortal } from '../../components/feedback/ModalPortal';

type TicketFilter = 'all' | TicketStatus;
type TicketWithConcert = Ticket & { concert: ConcertDetail | null };
type ConcertTicketGroup = {
  concertId: string;
  concertTitle: string;
  concert: ConcertDetail | null;
  tickets: TicketWithConcert[];
};

const tabs: Array<{ value: TicketFilter; label: string }> = [
  { value: 'all', get label() { return translate("customer:myTicketsPage_tatCa"); } },
  { value: 'VALID', get label() { return translate("customer:myTicketsPage_conHieuLuc"); } },
  { value: 'USED', get label() { return translate("customer:myTicketsPage_daDung"); } },
  { value: 'CANCELLED', get label() { return translate("customer:myTicketsPage_daHuy"); } },
  { value: 'TRANSFERRED', get label() { return translate("customer:myTicketsPage_daChuyen"); } },
];

const issuedDate = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function MyTicketsPage() {
  useTranslation();
  const [tickets, setTickets] = useState<TicketWithConcert[]>([]);
  const [activeTab, setActiveTab] = useState<TicketFilter>('all');
  const [openConcertId, setOpenConcertId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<TicketWithConcert | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    getMyTickets(controller.signal)
      .then(async (ticketList) => {
        const concertIds = [...new Set(ticketList.map((ticket) => ticket.concertId))];
        const concertResults = await Promise.allSettled(
          concertIds.map((concertId) => getConcert(concertId, controller.signal)),
        );
        if (!active) return;

        const concerts = new Map<string, ConcertDetail>();
        concertResults.forEach((result, index) => {
          if (result.status === 'fulfilled') concerts.set(concertIds[index], result.value);
        });

        const enrichedTickets = ticketList.map((ticket) => ({
          ...ticket,
          concert: concerts.get(ticket.concertId) ?? null,
        }));
        setTickets(enrichedTickets);
        setSelectedTicket((current) =>
          current ? (enrichedTickets.find((ticket) => ticket.id === current.id) ?? null) : null,
        );
        if (!openConcertId && enrichedTickets[0]) {
          setOpenConcertId(enrichedTickets[0].concertId);
        }
      })
      .catch((requestError: unknown) => {
        if (active && !isRequestCanceled(requestError)) {
          setError(translate("customer:myTicketsPage_khongTheTaiVeCuaBan"));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  const filteredTickets = useMemo(
    () => (activeTab === 'all' ? tickets : tickets.filter((ticket) => ticket.status === activeTab)),
    [activeTab, tickets],
  );

  const groups = useMemo(() => groupTickets(filteredTickets), [filteredTickets]);
  const totalValid = tickets.filter((ticket) => ticket.status === 'VALID').length;

  if (loading) {
    return (
      <div className="tickets-page page-width">
        <div className="tickets-heading">
          <div>
            <p className="eyebrow">
              <span /> {translate("customer:myTicketsPage_yourLiveArchive")}
            </p>
            <h1>{translate("customer:myTicketsPage_myTickets")}</h1>
          </div>
        </div>
        <div className="ticket-list" aria-label={translate("customer:myTicketsPage_dangTaiVe")} aria-live="polite">
          {[1, 2].map((item) => (
            <div className="event-skeleton" key={item}>
              <div />
              <span />
              <span />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tickets-page page-width">
        <div className="state-panel">
          <span className="state-icon">!</span>
          <h3>{translate("customer:myTicketsPage_ticketsUnavailable")}</h3>
          <p>{error}</p>
          <button
            className="button button-primary"
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            {translate("customer:myTicketsPage_thuLai")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tickets-page page-width">
      <div className="tickets-heading">
        <div>
          <p className="eyebrow">
            <span /> {translate("customer:myTicketsPage_yourLiveArchive")}
          </p>
          <h1>{translate("customer:myTicketsPage_myTickets")}</h1>
          <p>
            {tickets.length
              ? translate("customer:myTicketsPage_veTrongConcertVeConHieuLuc", { arg1: tickets.length, arg2: groupTickets(tickets).length, arg3: totalValid })
              : translate("customer:myTicketsPage_tatCaETicketCuaBanSe")}
          </p>
        </div>
        <div className="tickets-heading-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RefreshCw size={16} />
            {translate("customer:myTicketsPage_lamMoi")}
          </button>
          <Link className="button button-secondary" to="/">
            {translate("customer:myTicketsPage_timConcertKhac")}
          </Link>
        </div>
      </div>

      <div className="ticket-tabs" role="tablist" aria-label={translate("customer:myTicketsPage_trangThaiVe")}>
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            className={activeTab === tab.value ? 'active' : ''}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {groups.length > 0 ? (
        <div className="ticket-concert-list">
          {groups.map((group) => (
            <ConcertTicketCard
              key={group.concertId}
              group={group}
              open={openConcertId === group.concertId}
              onToggle={() =>
                setOpenConcertId((current) =>
                  current === group.concertId ? null : group.concertId,
                )
              }
              onOpenTicket={setSelectedTicket}
            />
          ))}
        </div>
      ) : (
        <div className="state-panel">
          <span className="state-icon">◇</span>
          <h3>{translate("customer:myTicketsPage_chuaCoVePhuHop")}</h3>
          <p>{translate("customer:myTicketsPage_doiBoLocHoacKhamPhaConcert")}</p>
          <Link className="button button-primary" to="/">
            {translate("customer:myTicketsPage_browseEvents")}
          </Link>
        </div>
      )}

      {selectedTicket ? (
        <TicketDetail ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
      ) : null}
    </div>
  );
}

function ConcertTicketCard({
  group,
  open,
  onToggle,
  onOpenTicket,
}: {
  group: ConcertTicketGroup;
  open: boolean;
  onToggle: () => void;
  onOpenTicket: (ticket: TicketWithConcert) => void;
}) {
  useTranslation();
  const valid = group.tickets.filter((ticket) => ticket.status === 'VALID').length;
  const used = group.tickets.filter((ticket) => ticket.status === 'USED').length;
  const eventTime = group.concert
    ? eventDate.format(new Date(group.concert.eventDate))
    : translate("customer:myTicketsPage_dangCapNhat");

  return (
    <article className={`ticket-concert-card ${open ? 'is-open' : ''}`}>
      <button
        className="ticket-concert-summary"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
      >
        <RemoteImage
          src={group.concert?.posterUrl ?? undefined}
          alt=""
          width="420"
          height="300"
          loading="lazy"
        />
        <div className="ticket-concert-copy">
          <span className="ticket-concert-kicker">{group.tickets.length} {translate("customer:myTicketsPage_ve")}</span>
          <h2>{group.concert ? concertTitle(group.concert) : group.concertTitle}</h2>
          <p>
            <CalendarDays size={15} /> {eventTime}
          </p>
          {group.concert ? (
            <p>
              <MapPin size={15} /> {group.concert.venueName}
            </p>
          ) : null}
        </div>
        <div className="ticket-concert-stats">
          <div>
            <span>{translate("customer:myTicketsPage_hopLe")}</span>
            <strong>{valid}</strong>
          </div>
          <div>
            <span>{translate("customer:myTicketsPage_daDung")}</span>
            <strong>{used}</strong>
          </div>
        </div>
        <ChevronDown className="ticket-concert-chevron" size={20} aria-hidden="true" />
      </button>

      {open ? (
        <div className="ticket-concert-details">
          {group.tickets.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} onOpen={() => onOpenTicket(ticket)} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function TicketRow({ ticket, onOpen }: { ticket: TicketWithConcert; onOpen: () => void }) {
  useTranslation();
  const statusClass = ticket.status.toLowerCase();
  return (
    <button className="ticket-row" type="button" onClick={onOpen}>
      <span className={`ticket-status status-${statusClass}`}>{statusLabel(ticket.status)}</span>
      <div>
        <strong>{ticket.ticketTypeName}</strong>
        <small>
          {translate("customer:myTicketsPage_maVe")} {ticket.id.slice(0, 8).toUpperCase()} {translate("customer:myTicketsPage_phatHanh")}{' '}
          {issuedDate.format(new Date(ticket.issuedAt))}
        </small>
      </div>
      {ticket.status === 'VALID' ? (
        <QRCodeSVG
          className="ticket-qr ticket-qr-small"
          value={ticket.qrCode}
          size={60}
          level="M"
          marginSize={2}
          title={translate("customer:myTicketsPage_qrCodeFor", { arg1: ticket.concert ? concertTitle(ticket.concert) : ticket.concertTitle })}
        />
      ) : (
        <TicketIcon size={22} aria-hidden="true" />
      )}
    </button>
  );
}

function TicketDetail({ ticket, onClose }: { ticket: TicketWithConcert; onClose: () => void }) {
  useTranslation();
  return (
    <ModalPortal>
      <div
        className="ticket-detail-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
      <section
        className="ticket-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-detail-title"
      >
        <button
          className="ticket-detail-close"
          type="button"
          onClick={onClose}
          aria-label={translate("customer:myTicketsPage_dongChiTietVe")}
        >
          {translate("customer:myTicketsPage_message")}
        </button>
        <p className="eyebrow">
          <span /> {translate("customer:myTicketsPage_eTicketDetails")}
        </p>
        <h2 id="ticket-detail-title">{ticket.concert ? concertTitle(ticket.concert) : ticket.concertTitle}</h2>
        <dl className="ticket-detail-facts">
          <div>
            <dt>{translate("customer:myTicketsPage_ticketId")}</dt>
            <dd>{ticket.id}</dd>
          </div>
          <div>
            <dt>{translate("customer:myTicketsPage_zone")}</dt>
            <dd>{ticket.ticketTypeName}</dd>
          </div>
          <div>
            <dt>{translate("customer:myTicketsPage_status")}</dt>
            <dd>{statusLabel(ticket.status)}</dd>
          </div>
          {ticket.concert ? (
            <div>
              <dt>{translate("customer:myTicketsPage_eventDate")}</dt>
              <dd>{eventDate.format(new Date(ticket.concert.eventDate))}</dd>
            </div>
          ) : null}
          {ticket.concert ? (
            <div>
              <dt>{translate("customer:myTicketsPage_venue")}</dt>
              <dd>{ticket.concert.venueName}</dd>
            </div>
          ) : null}
          <div>
            <dt>{translate("customer:myTicketsPage_issued")}</dt>
            <dd>{issuedDate.format(new Date(ticket.issuedAt))}</dd>
          </div>
        </dl>
        {ticket.status === 'VALID' ? (
          <div className="ticket-qr-payload">
            <QRCodeSVG
              className="ticket-qr"
              value={ticket.qrCode}
              size={180}
              level="M"
              marginSize={3}
              title={translate("customer:myTicketsPage_ticketQrCodeFor", { arg1: ticket.concert ? concertTitle(ticket.concert) : ticket.concertTitle })}
            />
            <div>
              <span>{translate("customer:myTicketsPage_ticketQrCode")}</span>
              <strong>{translate("customer:myTicketsPage_xuatTrinhTaiCong")}</strong>
              <p>
                {translate("customer:myTicketsPage_giuQrRiengTuNeuChiaSe")}
              </p>
            </div>
          </div>
        ) : null}
      </section>
      </div>
    </ModalPortal>
  );
}

function groupTickets(tickets: TicketWithConcert[]): ConcertTicketGroup[] {
  const groups = new Map<string, ConcertTicketGroup>();
  tickets.forEach((ticket) => {
    const current = groups.get(ticket.concertId);
    if (current) {
      current.tickets.push(ticket);
      return;
    }
    groups.set(ticket.concertId, {
      concertId: ticket.concertId,
      concertTitle: ticket.concertTitle,
      concert: ticket.concert,
      tickets: [ticket],
    });
  });
  return [...groups.values()].sort((a, b) => {
    const aTime = a.concert?.eventDate ? new Date(a.concert.eventDate).getTime() : 0;
    const bTime = b.concert?.eventDate ? new Date(b.concert.eventDate).getTime() : 0;
    return bTime - aTime;
  });
}

function statusLabel(status: TicketStatus) {
  if (status === 'VALID') return translate("customer:myTicketsPage_hopLe");
  if (status === 'USED') return translate("customer:myTicketsPage_daDung");
  if (status === 'CANCELLED') return translate("customer:myTicketsPage_daHuy");
  return translate("customer:myTicketsPage_daChuyen");
}
